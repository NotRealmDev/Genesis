(function(){
  const OFFICIAL_WISP_CLIENT_MODULE = "https://cdn.jsdelivr.net/npm/@mercuryworkshop/wisp-js@0.5.0/dist/wisp-client.mjs";
  const DEFAULT_WISP_URLS = [
    "wss://wisp.mercurywork.shop/",
    "wss://formative.icu/lively/"
  ];
  const BUILD_ID = "2026-09-13-official-wisp-r7";
  const KEY = "b75f9583b6d8fdc8b1e918a938878cb8d86e2f59817590301085b885cb0b89f8";

  const currentScript = document.currentScript;
  const BASE_URL = new URL("./", currentScript?.src || location.href);
  const assetPath = (name) => new URL(name, BASE_URL).pathname;
  const delay = (ms) => new Promise(resolve=>setTimeout(resolve,ms));
  const TRANSPORT_PROFILES = [[32,24,6],[20,16,4],[12,10,3]];
  const PROXY_ERROR_PATTERN = /Genesis upstream request failed|Internal Service Worker Error|Request failed with error code:\s*7|Could not connect to server|couldn['’]?t connect to server/i;

  let officialWispModulePromise = null;

  const codec = {
    encode(value){
      if(!value) return value;
      const bytes = new TextEncoder().encode(value);
      let out = "";
      for(let i=0;i<bytes.length;i++) out += String.fromCharCode(bytes[i] ^ KEY.charCodeAt(i % KEY.length));
      return btoa(out).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    },
    decode(value){
      if(!value) return value;
      let b64 = String(value).replace(/-/g,"+").replace(/_/g,"/");
      while(b64.length % 4) b64 += "=";
      let raw;
      try { raw = atob(b64); } catch { return value; }
      const bytes = new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++) bytes[i] = raw.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
      return new TextDecoder().decode(bytes);
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
    const official=await loadOfficialWispClient();
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

  async function createTransport(wispUrls,startIndex=0){
    const Transport=window.LibcurlTransport.LibcurlClient || window.LibcurlTransport.default || window.LibcurlTransport;
    let lastError=null;
    if(!wispUrls.length) throw new Error("Genesis has no valid Wisp transport endpoints configured.");

    for(let offset=0;offset<wispUrls.length;offset++){
      const wispIndex=(startIndex+offset)%wispUrls.length;
      const websocket=wispUrls[wispIndex];
      const probe=await probeWispEndpoint(websocket);
      if(!probe.ok){
        lastError=new Error("Wisp endpoint failed protocol handshake: "+websocket+" ("+probe.detail+")");
        console.warn(lastError.message);
        continue;
      }

      for(let profileIndex=0;profileIndex<TRANSPORT_PROFILES.length;profileIndex++){
        const connections=TRANSPORT_PROFILES[profileIndex];
        const transport=new Transport({websocket,transport:"wisp",connections});
        try{
          await withTimeout(transport.init(),18000,"The Genesis Wisp transport could not start at "+websocket);
          return {transport,connections,websocket,wispIndex,officialVerified:probe.verified};
        }catch(err){
          lastError=err;
          await disposeTransport(transport);
          if(profileIndex<TRANSPORT_PROFILES.length-1) await delay(180*(profileIndex+1));
        }
      }
    }

    throw lastError || new Error("The Genesis Wisp transport could not start.");
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

    get wisp(){ return this.activeWisp || this.wispUrls[this.wispIndex] || ""; },

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
        this.transportProfile=transportResult.connections;
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

        const controller=new api.Controller({serviceworker:sw,transport:this.transport});
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

    async recoverFrame(element,reason="frame recovery",options={}){
      await this.recover(reason,options);
      element.__genesisPrismFrame=null;
      return this.createFrame(element,{fresh:true});
    },

    healthy(){
      return !!(window.isSecureContext && navigator.serviceWorker?.controller && this.serviceWorker?.state === "activated" && this.transport && this.controller);
    },

    diagnostics(){
      return {
        build:BUILD_ID,
        searchEngine:"Brave Search",
        websiteTransport:"Wisp",
        officialWispClient:"@mercuryworkshop/wisp-js@0.5.0",
        officialWispVerified:this.officialWispVerified,
        secure:window.isSecureContext,
        online:navigator.onLine,
        worker:this.serviceWorker?.state || "none",
        controlled:!!navigator.serviceWorker?.controller,
        transport:!!this.transport,
        transportProfile:this.transportProfile ? [...this.transportProfile] : null,
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