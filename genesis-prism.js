(function(){
  const WISP_URL = "wss://formative.icu/lively/";
  const BUILD_ID = "2026-09-13-brave-full-load-r2";
  const KEY = "b75f9583b6d8fdc8b1e918a938878cb8d86e2f59817590301085b885cb0b89f8";

  const currentScript = document.currentScript;
  const BASE_URL = new URL("./", currentScript?.src || location.href);
  const assetUrl = (name) => new URL(name, BASE_URL).href;
  const assetPath = (name) => new URL(name, BASE_URL).pathname;

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

  function waitForWorkerActivated(worker, timeoutMs=20000){
    if(!worker) return Promise.reject(new Error("Genesis service worker did not install."));
    if(worker.state === "activated") return Promise.resolve(worker);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        worker.removeEventListener("statechange",onState);
        reject(new Error("Genesis service worker activation timed out."));
      },timeoutMs);
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

  async function waitForLatestActive(registration){
    // An older active worker can still exist while a freshly uploaded build is
    // installing. Waiting for the newest worker avoids mixing two controller
    // versions during a heavy page load.
    const newer = registration.installing || registration.waiting;
    if(newer) await waitForWorkerActivated(newer);
    if(registration.active) return registration.active;
    return waitForWorkerActivated(registration.installing || registration.waiting);
  }

  function waitForPageController(timeoutMs=12000){
    if(navigator.serviceWorker.controller) return Promise.resolve(navigator.serviceWorker.controller);
    return new Promise((resolve)=>{
      const timer=setTimeout(()=>{
        navigator.serviceWorker.removeEventListener("controllerchange",onChange);
        resolve(navigator.serviceWorker.controller || null);
      },timeoutMs);
      const onChange=()=>{
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange",onChange);
        resolve(navigator.serviceWorker.controller || null);
      };
      navigator.serviceWorker.addEventListener("controllerchange",onChange,{once:true});
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
        if(!window.$scramjet) throw new Error("prism.js did not load.");
        if(!window.$scramjetController?.Controller) throw new Error("prism.api.js did not load.");
        if(!window.LibcurlTransport) throw new Error("libby.js did not load.");

        const swUrl = new URL("servy.js", BASE_URL);
        swUrl.searchParams.set("build",BUILD_ID);
        const registration = await navigator.serviceWorker.register(swUrl.href,{
          scope: BASE_URL.pathname,
          type:"classic",
          updateViaCache:"none"
        });
        try{ await registration.update(); }catch{}
        const sw = await waitForLatestActive(registration);
        await navigator.serviceWorker.ready;
        await waitForPageController();
        this.serviceWorker = sw;

        const Transport = window.LibcurlTransport.LibcurlClient || window.LibcurlTransport.default || window.LibcurlTransport;
        const transport = new Transport({
          websocket:WISP_URL,
          transport:"wisp",
          // Heavy SPAs open many assets at once. A little more per-host
          // headroom keeps images/scripts from sitting in the curl queue.
          connections:[64,56,10]
        });
        await transport.init();
        this.transport = transport;

        const api = window.$scramjetController;
        api.config.prefix = assetPath("prism/");
        api.config.scramjetPath = assetPath("prism.js");
        api.config.injectPath = assetPath("prism.inject.js");
        api.config.wasmPath = assetPath("prism.wasm");
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
