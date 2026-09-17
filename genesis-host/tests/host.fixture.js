(()=>{
  let listener=null,stream=null;
  const origin=parent.location.origin;
  function signal(event,payload){parent.postMessage({type:'signal',event,payload},origin);return Promise.resolve(true)}
  window.genesisHost={
    async getConfig(){return {hostKey:'synthetic-host-key-not-a-production-credential',autoLaunch:false,browserRunning:true}},
    async connectSignal(){parent.postMessage({type:'host-ready'},origin)},sendSignal:signal,
    onSignal(fn){listener=fn},onStatus(){},async launchGeForce(){return {ok:true}},async captureReady(){return {found:true}},
    focusGeForce(){},sendInput(payload){parent.postMessage({type:'control',payload},origin)},copyKey(){},setAutoLaunch(){}
  };
  navigator.mediaDevices.getDisplayMedia=async()=>{
    if(stream)return stream;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');let frame=0;
    setInterval(()=>{ctx.fillStyle=`hsl(${frame++%360} 65% 30%)`;ctx.fillRect(0,0,640,360);ctx.fillStyle='#fff';ctx.font='28px system-ui';ctx.fillText('Genesis synthetic frame '+frame,35,180)},33);
    stream=canvas.captureStream(30);return stream;
  };
  window.addEventListener('message',event=>{if(event.source===parent&&event.origin===origin&&event.data?.type==='signal')listener?.(event.data)});
})();
