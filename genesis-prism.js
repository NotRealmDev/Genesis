(function(){
  const WISP_URL = "wss://formative.icu/lively/";
  const BUILD_ID = "2026-09-13-brave-full-load-r3";
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

  async function getUsableWorker(registration){
    // Prefer an already-active worker. A freshly deployed service worker may be
    // installing/waiting while an older, compatible worker is still active.
    // Blocking on the new worker is what caused the "activation timed out"
    // screen on GitHub Pages.
    if(registration.active && registration.active.state === "activated"){
      return registration.active;
    }

    // navigator.serviceWorker.ready resolves once this origin has an active SW.
    // It is much more reliable than waiting on a snapshot of registration.installing.
    let readyReg = null;
    try{
      readyReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("Genesis service worker activation timed out.")),15000))
      ]);
    }catch(err){
      // One last check in case activation completed on the same tick as timeout.
      if(registration.active && registration.active.state === "activated") return registration.active;
      throw err;
    }

    const worker = readyReg?.active || registration.active;
    if(worker && worker.state === "activated") return worker;
    throw new Error("Genesis service worker did not become active.");
  }

  async function waitForControllerBriefly(timeoutMs=2500){
    if(navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
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
      navigator.serviceWorker.addEventListener("controllerchange",onChange);
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

        // Keep a stable service-worker URL. updateViaCache:"none" already tells
        // the browser/GitHub Pages to re-check the script, and a changing query
        // string can create awkward update races with an older controlled tab.
        const swUrl = new URL("servy.js", BASE_URL);
        const swOptions = {
          scope: BASE_URL.pathname,
          type:"classic",
          updateViaCache:"none"
        };

        let registration = await navigator.serviceWorker.register(swUrl.href,swOptions);
        let sw;
        try{
          sw = await getUsableWorker(registration);
        }catch(firstErr){
          // Auto-repair a stale/broken GitHub Pages registration. Only do this
          // when there is NO usable active worker, so a working session is never
          // torn down just because an update is pending.
          if(registration.active && registration.active.state === "activated") throw firstErr;
          try{ await registration.unregister(); }catch{}
          await new Promise(resolve=>setTimeout(resolve,180));
          registration = await navigator.serviceWorker.register(swUrl.href,swOptions);
          sw = await getUsableWorker(registration);
        }

        await waitForControllerBriefly();
        this.serviceWorker = sw;

        // Once startup is healthy, quietly check for a newer deployed worker.
        // Do not wait for it: the active worker is already enough to browse.
        setTimeout(()=>{ try{ registration.update().catch(()=>{}); }catch{} },250);

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
