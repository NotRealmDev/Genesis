(function(){
  const WISP_URL = "wss://formative.icu/lively/";
  const SITE_BASE = new URL("./", location.href);
  const sitePath = (name) => new URL(name, SITE_BASE).pathname;
  const KEY = "b75f9583b6d8fdc8b1e918a938878cb8d86e2f59817590301085b885cb0b89f8";

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

  function waitForActive(registration){
    if(registration.active) return Promise.resolve(registration.active);
    const worker = registration.installing || registration.waiting;
    if(!worker) return Promise.reject(new Error("Genesis service worker did not install."));
    if(worker.state === "activated") return Promise.resolve(worker);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Genesis service worker activation timed out.")),15000);
      const onState=()=>{
        if(worker.state === "activated"){
          clearTimeout(timer);
          worker.removeEventListener("statechange",onState);
          resolve(worker);
        }else if(worker.state === "redundant"){
          clearTimeout(timer);
          worker.removeEventListener("statechange",onState);
          reject(new Error("Genesis service worker became redundant."));
        }
      };
      worker.addEventListener("statechange",onState);
    });
  }

  const GenesisPrism = {
    controller:null,
    transport:null,
    serviceWorker:null,
    readyPromise:null,
    codec,
    wisp:WISP_URL,

    async init(){
      if(this.controller) return this.controller;
      if(this.readyPromise) return this.readyPromise;

      this.readyPromise = (async()=>{
        if(!window.isSecureContext) throw new Error("Prism requires HTTPS (or localhost).");
        if(!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
        if(!window.$scramjet) throw new Error(window.__genesisPrismScriptError || "prism.js did not load or your browser rejected its JavaScript syntax.");
        if(!window.$scramjetController?.Controller) throw new Error(window.__genesisPrismScriptError || "prism.api.js did not load.");
        if(!window.LibcurlTransport) throw new Error(window.__genesisPrismScriptError || "libby.js did not load.");

        const registration = await navigator.serviceWorker.register(sitePath("servy.js"),{
          type:"classic",
          updateViaCache:"none"
        });
        const sw = await waitForActive(registration);
        this.serviceWorker = sw;

        const Transport = window.LibcurlTransport.LibcurlClient || window.LibcurlTransport.default || window.LibcurlTransport;
        const transport = new Transport({wisp:WISP_URL});
        await transport.init();
        this.transport = transport;

        const api = window.$scramjetController;
        api.config.prefix = sitePath("prism/");
        api.config.scramjetPath = sitePath("prism/prism.js");
        api.config.injectPath = sitePath("prism/prism.inject.js");
        api.config.wasmPath = sitePath("prism/prism.wasm");
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

    async createFrame(element){
      const controller = await this.init();
      if(element.__genesisPrismFrame) return element.__genesisPrismFrame;
      const frame = controller.createFrame(element);
      element.__genesisPrismFrame = frame;
      return frame;
    }
  };

  window.GenesisPrism = GenesisPrism;
})();
