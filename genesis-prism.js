(function(){
  const OFFICIAL_WISP_CLIENT_MODULE = "https://cdn.jsdelivr.net/npm/@mercuryworkshop/wisp-js@0.5.0/dist/wisp-client.mjs";
  // Scramjet's own current demo uses anura.pro. Keep a second independent
  // endpoint for automatic failover, and allow an owner-supplied endpoint
  // through genesisWispUrl to take priority over both.
  const DEFAULT_WISP_URLS = [
    "wss://anura.pro/",
    "wss://wisp.mercurywork.shop/"
  ];
  const BUILD_ID = "2026-09-18-wisp-startup-r16";
  const YOUTUBE_MEDIA_CHUNK_BYTES = 8 * 1024 * 1024;

  const currentScript = document.currentScript;
  const BASE_URL = new URL("./", currentScript?.src || location.href);
  const assetPath = (name) => new URL(name, BASE_URL).pathname;
  const delay = (ms) => new Promise(resolve=>setTimeout(resolve,ms));
  const TRANSPORT_HEALTH_URL = "https://example.com/";
  const TRANSIENT_STATUSES = new Set([408,425,500,502,503,504]);
  const PROXY_ERROR_PATTERN = /Genesis upstream request failed|Internal Service Worker Error|Request failed with error code:\s*7|Could not connect to server|couldn['’]?t connect to server/i;

  let officialWispModulePromise = null;

  // Scramjet's native codec is intentionally preserved. Custom XOR/Base64
  // codecs break URL rewriting on large apps such as YouTube because encoded
  // paths no longer have the shape expected by every Scramjet code path.
  const codec = {
    // Controller serializes these functions into an injected data: script.
    // Arrow expressions remain valid when Function#toString is embedded as a
    // property value; object-method syntax does not.
    encode: (value) => {
      if(!value) return value;
      return encodeURIComponent(value);
    },
    decode: (value) => {
      if(!value) return value;
      return decodeURIComponent(value);
    }
  };

  function withTimeout(promise,timeoutMs,message){
    let timer;
    return Promise.race([
      promise,
      new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error(message)),timeoutMs); })
    ]).finally(()=>clearTimeout(timer));
  }

  function normalizeWispUrl(value){
    try{
      const parsed=new URL(String(value||"").trim());
      if(parsed.protocol!=="wss:" && parsed.protocol!=="ws:") return "";
      if(!parsed.pathname.endsWith("/")) parsed.pathname += "/";
      return parsed.href;
    }catch{return "";}
  }

  function getWispUrls(){
    const urls=[];
    try{
      const custom=normalizeWispUrl(localStorage.getItem("genesisWispUrl"));
      if(custom) urls.push(custom);
    }catch{}
    for(const value of DEFAULT_WISP_URLS){
      const normalized=normalizeWispUrl(value);
      if(normalized && !urls.includes(normalized)) urls.push(normalized);
    }
    return urls;
  }

  function installBrowserRouting(){
    const braveSearch = (query) => "https://search.brave.com/search?q="+encodeURIComponent(String(query||"").trim());
    const normalize = (raw) => {
      raw=String(raw||"").trim();
      if(!raw || raw==="os://home") return "os://home";
      if(/^https?:\/\//i.test(raw)) return raw;
      const looksLikeSearch = /\s/.test(raw) || (!raw.includes(".") && !/^localhost(?::\d+)?(?:\/|$)/i.test(raw));
      return looksLikeSearch ? braveSearch(raw) : "https://"+raw;
    };
    const route = (url) => {
      let label="website";
      try{ label=new URL(url).hostname.replace(/^www\./,"") || "website"; }catch{}
      return {kind:"proxy",label,transport:"wisp"};
    };

    window.browserSearchURL = braveSearch;
    window.normalizeURL = normalize;
    window.getCompatibilityRoute = route;
    window.GenesisBrowserRouting = {search:"Brave Search",websites:"Wisp",normalize,route};
  }

  async function loadOfficialWispClient(){
    if(!officialWispModulePromise){
      officialWispModulePromise=import(OFFICIAL_WISP_CLIENT_MODULE).then(mod=>{
        const client=mod.client || mod.default?.client || mod.default || mod;
        const ClientConnection=client?.ClientConnection || mod.ClientConnection;
        if(typeof ClientConnection!=="function") throw new Error("Official Wisp client did not expose ClientConnection.");
        return {module:mod,client,ClientConnection};
      }).catch(err=>{
        console.warn("Official wisp-js client could not be loaded; Genesis will continue with Libcurl's Wisp transport.",err);
        return null;
      });
    }
    return officialWispModulePromise;
  }

  async function probeWispEndpoint(websocket){
    // A stalled CDN import must not block every endpoint before its handshake
    // timeout has even started. Libcurl can initialize without this extra probe.
    const official=await withTimeout(loadOfficialWispClient(),5000,"Optional Wisp probe library timed out.").catch(()=>null);
    if(!official) return {ok:true,verified:false};

    return new Promise(resolve=>{
      let settled=false;
      let connection=null;
      const finish=(ok,detail="")=>{
        if(settled) return;
        settled=true;
        clearTimeout(timer);
        try{ connection?.close?.(); }catch{}
        resolve({ok,verified:true,detail});
      };
      const timer=setTimeout(()=>finish(false,"official Wisp handshake timed out"),6000);
      try{
        connection=new official.ClientConnection(websocket,{wisp_version:2});
        connection.onopen=()=>finish(true,"official Wisp handshake succeeded");
        connection.onerror=()=>finish(false,"official Wisp handshake failed");
        connection.onclose=()=>{ if(!settled) finish(false,"official Wisp connection closed before opening"); };
      }catch(err){
        finish(false,err?.message||String(err));
      }
    });
  }

  function waitForActivated(worker,timeoutMs=7000){
    if(!worker) return Promise.reject(new Error("Genesis service worker did not install."));
    if(worker.state === "activated") return Promise.resolve(worker);
    return new Promise((resolve,reject)=>{
      let finished=false;
      const finish=(ok,value)=>{
        if(finished) return;
        finished=true;
        clearTimeout(timer);
        worker.removeEventListener("statechange",onState);
        ok?resolve(value):reject(value);
      };
      const onState=()=>{
        if(worker.state === "activated") finish(true,worker);
        else if(worker.state === "redundant") finish(false,new Error("Genesis service worker update was replaced."));
      };
      const timer=setTimeout(()=>finish(false,new Error("Genesis service worker update is taking too long.")),timeoutMs);
      worker.addEventListener("statechange",onState);
    });
  }

  async function selectUsableWorker(registration){
    const newest = registration.installing || registration.waiting;
    if(newest){
      try{ await waitForActivated(newest); }catch(err){
        if(!registration.active) throw err;
        console.warn("Genesis is continuing with the active service worker while the update settles.",err);
      }
    }

    let readyRegistration=null;
    try{
      readyRegistration=await withTimeout(navigator.serviceWorker.ready,15000,"Genesis service worker activation timed out.");
    }catch(err){ if(!registration.active) throw err; }

    const worker=[navigator.serviceWorker.controller,registration.active,readyRegistration?.active]
      .find(candidate=>candidate?.state === "activated");
    if(worker) return worker;

    const candidate=registration.installing || registration.waiting;
    if(candidate) return waitForActivated(candidate,8000);
    throw new Error("Genesis could not find an active service worker. Refresh once and try again.");
  }

  async function disposeTransport(transport){
    if(!transport) return;
    for(const method of ["close","destroy","dispose","shutdown"]){
      if(typeof transport[method] !== "function") continue;
      try{ await Promise.resolve(transport[method]()); }catch{}
      break;
    }
  }

  function copyReplayBody(body){
    if(body==null) return null;
    if(typeof body==="string") return body;
    if(body instanceof ArrayBuffer) return body.slice(0);
    if(ArrayBuffer.isView(body)){
      return body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength);
    }
    if(typeof Blob!=="undefined" && body instanceof Blob){
      return body.slice(0,body.size,body.type);
    }
    if(typeof URLSearchParams!=="undefined" && body instanceof URLSearchParams){
      return new URLSearchParams(body);
    }
    return undefined;
  }

  function isYouTubeHost(host){
    return host==="youtu.be" || host==="youtube.com" || host.endsWith(".youtube.com") ||
      host==="youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com") ||
      host==="googlevideo.com" || host.endsWith(".googlevideo.com") ||
      host==="ytimg.com" || host.endsWith(".ytimg.com");
  }

  function youtubeVideoId(value){
    try{
      const remote=value instanceof URL?value:new URL(String(value||""));
      const host=remote.hostname.toLowerCase().replace(/^www\./,"");
      let id="";
      if(host==="youtu.be"){
        id=remote.pathname.split("/").filter(Boolean)[0]||"";
      }else if(host==="youtube.com" || host.endsWith(".youtube.com")){
        if(remote.pathname==="/watch")id=remote.searchParams.get("v")||"";
        else{
          const match=remote.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/i);
          id=match?.[1]||"";
        }
      }
      return /^[A-Za-z0-9_-]{6,20}$/.test(id)?id:"";
    }catch{return "";}
  }

  function youtubeStartSeconds(value){
    try{
      const remote=value instanceof URL?value:new URL(String(value||""));
      const raw=remote.searchParams.get("start")||remote.searchParams.get("t")||"";
      if(/^\d+$/.test(raw))return Math.max(0,Number(raw)||0);
      const match=raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
      if(!match)return 0;
      return (Number(match[1])||0)*3600+(Number(match[2])||0)*60+(Number(match[3])||0);
    }catch{return 0;}
  }

  function youtubeEmbedFallbacks(value){
    const id=youtubeVideoId(value);
    if(!id)return [];
    const start=youtubeStartSeconds(value);
    let parentOrigin="";
    try{
      if(/^https?:$/.test(location.protocol))parentOrigin=location.origin;
    }catch{}
    return ["https://www.youtube-nocookie.com","https://www.youtube.com"].map(origin=>{
      const embed=new URL("/embed/"+id,origin);
      embed.searchParams.set("autoplay","1");
      embed.searchParams.set("playsinline","1");
      embed.searchParams.set("rel","0");
      embed.searchParams.set("enablejsapi","1");
      if(parentOrigin)embed.searchParams.set("origin",parentOrigin);
      if(start>0)embed.searchParams.set("start",String(start));
      return embed.href;
    });
  }

  function youtubeEmbedFallback(value){
    return youtubeEmbedFallbacks(value)[0]||"";
  }

  function rawHeaderValue(headers,name){
    const wanted=String(name||"").toLowerCase();
    for(const entry of headers||[]){
      if(!Array.isArray(entry) || String(entry[0]||"").toLowerCase()!==wanted) continue;
      return String(entry[1]||"");
    }
    return "";
  }

  function isYouTubeMediaRequest(remote,headers){
    const host=remote.hostname.toLowerCase();
    return host==="googlevideo.com" || host.endsWith(".googlevideo.com") ||
      /(?:^|\/)videoplayback(?:\/|$)/i.test(remote.pathname);
  }

  function isYouTubePlaybackRequest(remote){
    const host=remote.hostname.toLowerCase();
    return (host==="googlevideo.com" || host.endsWith(".googlevideo.com")) &&
      /(?:^|\/)videoplayback(?:\/|$)/i.test(remote.pathname);
  }

  function setRawHeader(headers,name,value){
    const wanted=String(name||"").toLowerCase();
    const next=[];
    let replaced=false;
    for(const entry of headers||[]){
      if(!Array.isArray(entry) || String(entry[0]||"").toLowerCase()!==wanted){
        next.push(entry);
      }else if(!replaced){
        next.push([entry[0],value]);
        replaced=true;
      }
    }
    if(!replaced)next.push([name,value]);
    return next;
  }

  function parseMediaRange(value){
    const match=String(value||"").trim().match(/^(?:bytes=)?(\d+)-(\d*)$/i);
    if(!match)return null;
    const start=Number(match[1]);
    const end=match[2]?Number(match[2]):null;
    if(!Number.isSafeInteger(start) || start<0 || (end!==null && (!Number.isSafeInteger(end)||end<start)))return null;
    return {start,end};
  }

  function normalizeYouTubeMediaRequest(remote,method,headers){
    const originalRange=rawHeaderValue(headers,"range");
    const queryRange=remote.searchParams.get("range")||"";
    if(!isYouTubePlaybackRequest(remote) || String(method||"GET").toUpperCase()!=="GET"){
      return {remote,headers,originalRange,queryRange,appliedRange:""};
    }

    // Actual videoplayback streams can reject unbounded/full-file reads.
    // Give only that endpoint a finite byte window; googlevideo health probes
    // such as /generate_204 must keep their original no-body semantics.
    const parsed=parseMediaRange(originalRange)||parseMediaRange(queryRange)||{start:0,end:null};
    const maxEnd=parsed.start+YOUTUBE_MEDIA_CHUNK_BYTES-1;
    let end=parsed.end===null?maxEnd:Math.min(parsed.end,maxEnd);
    const contentLength=Number(remote.searchParams.get("clen"));
    if(Number.isSafeInteger(contentLength)&&contentLength>0)end=Math.min(end,contentLength-1);
    if(end<parsed.start)end=parsed.start;
    const appliedRange=`bytes=${parsed.start}-${end}`;
    return {
      remote,
      headers:setRawHeader(headers,"Range",appliedRange),
      originalRange,
      queryRange,
      appliedRange
    };
  }

  function mayReplayRequest(remote,method,body){
    const verb=String(method||"GET").toUpperCase();
    if(verb==="GET" || verb==="HEAD") return true;
    if(verb!=="POST" || copyReplayBody(body)===undefined) return false;
    const host=remote.hostname.toLowerCase();
    return isYouTubeHost(host) &&
      /^\/youtubei\/v1\/(?:browse|next|player|search|guide|navigation\/resolve_url)(?:\/|$)/.test(remote.pathname);
  }

  function shouldRetryResponse(remote,method,body,status){
    if(!mayReplayRequest(remote,method,body)) return false;
    return TRANSIENT_STATUSES.has(Number(status));
  }

  async function releaseResponseBody(response){
    try{
      if(response?.body && typeof response.body.cancel==="function"){
        await response.body.cancel();
      }
    }catch{}
  }

  class ResilientWispTransport {
    constructor(Transport,wispUrls,startIndex=0){
      this.Transport=Transport;
      this.wispUrls=[...wispUrls];
      this.startIndex=startIndex;
      this.activeIndex=startIndex;
      this.client=null;
      this.ready=false;
      this.officialVerified=false;
      this.stats={
        logicalRequests:0,
        attempts:0,
        completed:0,
        failed:0,
        retries:0,
        failovers:0,
        websocketFailures:0,
        youtubeMediaRequests:0,
        youtubeMediaResponses:0,
        youtubeMediaPartialResponses:0,
        youtubeMediaFailures:0,
        youtubeMediaInvalidPartialResponses:0,
        youtubeMediaLastStatus:0,
        youtubeMediaLastRequestRange:"",
        youtubeMediaLastContentRange:"",
        youtubeMediaWisp:"",
        youtubeMediaTrace:[],
        active:0,
        lastStatus:0,
        lastHost:"",
        lastError:"",
        lastEventAt:0
      };
    }

    get activeWisp(){
      return this.wispUrls[this.activeIndex]||"";
    }

    emit(type,extra={}){
      this.stats.lastEventAt=Date.now();
      const detail={type,wisp:this.activeWisp,stats:this.diagnostics(),...extra};
      try{ window.dispatchEvent(new CustomEvent("genesis:proxy-event",{detail})); }catch{}
    }

    async makeClient(index,verifyRoute=true){
      const websocket=this.wispUrls[index];
      const probe=await probeWispEndpoint(websocket);
      if(!probe.ok) throw new Error("Wisp handshake failed at "+websocket+": "+probe.detail);

      // This is the same constructor shape used by Scramjet's official
      // bootstrap. Libcurl supplies HTTP, media and WebSocket traffic over Wisp.
      const client=new this.Transport({wisp:websocket});
      try{
      await withTimeout(client.init(),18000,"The Genesis Wisp transport could not start at "+websocket);

      if(verifyRoute){
        const health=await withTimeout(
          client.request(new URL(TRANSPORT_HEALTH_URL),"HEAD",null,[["accept","*/*"]],undefined),
          12000,
          "The Wisp endpoint opened but could not reach the web."
        );
        const ok=health && Number(health.status)>=200 && Number(health.status)<500;
        await releaseResponseBody(health);
        if(!ok) throw new Error("The Wisp route health check returned "+(health?.status||"an invalid response")+".");
      }

      return {client,verified:!!probe.verified};
      }catch(error){
        // Dispose rejected clients instead of retaining their socket/worker
        // while the next endpoint is being initialized.
        await withTimeout(disposeTransport(client),3000,"Rejected Wisp client cleanup timed out.").catch(()=>{});
        throw error;
      }
    }

    async init(){
      let lastError=null;
      for(let offset=0;offset<this.wispUrls.length;offset++){
        const index=(this.startIndex+offset)%this.wispUrls.length;
        try{
          const result=await this.makeClient(index,true);
          this.client=result.client;
          this.activeIndex=index;
          this.officialVerified=result.verified;
          this.ready=true;
          this.emit("ready");
          return;
        }catch(err){
          lastError=err;
          this.emit("endpoint-rejected",{host:new URL(this.wispUrls[index]).hostname,error:err?.message||String(err)});
        }
      }
      throw lastError||new Error("No Genesis Wisp endpoint passed its route health check.");
    }

    async request(remote,method,body,headers,signal){
      if(!this.client) throw new Error("Genesis Wisp transport is not ready.");
      this.stats.logicalRequests++;
      this.stats.active++;
      this.stats.lastHost=remote.hostname;
      const youtubeMedia=isYouTubeMediaRequest(remote,headers);
      const normalizedMedia=normalizeYouTubeMediaRequest(remote,method,headers);
      const requestRemote=normalizedMedia.remote;
      const requestHeaders=normalizedMedia.headers;
      const mediaTrace=youtubeMedia?{
        method:String(method||"GET").toUpperCase(),
        host:remote.hostname,
        path:remote.pathname,
        queryRange:normalizedMedia.queryRange,
        requestRange:normalizedMedia.originalRange,
        appliedRange:normalizedMedia.appliedRange,
        contentLengthHint:remote.searchParams.get("clen")||"",
        client:remote.searchParams.get("c")||"",
        ump:remote.searchParams.has("ump"),
        status:0,
        contentRange:"",
        responseLength:"",
        contentType:""
      }:null;
      if(youtubeMedia){
        this.stats.youtubeMediaRequests++;
        this.stats.youtubeMediaLastRequestRange=normalizedMedia.appliedRange||normalizedMedia.originalRange;
        this.stats.youtubeMediaWisp=this.activeWisp;
        this.stats.youtubeMediaTrace.push(mediaTrace);
        if(this.stats.youtubeMediaTrace.length>24)this.stats.youtubeMediaTrace.shift();
      }
      const replayBody=copyReplayBody(body);
      const canRetry=mayReplayRequest(remote,method,body) &&
        (body==null || replayBody!==undefined);
      const firstClient=this.client;

      try{
        this.stats.attempts++;
        let response;
        try{
          response=await firstClient.request(requestRemote,method,body,requestHeaders,signal);
        }catch(err){
          if(!canRetry || signal?.aborted) throw err;
          this.stats.retries++;
          // libcurl.js owns one process-wide Wisp route. Creating another
          // client here changes the egress path for every subsequent request,
          // which invalidates YouTube's signed googlevideo URLs. Retry the
          // request on the same route; frame recovery rotates the entire page
          // as one clean session if that route is truly unavailable.
          this.emit("retry",{host:remote.hostname,reason:err?.message||String(err),route:"same-wisp",media:youtubeMedia});
          await delay(120);
          this.stats.attempts++;
          response=await firstClient.request(requestRemote,method,replayBody,requestHeaders,signal);
        }

        if(canRetry && !signal?.aborted && shouldRetryResponse(remote,method,body,response?.status)){
          const retryStatus=Number(response?.status)||0;
          await releaseResponseBody(response);
          this.stats.retries++;
          this.emit("retry",{host:remote.hostname,status:retryStatus,reason:"transient response",route:"same-wisp",media:youtubeMedia});
          await delay(120);
          this.stats.attempts++;
          response=await firstClient.request(requestRemote,method,replayBody,requestHeaders,signal);
        }

        this.stats.completed++;
        this.stats.lastStatus=Number(response?.status)||0;
        if(youtubeMedia){
          const contentRange=rawHeaderValue(response?.headers,"content-range");
          this.stats.youtubeMediaResponses++;
          this.stats.youtubeMediaLastStatus=this.stats.lastStatus;
          this.stats.youtubeMediaLastContentRange=contentRange;
          mediaTrace.status=this.stats.lastStatus;
          mediaTrace.contentRange=contentRange;
          mediaTrace.responseLength=rawHeaderValue(response?.headers,"content-length");
          mediaTrace.contentType=rawHeaderValue(response?.headers,"content-type");
          if(this.stats.lastStatus===206){
            this.stats.youtubeMediaPartialResponses++;
            if(!contentRange) this.stats.youtubeMediaInvalidPartialResponses++;
          }
        }
        this.stats.lastError="";
        this.emit("response",{host:remote.hostname,status:this.stats.lastStatus,media:youtubeMedia});
        return response;
      }catch(err){
        this.stats.failed++;
        if(youtubeMedia) this.stats.youtubeMediaFailures++;
        this.stats.lastError=err?.message||String(err);
        this.emit("failure",{host:remote.hostname,error:this.stats.lastError,media:youtubeMedia});
        throw err;
      }finally{
        this.stats.active=Math.max(0,this.stats.active-1);
      }
    }

    connect(url,protocols,requestHeaders,onopen,onmessage,onclose,onerror){
      if(!this.client) throw new Error("Genesis Wisp transport is not ready.");
      const client=this.client;
      return client.connect(
        url,protocols,requestHeaders,onopen,onmessage,onclose,
        error=>{
          this.stats.websocketFailures++;
          this.stats.lastHost=url.hostname;
          this.stats.lastError=String(error||"WebSocket transport error");
          this.emit("websocket-failure",{host:url.hostname,error:this.stats.lastError});
          // Keep the active route stable for HTTP media already signed to this
          // Wisp egress. The page-level repair path can rebuild the complete
          // session on another endpoint when a WebSocket is essential.
          onerror(error);
        }
      );
    }

    async meta(){
      if(typeof this.client?.meta==="function") return this.client.meta();
    }

    async healthCheck(){
      if(!this.client) throw new Error("Genesis Wisp transport is not ready.");
      const started=performance.now();
      const response=await withTimeout(
        this.client.request(new URL(TRANSPORT_HEALTH_URL),"HEAD",null,[["accept","*/*"]],undefined),
        12000,
        "Genesis Wisp route health check timed out."
      );
      const status=Number(response?.status)||0;
      await releaseResponseBody(response);
      if(status<200 || status>=500) throw new Error("Genesis Wisp route health check returned "+status+".");
      return {ok:true,status,latencyMs:Math.round(performance.now()-started),wisp:this.activeWisp};
    }

    diagnostics(){
      return {
        ...this.stats,
        activeIndex:this.activeIndex,
        wispCount:this.wispUrls.length,
        ready:this.ready,
        routePolicy:"stable-session",
        midSessionFailover:false
      };
    }

    async close(){
      this.ready=false;
      const client=this.client;
      this.client=null;
      await disposeTransport(client);
    }
  }

  async function createTransport(wispUrls,startIndex=0){
    if(!wispUrls.length) throw new Error("Genesis has no valid Wisp transport endpoints configured.");
    const Transport=window.LibcurlTransport.LibcurlClient || window.LibcurlTransport.default || window.LibcurlTransport;
    const transport=new ResilientWispTransport(Transport,wispUrls,startIndex);
    await transport.init();
    return {
      transport,
      connections:null,
      websocket:transport.activeWisp,
      wispIndex:transport.activeIndex,
      officialVerified:transport.officialVerified
    };
  }

  const GenesisPrism = {
    build:BUILD_ID,
    controller:null,
    transport:null,
    transportProfile:null,
    officialWispVerified:false,
    serviceWorker:null,
    registration:null,
    readyPromise:null,
    recoveryPromise:null,
    controllerChangeHandler:null,
    proxyErrorMessageHandler:null,
    lastRecoveryReason:"",
    wispUrls:getWispUrls(),
    wispIndex:0,
    activeWisp:"",
    frameRecoveryState:new WeakMap(),
    codec,
    youtubeVideoId,
    youtubeEmbedFallback,
    youtubeEmbedFallbacks,

    get wisp(){ return this.transport?.activeWisp || this.activeWisp || this.wispUrls[this.wispIndex] || ""; },

    refreshWispUrls(){
      const previous=this.activeWisp;
      this.wispUrls=getWispUrls();
      if(previous){
        const index=this.wispUrls.indexOf(previous);
        if(index>=0) this.wispIndex=index;
      }
      if(this.wispIndex>=this.wispUrls.length) this.wispIndex=0;
      return this.wispUrls;
    },

    rotateWisp(){
      this.refreshWispUrls();
      if(this.wispUrls.length>1) this.wispIndex=(this.wispIndex+1)%this.wispUrls.length;
      this.activeWisp=this.wispUrls[this.wispIndex]||"";
      return this.activeWisp;
    },

    bindControllerRecovery(){
      if(this.controllerChangeHandler) return;
      this.controllerChangeHandler=()=>{
        const next=navigator.serviceWorker.controller;
        if(!next || !this.controller || next===this.serviceWorker) return;
        this.serviceWorker=next;
        try{
          this.controller.serviceWorkerController=next;
          if(typeof this.controller.setupMessagePort === "function") this.controller.setupMessagePort();
        }catch(err){ console.warn("Genesis could not rebind the updated service worker.",err); }
      };
      navigator.serviceWorker.addEventListener("controllerchange",this.controllerChangeHandler);
    },

    readFrameProxyFailure(element){
      try{
        const text=(element?.contentDocument?.body?.innerText||"").trim();
        if(text && PROXY_ERROR_PATTERN.test(text)) return text.slice(0,700);
      }catch{}
      return "";
    },

    findFrameForSource(source){
      if(!source) return null;
      for(const frame of document.querySelectorAll("iframe")){
        try{ if(frame.contentWindow===source) return frame; }catch{}
      }
      return null;
    },

    async autoRecoverFrame(element,message){
      if(!element || /(?:^|\/)browser-tab\.html$/i.test(location.pathname) || element.id!=="browserFrame") return;
      let state=this.frameRecoveryState.get(element);
      if(!state){ state={attempts:0,recovering:false}; this.frameRecoveryState.set(element,state); }
      if(state.recovering) return;
      if(state.attempts>=Math.max(2,this.wispUrls.length)){
        const status=document.getElementById("browserStatus");
        if(status) status.textContent="Wisp could not reach this page after failover";
        return;
      }

      const target=(document.getElementById("browserAddress")?.value||"").trim();
      if(!target || target==="os://home") return;
      state.recovering=true;
      state.attempts++;
      const status=document.getElementById("browserStatus");
      if(status) status.textContent="Wisp connection failed · switching endpoint…";

      try{
        const freshFrame=await this.recoverFrame(element,"upstream connection failure: "+message,{rotateWisp:true});
        if(status) status.textContent="Wisp switched · retrying page…";
        if(typeof window.browserNavigate === "function") await Promise.resolve(window.browserNavigate(target,false,false,{forceProxy:true}));
        else if(freshFrame?.go) freshFrame.go(target);
      }catch(err){
        console.error("Genesis automatic Wisp failover failed:",err);
        if(status) status.textContent="Genesis Wisp repair failed · "+(err?.message||String(err));
      }finally{ state.recovering=false; }
    },

    bindFrameRecovery(element){
      if(!element || element.__genesisRecoveryBound) return;
      element.__genesisRecoveryBound=true;
      const state={attempts:0,recovering:false};
      this.frameRecoveryState.set(element,state);
      element.addEventListener("load",()=>{
        if(/(?:^|\/)browser-tab\.html$/i.test(location.pathname)) return;
        const failure=this.readFrameProxyFailure(element);
        const current=this.frameRecoveryState.get(element)||state;
        if(failure){
          this.autoRecoverFrame(element,failure).catch(err=>console.error("Genesis frame recovery error:",err));
          return;
        }
        if(!current.recovering && String(element.src||"").includes(assetPath("prism/"))) current.attempts=0;
      });
    },

    bindProxyErrorMessages(){
      if(this.proxyErrorMessageHandler) return;
      this.proxyErrorMessageHandler=(event)=>{
        if(event.origin!==location.origin) return;
        const payload=event.data?.$genesisProxyError;
        if(!payload || typeof payload!=="object" || /(?:^|\/)browser-tab\.html$/i.test(location.pathname)) return;
        const frame=this.findFrameForSource(event.source);
        if(!frame) return;
        this.autoRecoverFrame(frame,payload.message||"Genesis upstream connection failed")
          .catch(err=>console.error("Genesis proxy error recovery failed:",err));
      };
      window.addEventListener("message",this.proxyErrorMessageHandler);
    },

    async init(){
      if(this.controller) return this.controller;
      if(this.readyPromise) return this.readyPromise;

      this.readyPromise=(async()=>{
        if(!window.isSecureContext) throw new Error("Prism requires HTTPS (or localhost).");
        if(!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
        if(!window.$scramjet) throw new Error("prism.js did not load.");
        if(!window.$scramjetController?.Controller) throw new Error("prism.api.js did not load.");
        if(!window.LibcurlTransport) throw new Error("libby.js did not load.");

        const swUrl=new URL("servy.js",BASE_URL);
        swUrl.searchParams.set("build",BUILD_ID);
        const registration=await navigator.serviceWorker.register(swUrl.href,{scope:BASE_URL.pathname,type:"classic",updateViaCache:"none"});
        this.registration=registration;

        const sw=await selectUsableWorker(registration);
        this.serviceWorker=sw;
        this.bindControllerRecovery();
        this.bindProxyErrorMessages();
        this.refreshWispUrls();

        const transportResult=await createTransport(this.wispUrls,this.wispIndex);
        this.transport=transportResult.transport;
        this.transportProfile="official-default";
        this.wispIndex=transportResult.wispIndex;
        this.activeWisp=transportResult.websocket;
        this.officialWispVerified=!!transportResult.officialVerified;

        const api=window.$scramjetController;
        api.config.prefix=assetPath("prism/");
        api.config.scramjetPath=assetPath("prism.js");
        api.config.injectPath=assetPath("prism.inject.js");
        api.config.wasmPath=assetPath("prism.wasm");
        api.config.codec.encode=codec.encode;
        api.config.codec.decode=codec.decode;

        const controller=new api.Controller({
          serviceworker:sw,
          transport:this.transport,
          // Source-map calls must never be emitted before the injected client
          // has installed its map receiver. They are diagnostic-only and are
          // not required for rewriting; disabling them also removes substantial
          // overhead on script-heavy sites.
          scramjetConfig:{flags:{sourcemaps:false}}
        });
        await withTimeout(controller.wait(),25000,"The Genesis browser controller did not respond.");
        this.controller=controller;

        const current=navigator.serviceWorker.controller;
        if(current && current!==this.serviceWorker){
          this.serviceWorker=current;
          controller.serviceWorkerController=current;
          if(typeof controller.setupMessagePort === "function") controller.setupMessagePort();
          await delay(40);
        }
        return controller;
      })().catch(async err=>{
        const failedTransport=this.transport;
        this.controller=null;
        this.transport=null;
        this.transportProfile=null;
        this.officialWispVerified=false;
        this.readyPromise=null;
        await disposeTransport(failedTransport);
        throw err;
      });

      return this.readyPromise;
    },

    async recover(reason="manual recovery",options={}){
      if(this.recoveryPromise) return this.recoveryPromise;
      this.recoveryPromise=(async()=>{
        this.lastRecoveryReason=String(reason||"manual recovery");
        const oldTransport=this.transport;
        if(options.rotateWisp) this.rotateWisp();
        this.controller=null;
        this.transport=null;
        this.transportProfile=null;
        this.officialWispVerified=false;
        this.readyPromise=null;

        try{
          if(this.registration) await withTimeout(this.registration.update(),7000,"Service worker update check timed out.");
        }catch(err){ console.warn("Genesis recovery continued after the service worker update check failed.",err); }

        await disposeTransport(oldTransport);
        await delay(120);
        return this.init();
      })().finally(()=>{ this.recoveryPromise=null; });
      return this.recoveryPromise;
    },

    async createFrame(element,options={}){
      const controller=await this.init();
      this.bindFrameRecovery(element);
      if(options.fresh) element.__genesisPrismFrame=null;
      if(element.__genesisPrismFrame) return element.__genesisPrismFrame;
      const frame=controller.createFrame(element);
      element.__genesisPrismFrame=frame;
      return frame;
    },

    async resetFrameElement(element){
      if(!element) throw new Error("Genesis needs an iframe to reset.");
      element.__genesisPrismFrame=null;

      try{ element.contentWindow?.stop?.(); }catch{}
      const current=String(element.getAttribute?.("src")||element.src||"");
      if(current==="about:blank") return;

      await new Promise(resolve=>{
        let finished=false;
        const done=()=>{
          if(finished) return;
          finished=true;
          clearTimeout(timer);
          try{ element.removeEventListener("load",done); }catch{}
          resolve();
        };
        const timer=setTimeout(done,1800);
        try{
          element.addEventListener("load",done,{once:true});
          element.removeAttribute?.("srcdoc");
          element.src="about:blank";
        }catch{ done(); }
      });
    },

    async recoverFrame(element,reason="frame recovery",options={}){
      // Detach the old proxied document before a new Controller owns this
      // iframe. Otherwise its already-encoded /prism/ URL can be encoded again.
      await this.resetFrameElement(element);
      await this.recover(reason,options);
      element.__genesisPrismFrame=null;
      return this.createFrame(element,{fresh:true});
    },

    healthy(){
      return !!(window.isSecureContext && navigator.serviceWorker?.controller && this.serviceWorker?.state === "activated" && this.transport?.ready && this.controller);
    },

    async healthCheck(){
      await this.init();
      if(typeof this.transport?.healthCheck!=="function") throw new Error("Genesis transport health check is unavailable.");
      return this.transport.healthCheck();
    },

    async persistSession(){
      if(!this.controller) return false;
      if(typeof this.controller.persistCookies==="function"){
        await this.controller.persistCookies();
      }
      return true;
    },

    diagnostics(){
      return {
        build:BUILD_ID,
        searchEngine:"Brave Search",
        websiteTransport:"Wisp",
        sessionPersistence:"indexeddb-cookies-and-origin-storage",
        scramjetFlags:{sourcemaps:false},
        officialWispClient:"@mercuryworkshop/wisp-js@0.5.0",
        officialWispVerified:this.officialWispVerified,
        secure:window.isSecureContext,
        online:navigator.onLine,
        worker:this.serviceWorker?.state || "none",
        controlled:!!navigator.serviceWorker?.controller,
        transport:!!this.transport,
        transportProfile:this.transportProfile,
        requests:this.transport?.diagnostics?.() || null,
        wisp:this.wisp,
        wispIndex:this.wispIndex,
        wispCount:this.wispUrls.length,
        controller:!!this.controller,
        recovering:!!this.recoveryPromise,
        healthy:this.healthy(),
        lastRecoveryReason:this.lastRecoveryReason
      };
    }
  };

  installBrowserRouting();
  window.addEventListener("DOMContentLoaded",installBrowserRouting,{once:true});
  window.GenesisPrism=GenesisPrism;
})();
