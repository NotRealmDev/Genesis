(function(){
  "use strict";

  const WISP_URL = "wss://formative.icu/lively/";
  const KEY = "b75f9583b6d8fdc8b1e918a938878cb8d86e2f59817590301085b885cb0b89f8";
  const SW_URL = "/servy.js?v=genesis-prism-3";

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

  function waitForState(worker,state,timeout=15000){
    if(!worker) return Promise.reject(new Error("Genesis service worker was not created."));
    if(worker.state===state) return Promise.resolve(worker);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        worker.removeEventListener("statechange",onState);
        reject(new Error("Genesis service worker activation timed out."));
      },timeout);
      const onState=()=>{
        if(worker.state===state){
          clearTimeout(timer);
          worker.removeEventListener("statechange",onState);
          resolve(worker);
        }else if(worker.state==="redundant"){
          clearTimeout(timer);
          worker.removeEventListener("statechange",onState);
          reject(new Error("Genesis service worker became redundant."));
        }
      };
      worker.addEventListener("statechange",onState);
    });
  }

  async function getNewestActiveWorker(registration){
    // If a new build is installing, wait for that version instead of immediately
    // returning an older active worker from a previous Genesis deployment.
    const candidate = registration.installing || registration.waiting;
    if(candidate){
      if(candidate.state!=="activated") await waitForState(candidate,"activated");
      return registration.active || candidate;
    }
    if(registration.active) return registration.active;
    const ready = await navigator.serviceWorker.ready;
    return ready.active || registration.active;
  }

  async function waitForPageControl(timeout=7000){
    if(navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
    return new Promise((resolve)=>{
      let settled=false;
      const finish=()=>{
        if(settled) return;
        settled=true;
        navigator.serviceWorker.removeEventListener("controllerchange",onChange);
        resolve(navigator.serviceWorker.controller || null);
      };
      const onChange=()=>finish();
      navigator.serviceWorker.addEventListener("controllerchange",onChange);
      setTimeout(finish,timeout);
    });
  }

  const GenesisPrism = {
    controller:null,
    transport:null,
    serviceWorker:null,
    registration:null,
    readyPromise:null,
    codec,
    wisp:WISP_URL,

    async init(){
      if(this.controller) return this.controller;
      if(this.readyPromise) return this.readyPromise;

      this.readyPromise = (async()=>{
        if(!window.isSecureContext) throw new Error("Prism requires HTTPS (or localhost).");
        if(!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
        if(!window.$scramjet) throw new Error("prism.js did not load.");
        if(!window.$scramjetController?.Controller) throw new Error("prism.api.js did not load.");
        if(!window.LibcurlTransport) throw new Error("libby.js did not load.");

        const registration = await navigator.serviceWorker.register(SW_URL,{
          scope:"/",
          type:"classic",
          updateViaCache:"none"
        });
        this.registration = registration;

        // Ask for an update, but don't block startup if GitHub Pages is slow to answer.
        try { await Promise.race([registration.update(),new Promise(r=>setTimeout(r,1500))]); } catch(_) {}

        const sw = await getNewestActiveWorker(registration);
        if(!sw) throw new Error("Genesis service worker did not activate.");
        this.serviceWorker = sw;

        // Scramjet's injected client talks to navigator.serviceWorker.controller.
        // Waiting here prevents the common first-load issue where HTML appears but
        // images/subresources fail because the page was not controlled yet.
        await waitForPageControl();

        const Transport = window.LibcurlTransport.LibcurlClient || window.LibcurlTransport.default || window.LibcurlTransport;
        const transport = new Transport({wisp:WISP_URL});
        await transport.init();
        this.transport = transport;

        const api = window.$scramjetController;
        api.config.prefix = "/prism/";
        api.config.scramjetPath = "/prism/prism.js";
        api.config.injectPath = "/prism/prism.inject.js";
        api.config.wasmPath = "/prism/prism.wasm";
        api.config.codec.encode = codec.encode;
        api.config.codec.decode = codec.decode;

        const controller = new api.Controller({serviceworker:sw,transport});
        await controller.wait();
        this.controller = controller;
        return controller;
      })().catch(err=>{
        this.readyPromise=null;
        throw err;
      });

      return this.readyPromise;
    },

    async prewarm(){
      try { await this.init(); return true; }
      catch(err){ console.warn("Genesis Prism prewarm failed",err); return false; }
    },

    async createFrame(element){
      const controller = await this.init();
      if(element.__genesisPrismFrame) return element.__genesisPrismFrame;
      const frame = controller.createFrame(element);
      element.__genesisPrismFrame = frame;
      return frame;
    }
  };

  window.GenesisPrism = GenesisPrism;

  // Start the expensive WASM/Libcurl initialization shortly after Genesis is usable,
  // so opening Browser usually feels instant instead of paying the startup cost then.
  const prewarm = ()=>setTimeout(()=>GenesisPrism.prewarm(),650);
  if(document.readyState==="complete") prewarm();
  else window.addEventListener("load",prewarm,{once:true});
})();
