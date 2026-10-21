(function(global){
  'use strict';
  const KEY='genesisVerifiedSessionV1';
  let verified=null,refreshing=null;
  const config=()=>global.GENESIS_BACKEND;
  function session(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}}
  function clear(){
    verified=null;sessionStorage.removeItem(KEY);
    for(const key of ['realmAuth','realmUser','genesisRole'])sessionStorage.removeItem(key);
    localStorage.removeItem('genesisLogin');localStorage.removeItem('genesisAdminSession');
  }
  async function fetchJSON(path,options={},token=''){
    const b=config();if(!b?.url||!b?.anonKey)throw Error('Sign-in service is unavailable.');
    const response=await fetch(b.url+path,{...options,cache:'no-store',headers:{apikey:b.anonKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers},signal:AbortSignal.timeout(12000)});
    let data=null;try{data=await response.json()}catch{}
    if(!response.ok)throw Error('Access verification failed. Sign in again or retry.');
    return data;
  }
  function save(data){
    if(!data?.access_token||!data?.refresh_token)throw Error('Sign-in did not return a session.');
    const value={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+Number(data.expires_in||3600)*1000};
    sessionStorage.setItem(KEY,JSON.stringify(value));return value;
  }
  async function token(){
    let value=session();if(!value)throw Error('Sign in to continue.');
    if(value.expires_at>Date.now()+60000)return value.access_token;
    if(!refreshing)refreshing=fetchJSON('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:value.refresh_token})}).then(save).finally(()=>{refreshing=null});
    value=await refreshing;return value.access_token;
  }
  async function rpc(name,body={}){return fetchJSON('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)},await token())}
  async function verify(){
    const access=await token();
    const identity=await fetchJSON('/auth/v1/user',{},access);
    if(!identity?.id)throw Error('Sign in to continue.');
    const rows=await fetchJSON('/rest/v1/rpc/genesis_session_access',{method:'POST',body:'{}'},access);
    const result=Array.isArray(rows)?rows[0]:rows;
    if(!result||result.user_id!==identity.id||result.active!==true){
      const id=result?.display_id;clear();
      throw Error(id?'ID '+id+' is deactivated or awaiting administrator approval.':'This account needs administrator approval.');
    }
    verified=Object.freeze({id:identity.id,name:result.role==='admin'?'Admin':String(identity.user_metadata?.display_name||identity.email||'Genesis user'),role:result.role==='admin'?'admin':'user',displayId:String(result.display_id)});
    localStorage.setItem('genesisDisplayId',verified.displayId);
    localStorage.removeItem('genesisDeviceBlocked');
    global.genesisRegisteredDevice={display_id:result.display_id,active:true};
    localStorage.setItem('genesisLogin',JSON.stringify({user:verified.name,role:verified.role,expires:Date.now()+3600000}));
    sessionStorage.setItem('realmAuth','1');sessionStorage.setItem('realmUser',verified.name);sessionStorage.setItem('genesisRole',verified.role);
    return verified;
  }
  async function signIn(email,password){
    const supplied=String(email).trim();
    const identifier=supplied.toLowerCase()==='admin'?(config()?.adminEmail||'admin@genesisos.lol'):supplied;
    clear();save(await fetchJSON('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:identifier,password})}));
    try{return await verify()}catch(error){clear();throw error}
  }
  async function adminToken(){
    await verify();
    const allowed=await rpc('genesis_security_guard',{p_operation:'admin'});
    if(allowed!==true){clear();throw Error('Unauthorized administrator request. Account suspended for review.');}
    return token();
  }
  async function signOut(){
    const access=session()?.access_token;clear();
    if(access)fetchJSON('/auth/v1/logout',{method:'POST'},access).catch(()=>{});
  }
  function locked(message){
    document.documentElement.style.visibility='visible';
    document.getElementById('genesisAuthLock')?.remove();
    const overlay=document.createElement('div');overlay.id='genesisAuthLock';
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#080d19;color:white;display:grid;place-content:center;gap:20px;padding:32px;font:16px system-ui;text-align:center';
    const text=document.createElement('p');text.textContent=message;
    const link=document.createElement('a');link.href='index.html';link.textContent='Return to sign in';link.style.color='#a9c5ff';
    overlay.append(text,link);document.body.appendChild(overlay);
  }
  let seenIncident=Number(sessionStorage.getItem('genesisLastSecurityIncident')||0);
  async function pollAlerts(){
    if(verified?.role!=='admin'||typeof global.showGenesisAnnouncement!=='function')return;
    try{
      const rows=await fetchJSON('/rest/v1/genesis_security_incidents?select=id,display_id,reason,created_at&order=id.desc&limit=10',{},await token());
      for(const incident of [...rows].reverse()){
        if(Number(incident.id)<=seenIncident)continue;
        seenIncident=Number(incident.id);sessionStorage.setItem('genesisLastSecurityIncident',String(seenIncident));
        const message='Security alert: ID '+(incident.display_id||'unassigned')+' suspended after an unauthorized administrator request.';
        if(typeof global.showGenesisAnnouncement==='function')global.showGenesisAnnouncement(message,10000);
      }
    }catch{} // A notification failure never changes another account's access.
  }
  const protectedPage=/(?:^|\/)(?:os|intro|browser-tab)\.html$/i.test(location.pathname);
  if(protectedPage)document.documentElement.style.visibility='hidden';
  const ready=protectedPage?verify().then(user=>{document.documentElement.style.visibility='visible';return user}).catch(error=>{
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>locked(error.message),{once:true});else locked(error.message);
    return null;
  }):Promise.resolve(null);
  global.GenesisAuth=Object.freeze({ready,signIn,signOut,verify,token,rpc,adminToken,get user(){return verified}});
  if(protectedPage){
    setInterval(()=>verify().catch(error=>locked(error.message)),60000);
    setInterval(pollAlerts,10000);
  }
})(window);
