/* Genesis Prism service worker router - optimized build 3 */
const GENESIS_CACHE = "genesis-prism-static-v3";
const GENESIS_STATIC = [
  "/prism/prism.js",
  "/prism/prism.api.js",
  "/prism/prism.inject.js",
  "/prism/prism.wasm",
  "/prism/libby.js",
  "/genesis-prism.js"
];

var $scramjetController;
(() => {
  var e = {
    805(e, t, r) {
      r.d(t, { C: () => o });
      class o {
        methods; id; sendRaw; counter = 0; promiseCallbacks = new Map();
        constructor(e, t, r) { this.methods=e; this.id=t; this.sendRaw=r; }
        recieve(e) {
          if (e == null || typeof e !== 'object') return;
          const t = e[this.id]; if (t == null || typeof t !== 'object') return;
          const r = t.$type;
          if (r === 'response') {
            const cb=this.promiseCallbacks.get(t.$token); if(!cb) return;
            this.promiseCallbacks.delete(t.$token);
            t.$error !== undefined ? cb.reject(Error(t.$error)) : cb.resolve(t.$data);
          } else if (r === 'request') {
            Promise.resolve(this.methods[t.$method](t.$args)).then((e)=>{
              this.sendRaw({[this.id]:{$type:'response',$token:t.$token,$data:e?.[0]}},e?.[1]);
            }).catch((e)=>{
              console.error(e);
              this.sendRaw({[this.id]:{$type:'response',$token:t.$token,$error:e?.toString()||'Unknown error'}},[]);
            });
          }
        }
        call(e,t,r=[]) {
          const o=this.counter++;
          return new Promise((s,i)=>{
            this.promiseCallbacks.set(o,{resolve:s,reject:i});
            this.sendRaw({[this.id]:{$type:'request',$method:e,$args:t,$token:o}},r);
          });
        }
      }
    }
  }, t={};
  function r(o){ const s=t[o]; if(s!==undefined)return s.exports; const i=t[o]={exports:{}}; e[o](i,i.exports,r); return i.exports; }
  r.d=(e,t)=>{for(const o in t)r.o(t,o)&&!r.o(e,o)&&Object.defineProperty(e,o,{enumerable:true,get:t[o]});};
  r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t);
  r.r=(e)=>{if(typeof Symbol!=="undefined"&&Symbol.toStringTag)Object.defineProperty(e,Symbol.toStringTag,{value:"Module"});Object.defineProperty(e,"__esModule",{value:true});};
  var o={};
  (()=>{
    r.r(o); r.d(o,{route:()=>route,shouldRoute:()=>shouldRoute});
    const RPC=r(805);
    const cookieWaiters={};
    const controllers=[];

    addEventListener("message",(event)=>{
      const data=event.data;
      if(!data||typeof data!=="object")return;
      if(data.$sw$setCookieDone&&typeof data.$sw$setCookieDone==="object"){
        const done=cookieWaiters[data.$sw$setCookieDone.id];
        if(done){done();delete cookieWaiters[data.$sw$setCookieDone.id];}
      }
      if(data.$sw$initRemoteTransport&&typeof data.$sw$initRemoteTransport==="object"){
        const {port,prefix}=data.$sw$initRemoteTransport;
        const controller=controllers.find(c=>new URL(prefix).pathname.startsWith(c.prefix));
        if(!controller)return console.error("No relevant controller found for transport init");
        controller.rpc.call("initRemoteTransport",port,[port]);
      }
    });

    class ControllerHandle {
      constructor(prefix,id,port){
        this.prefix=prefix;
        this.id=id;
        this.rpc=new RPC.C({
          sendSetCookie:async({cookies,options})=>{
            const list=await self.clients.matchAll({includeUncontrolled:true});
            const ids=[];
            const waits=[];
            const noWait=options?.destination==="document"||options?.destination==="iframe";
            for(const client of list){
              const id=Math.random().toString(36).substring(2,10);
              ids.push(id);
              client.postMessage({$controller$setCookie:{cookies,options,id}});
              if(!noWait) waits.push(new Promise(resolve=>{cookieWaiters[id]=()=>resolve(id);}));
            }
            if(waits.length){
              let timer,settled=false;
              const timeout=new Promise(resolve=>{timer=setTimeout(resolve,700);});
              try{await Promise.race([timeout,Promise.any(waits).then(()=>{settled=true;}).catch(()=>{})]);}
              finally{if(timer)clearTimeout(timer);for(const id of ids)delete cookieWaiters[id];}
            }
          }
        },"tabchannel-"+id,(msg,transfer)=>port.postMessage(msg,transfer));
        port.onmessage=(event)=>this.rpc.recieve(event.data);
        port.onmessageerror=console.error;
        port.start?.();
        this.rpc.call("ready",void 0);
      }
    }

    function shouldRoute(event){
      const url=new URL(event.request.url);
      return controllers.some(c=>url.pathname.startsWith(c.prefix));
    }

    async function route(event){
      try{
        const url=new URL(event.request.url);
        const controller=controllers.find(c=>url.pathname.startsWith(c.prefix));
        if(!controller) return fetch(event.request);
        const client=await self.clients.get(event.clientId || event.resultingClientId);
        const response=await controller.rpc.call("request",{
          rawUrl:event.request.url,
          rawReferrer:event.request.referrer,
          destination:event.request.destination,
          mode:event.request.mode,
          referrer:event.request.referrer,
          method:event.request.method,
          body:event.request.body,
          cache:event.request.cache,
          forceCrossOriginIsolated:false,
          initialHeaders:[...event.request.headers],
          rawClientUrl:client?client.url:void 0,
          clientId:event.clientId||event.resultingClientId
        }, event.request.body instanceof ReadableStream || event.request.body instanceof ArrayBuffer ? [event.request.body] : void 0);

        const headers=new Headers(response.headers || []);
        // A generated ServiceWorker Response must not forward hop-by-hop headers.
        // Removing stale length values also prevents truncated media/image bodies.
        headers.delete("connection");
        headers.delete("keep-alive");
        headers.delete("proxy-authenticate");
        headers.delete("proxy-authorization");
        headers.delete("te");
        headers.delete("trailer");
        headers.delete("transfer-encoding");
        headers.delete("upgrade");
        headers.delete("content-length");

        return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
      }catch(err){
        console.error("Genesis Prism service worker error:",err);
        return new Response("Internal Genesis Proxy Error: "+(err?.message||err),{
          status:502,
          headers:{"content-type":"text/plain; charset=utf-8"}
        });
      }
    }

    addEventListener("message",(event)=>{
      const data=event.data;
      if(!data||typeof data!=="object"||!data.$controller$init||typeof data.$controller$init!=="object")return;
      const init=data.$controller$init;
      const idx=controllers.findIndex(c=>c.id===init.id);
      if(idx!==-1)controllers.splice(idx,1);
      controllers.push(new ControllerHandle(init.prefix,init.id,event.ports[0]));
    });

    o.route=route;
    o.shouldRoute=shouldRoute;
  })();
  $scramjetController=o;
})();

self.addEventListener("install",(event)=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(GENESIS_CACHE);
      await cache.addAll(GENESIS_STATIC);
    }catch(err){
      console.warn("Genesis Prism cache warmup skipped",err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith("genesis-prism-static-")&&k!==GENESIS_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
    for(const client of await self.clients.matchAll({includeUncontrolled:true})){
      client.postMessage({$controller$swrevive:{}});
    }
  })());
});

self.addEventListener("fetch",(event)=>{
  if($scramjetController?.shouldRoute(event)){
    event.respondWith($scramjetController.route(event));
    return;
  }

  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin || !GENESIS_STATIC.includes(url.pathname)) return;

  event.respondWith((async()=>{
    const cache=await caches.open(GENESIS_CACHE);
    const cached=await cache.match(url.pathname);
    if(cached) return cached;
    const response=await fetch(event.request);
    if(response.ok) cache.put(url.pathname,response.clone()).catch(()=>{});
    return response;
  })());
});
