(function(){
  const DEFAULT_WISP_URLS = [
    "wss://formative.icu/lively/",
    "wss://wisp.mercurywork.shop/"
  ];
  const BUILD_ID = "2026-09-13-wisp-failover-r6";
  const KEY = "b75f9583b6d8fdc8b1e918a938878cb8d86e2f59817590301085b885cb0b89f8";

  const currentScript = document.currentScript;
  const BASE_URL = new URL("./", currentScript?.src || location.href);
  const assetPath = (name) => new URL(name, BASE_URL).pathname;
  const delay = (ms) => new Promise(resolve=>setTimeout(resolve,ms));
  const TRANSPORT_PROFILES = [
    [32,24,6],
    [20,16,4],
    [12,10,3]
  ];
  const PROXY_ERROR_PATTERN = /Genesis upstream request failed|Internal Service Worker Error|Request failed with error code:\s*7|Could not connect to server|couldn['’]?t connect to server/i;

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
      readyRegistration=await withTimeout(
        navigator.serviceWorker.ready,
        15000,
        "Genesis service worker activation timed out."
      );
    }catch(err){
      if(!registration.active) throw err;
    }

    const worker=[
      navigator.serviceWorker.controller,
      registration.active,
      readyRegistration?.active
    ].find(candidate=>candidate?.state === "activated");
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

      for(let profileIndex=0;profileIndex<TRANSPORT_PROFILES.length;profileIndex++){
        const connections=TRANSPORT_PROFILES[profileIndex];
        const transport=new Transport({
          websocket,
          transport:"wisp",
          connections
        });
        try{
          await withTimeout(
            transport.init(),
            18000,
            "The Genesis transport could not start at "+websocket
          );
          return {transport,connections,websocket,wispIndex};
        }catch(err){
          lastError=err;
          await disposeTransport(transport);
          if(profileIndex<TRANSPORT_PROFILES.length-1) await delay(180*(profileIndex+1));
        }
      }
    }

    throw lastError || new Error("The Genesis transport could not start.");
  }

  const GenesisPrism = {
    build:BUILD_ID,
    controller:null,
    transport:null,
    transportProfile:null,
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

    get wisp(){
      return this.activeWisp || this.wispUrls[this.wispIndex] || "";
    },

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
          if(typeof this.controller.setupMessagePort === "function"){
            this.controller.setupMessagePort();
          }
        }catch(err){
          console.warn("Genesis could not rebind the updated service worker.",err);
        }
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
      if(!element || /(?:^|\/)browser-tab\.html$/i.test(location.pathname)) return;
      if(element.id!=="browserFrame") return;

      let state=this.frameRecoveryState.get(element);
      if(!state){
        state={attempts:0,recovering:false};
        this.frameRecoveryState.set(element,state);
      }
      if(state.recovering) return;
      if(state.attempts>=Math.max(2,this.wispUrls.length)){
        const status=document.getElementById("browserStatus");
        if(status) status.textContent="Proxy transport could not reach this page after failover";
        return;
      }

      const target=(document.getElementById("browserAddress")?.value||"").trim();
      if(!target || target==="os://home") return;

      state.recovering=true;
      state.attempts++;
      const status=document.getElementById("browserStatus");
      if(status) status.textContent="Connection failed · switching Genesis transport…";

      try{
        const freshFrame=await this.recoverFrame(element,"upstream connection failure: "+message,{rotateWisp:true});
        if(status) status.textContent="Transport switched · retrying page…";
        if(typeof window.browserNavigate === "function"){
          await Promise.resolve(window.browserNavigate(target,false,false,{forceProxy:true}));
        }else if(freshFrame?.go){
          freshFrame.go(target);
        }
      }catch(err){
        console.error("Genesis automatic transport failover failed:",err);
        if(status) status.textContent="Genesis transport repair failed · "+(err?.message||String(err));
      }finally{
        state.recovering=false;
      }
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
        if(!payload || typeof payload!=="object") return;
        if(/(?:^|\/)browser-tab\.html$/i.test(location.pathname)) return;
        const frame=this.findFrameForSource(event.source);
        if(!frame) return;
        this.autoRecoverFrame(frame,payload.message||"Genesis upstream connection failed").catch(err=>console.error("Genesis proxy error recovery failed:",err));
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
        const registration=await navigator.serviceWorker.register(swUrl.href,{
          scope:BASE_URL.pathname,
          type:"classic",
          updateViaCache:"none"
        });
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
        this.readyPromise=null;

        try{
          if(this.registration) await withTimeout(this.registration.update(),7000,"Service worker update check timed out.");
        }catch(err){
          console.warn("Genesis recovery continued after the service worker update check failed.",err);
        }

        await disposeTransport(oldTransport);
        await delay(120);
        return this.init();
      })().finally(()=>{
        this.recoveryPromise=null;
      });

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
      return !!(
        window.isSecureContext &&
        navigator.serviceWorker?.controller &&
        this.serviceWorker?.state === "activated" &&
        this.transport &&
        this.controller
      );
    },

    diagnostics(){
      return {
        build:BUILD_ID,
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

  window.GenesisPrism=GenesisPrism;
})();
