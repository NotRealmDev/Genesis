(function(){
  const WISP_URL = "wss://formative.icu/lively/";
  const BUILD_ID = "2026-09-13-brave-recovery-r5";
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

  async function createTransport(){
    const Transport=window.LibcurlTransport.LibcurlClient || window.LibcurlTransport.default || window.LibcurlTransport;
    let lastError=null;

    for(let i=0;i<TRANSPORT_PROFILES.length;i++){
      const connections=TRANSPORT_PROFILES[i];
      const transport=new Transport({
        websocket:WISP_URL,
        transport:"wisp",
        connections
      });
      try{
        await withTimeout(
          transport.init(),
          18000,
          "The Genesis transport could not start."
        );
        return {transport,connections};
      }catch(err){
        lastError=err;
        await disposeTransport(transport);
        if(i<TRANSPORT_PROFILES.length-1) await delay(250*(i+1));
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
    lastRecoveryReason:"",
    codec,
    wisp:WISP_URL,

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

        const transportResult=await createTransport();
        this.transport=transportResult.transport;
        this.transportProfile=transportResult.connections;

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

    async recover(reason="manual recovery"){
      if(this.recoveryPromise) return this.recoveryPromise;

      this.recoveryPromise=(async()=>{
        this.lastRecoveryReason=String(reason||"manual recovery");
        const oldTransport=this.transport;

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
      if(options.fresh) element.__genesisPrismFrame=null;
      if(element.__genesisPrismFrame) return element.__genesisPrismFrame;
      const frame=controller.createFrame(element);
      element.__genesisPrismFrame=frame;
      return frame;
    },

    async recoverFrame(element,reason="frame recovery"){
      await this.recover(reason);
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
        controller:!!this.controller,
        recovering:!!this.recoveryPromise,
        healthy:this.healthy(),
        lastRecoveryReason:this.lastRecoveryReason
      };
    }
  };

  window.GenesisPrism=GenesisPrism;
})();
