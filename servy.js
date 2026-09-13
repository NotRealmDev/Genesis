/* Genesis Prism service worker router */
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
            if(cb.timer)clearTimeout(cb.timer);
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
        call(e,t,r=[],timeoutMs=45000) {
          const o=this.counter++;
          return new Promise((s,i)=>{
            const timer=timeoutMs>0?setTimeout(()=>{
              if(!this.promiseCallbacks.has(o))return;
              this.promiseCallbacks.delete(o);
              i(new Error('Genesis RPC timed out: '+e));
            },timeoutMs):null;
            this.promiseCallbacks.set(o,{resolve:s,reject:i,timer});
            try{
              this.sendRaw({[this.id]:{$type:'request',$method:e,$args:t,$token:o}},r);
            }catch(err){
              if(timer)clearTimeout(timer);
              this.promiseCallbacks.delete(o);
              i(err);
            }
          });
        }
        rejectAll(reason='Genesis RPC channel closed'){
          for(const [token,cb] of this.promiseCallbacks){
            if(cb.timer)clearTimeout(cb.timer);
            cb.reject(new Error(reason));
            this.promiseCallbacks.delete(token);
          }
        }
      }
    }
  }, t={};
  function r(o){ const s=t[o]; if(s!==undefined)return s.exports; const i=t[o]={exports:{}}; e[o](i,i.exports,r); return i.exports; }
  r.d=(e,t)=>{for(const o in t)r.o(t,o)&&!r.o(e,o)&&Object.defineProperty(e,o,{enumerable:true,get:t[o]});};
  r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t);
  r.r=(e)=>{if(typeof Symbol!=='undefined'&&Symbol.toStringTag)Object.defineProperty(e,Symbol.toStringTag,{value:'Module'});Object.defineProperty(e,'__esModule',{value:true});};
  var o={};
  (()=>{
    r.r(o); r.d(o,{route:()=>a,shouldRoute:()=>n});
    const RPC=r(805);
    const cookieWaiters={};
    addEventListener('message',(event)=>{
      const data=event.data;
      if(!data||typeof data!=='object')return;
      if(data.$sw$setCookieDone&&typeof data.$sw$setCookieDone==='object'){
        const done=cookieWaiters[data.$sw$setCookieDone.id]; if(done){done();delete cookieWaiters[data.$sw$setCookieDone.id];}
      }
      if(data.$sw$initRemoteTransport&&typeof data.$sw$initRemoteTransport==='object'){
        const {port,prefix}=data.$sw$initRemoteTransport;
        const controller=controllers.find(c=>new URL(prefix).pathname.startsWith(c.prefix));
        if(!controller)return console.error('No relevant controller found for transport init');
        controller.rpc.call('initRemoteTransport',port,[port],20000).catch(err=>console.error('Remote transport init failed:',err));
      }
    });
    class ControllerHandle {
      constructor(prefix,id,port){
        this.prefix=prefix;this.id=id;
        this.rpc=new RPC.C({
          sendSetCookie:async({cookies,options})=>{
            const list=await self.clients.matchAll(); const ids=[]; const waits=[];
            const noWait=options?.destination==='document'||options?.destination==='iframe';
            for(const client of list){
              const id=Math.random().toString(36).substring(2,10); ids.push(id);
              client.postMessage({$controller$setCookie:{cookies,options,id}});
              if(!noWait)waits.push(new Promise(resolve=>{cookieWaiters[id]=()=>resolve(id);}));
            }
            if(waits.length){
              let timer,settled=false;
              const timeout=new Promise(resolve=>{timer=setTimeout(()=>{if(!settled)console.warn('Cookie sync timed out');resolve();},1000);});
              try{await Promise.race([timeout,Promise.any(waits).then(()=>{settled=true;}).catch(()=>{})]);}
              finally{if(timer)clearTimeout(timer);for(const id of ids)delete cookieWaiters[id];}
            }
          }
        },'tabchannel-'+id,(msg,transfer)=>port.postMessage(msg,transfer));
        port.onmessage=(event)=>this.rpc.recieve(event.data);
        port.onmessageerror=(event)=>{
          console.error('Genesis controller message error:',event);
          this.rpc.rejectAll('Genesis controller message channel failed');
        };
        this.rpc.call('ready',void 0,[],15000).catch(err=>console.error('Genesis controller ready check failed:',err));
      }
    }
    const controllers=[];
    function n(event){const url=new URL(event.request.url);return controllers.some(c=>url.pathname.startsWith(c.prefix));}
    async function a(event){
      try{
        const url=new URL(event.request.url);
        const controller=controllers.find(c=>url.pathname.startsWith(c.prefix));
        if(!controller)return fetch(event.request);
        const client=await self.clients.get(event.clientId);
        const payload={
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
        };
        const transfer=event.request.body instanceof ReadableStream || event.request.body instanceof ArrayBuffer ? [event.request.body] : void 0;
        let response;
        try{
          response=await controller.rpc.call('request',payload,transfer,35000);
        }catch(firstErr){
          const method=(event.request.method||'GET').toUpperCase();
          if(method!=='GET' && method!=='HEAD') throw firstErr;
          await new Promise(resolve=>setTimeout(resolve,120));
          response=await controller.rpc.call('request',payload,[],20000);
        }
        if(!response||typeof response.status!=='number')throw new Error('Genesis received an invalid upstream response.');
        return new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(err){
        console.error('Service Worker error:',err);
        return new Response('Genesis upstream request failed: '+(err?.message||String(err)),{
          status:502,
          headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}
        });
      }
    }
    addEventListener('message',(event)=>{
      const data=event.data;
      if(!data||typeof data!=='object'||!data.$controller$init||typeof data.$controller$init!=='object')return;
      const init=data.$controller$init;
      const idx=controllers.findIndex(c=>c.id===init.id);
      if(idx!==-1){
        controllers[idx].rpc.rejectAll('Genesis controller was replaced');
        controllers.splice(idx,1);
      }
      controllers.push(new ControllerHandle(init.prefix,init.id,event.ports[0]));
    });
    addEventListener('install',(event)=>{
      event.waitUntil(self.skipWaiting());
    });
    addEventListener('activate',(event)=>{
      event.waitUntil((async()=>{
        await self.clients.claim();
        const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
        for(const client of clients) client.postMessage({$controller$swrevive:{}});
      })());
    });
  })();
  $scramjetController=o;
})();

self.addEventListener('fetch',(event)=>{
  if($scramjetController && $scramjetController.shouldRoute(event)){
    event.respondWith($scramjetController.route(event));
  }
});
