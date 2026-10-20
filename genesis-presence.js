(function(global){
  let client,room,connected=false,synced=false,lastPayload="",publishing=false;
  let status="Connecting to live users…";
  function users(){
    if(!connected||!synced||!room)return [];
    const byId=new Map();
    for(const entries of Object.values(room.presenceState())){
      for(const entry of entries){
        const id=String(entry.display_id||"");
        if(!/^\d+$/.test(id))continue;
        const previous=byId.get(id);
        // Multiple tabs on one browser represent one ID. Prefer its signed-in name.
        if(!previous||entry.signed_in)byId.set(id,{id,name:String(entry.name||"Visitor").slice(0,80)});
      }
    }
    return [...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id));
  }
  function render(){
    if(typeof global.CustomEvent==='function')global.dispatchEvent(new CustomEvent('genesis:presence'));
    const label=document.getElementById("genesisLiveStatus");
    const list=document.getElementById("genesisLiveUsers");
    const online=users();
    if(label)label.textContent=connected&&synced?`${online.length} connected browser IDs`:status;
    if(list){
      list.replaceChildren();
      for(const user of online){
        const row=document.createElement("div");
        row.className="admin-history-item";
        row.textContent=`ID ${user.id} · ${user.name}`;
        list.appendChild(row);
      }
      if(!online.length)list.textContent=connected&&synced?"No connected IDs reported.":"Live users are unavailable until the connection is established.";
    }
  }
  async function publish(){
    if(!connected||publishing)return;
    const device=global.genesisRegisteredDevice;
    if(!device?.display_id)return;
    if(device.active===false||localStorage.getItem("genesisDeviceBlocked")==="1"){
      lastPayload="";
      await room.untrack();
      return;
    }
    let login=null;
    try{login=JSON.parse(localStorage.getItem("genesisLogin")||"null")}catch{}
    const signedIn=!!(login&&login.expires>Date.now());
    // Publish only the display ID and account label, never tokens or credentials.
    const payload={display_id:String(device.display_id),name:signedIn?String(login.user||"User").slice(0,80):"Visitor",signed_in:signedIn};
    const encoded=JSON.stringify(payload);
    if(encoded===lastPayload)return;
    publishing=true;
    try{
      if(await room.track(payload)==="ok")lastPayload=encoded;
      else{status="Could not publish this browser's presence. Retrying…";render()}
    }finally{publishing=false}
  }
  function start(){
    if(room)return;
    const config=global.GENESIS_BACKEND;
    if(!config||!global.supabase?.createClient){status="Live users could not connect: presence library unavailable.";render();return}
    client=global.supabase.createClient(config.url,config.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    room=client.channel("genesis-online-v1");
    room.on("presence",{event:"sync"},()=>{synced=true;render()});
    room.subscribe(state=>{
      connected=state==="SUBSCRIBED";
      if(connected){lastPayload="";status="Synchronizing live users…";publish().catch(()=>{});}
      else{synced=false;status="Live connection unavailable. Reconnecting…";}
      render();
    });
  }
  global.GenesisPresence={start,render,users};
  setInterval(()=>{start();publish().catch(()=>{});render()},5000);
  global.addEventListener("pagehide",()=>{connected=false;synced=false;lastPayload="";if(room)client.removeChannel(room);room=null;render()});
  global.addEventListener("pageshow",start);
  start();
})(window);
