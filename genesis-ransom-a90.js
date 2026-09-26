(function(global){
  "use strict";
  const proto=global.HTMLMediaElement?.prototype;
  if(!proto||proto.__genesisA90Patched)return;
  const descriptor=Object.getOwnPropertyDescriptor(proto,"src");
  if(!descriptor?.get||!descriptor?.set)return;
  Object.defineProperty(proto,"__genesisA90Patched",{value:true,configurable:true});
  Object.defineProperty(proto,"src",{
    configurable:descriptor.configurable,
    enumerable:descriptor.enumerable,
    get:descriptor.get,
    set(value){
      const requested=String(value||"");
      const isRansomJump=this?.classList?.contains?.("ransom-jumpscare-video")&&/assets\/ransom\/jumpscare\.mp4(?:$|[?#])/i.test(requested);
      if(!isRansomJump){descriptor.set.call(this,value);return}
      this.muted=true;
      global.fetch("assets/ransom/a90-jumps.b64",{cache:"no-store"}).then(response=>{
        if(!response.ok)throw new Error("A-90 jumpscare asset failed to load");
        return response.text();
      }).then(base64=>{
        descriptor.set.call(this,"data:video/mp4;base64,"+base64.trim());
        this.load?.();
        const playing=this.play?.();
        playing?.catch?.(()=>{});
      }).catch(()=>descriptor.set.call(this,value));
    }
  });
})(globalThis);
