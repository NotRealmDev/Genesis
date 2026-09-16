const {contextBridge,ipcRenderer}=require('electron');
const {createClient}=require('@supabase/supabase-js');

let client=null;
let channel=null;
let signalListener=null;
let statusListener=null;

async function connectSignal(hostKey){
  const config=await ipcRenderer.invoke('host:get-config');
  if(channel&&client){try{await client.removeChannel(channel)}catch{}}
  client=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:30}}});
  channel=client
    .channel('genesis-vm-'+hostKey,{config:{broadcast:{self:false,ack:true}}})
    .on('broadcast',{event:'viewer-offer'},packet=>signalListener?.({event:'viewer-offer',payload:packet.payload}))
    .on('broadcast',{event:'viewer-ice'},packet=>signalListener?.({event:'viewer-ice',payload:packet.payload}))
    .on('broadcast',{event:'viewer-ping'},packet=>signalListener?.({event:'viewer-ping',payload:packet.payload}));
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Signaling connection timed out')),10000);
    channel.subscribe(status=>{
      if(status==='SUBSCRIBED'){clearTimeout(timeout);resolve()}
      else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timeout);reject(new Error('Signaling service unavailable'))}
    });
  });
  return true;
}

async function sendSignal(event,payload){
  if(!channel)throw new Error('Host signaling is not connected');
  if(typeof channel.httpSend==='function'){
    const result=await channel.httpSend(event,payload);
    if(result?.success===false)throw new Error(result.error||'Signaling failed');
    return true;
  }
  const result=await channel.send({type:'broadcast',event,payload});
  if(result!=='ok')throw new Error('Signaling returned '+result);
  return true;
}

ipcRenderer.on('host:status',(_event,payload)=>statusListener?.(payload));

contextBridge.exposeInMainWorld('genesisHost',{
  getConfig:()=>ipcRenderer.invoke('host:get-config'),
  regenerateKey:()=>ipcRenderer.invoke('host:regenerate-key'),
  setAutoLaunch:value=>ipcRenderer.invoke('host:set-auto-launch',!!value),
  copyKey:key=>ipcRenderer.invoke('host:copy-key',key),
  launchGeForce:()=>ipcRenderer.invoke('host:launch-gfn'),
  focusGeForce:()=>ipcRenderer.invoke('host:focus-gfn'),
  sendInput:value=>ipcRenderer.invoke('host:input',value),
  verifyAdmin:token=>ipcRenderer.invoke('host:verify-admin',token),
  captureReady:()=>ipcRenderer.invoke('host:capture-ready'),
  connectSignal,
  sendSignal,
  onSignal:callback=>{signalListener=typeof callback==='function'?callback:null},
  onStatus:callback=>{statusListener=typeof callback==='function'?callback:null}
});
