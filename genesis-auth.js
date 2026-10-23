(function(global){
  'use strict';
  const KEY='genesisVerifiedSessionV1';
  let verified=null,refreshing=null,verification=null,passwordChange=false;
  const config=()=>global.GENESIS_BACKEND;
  function session(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}}
  function clear(){
    verified=null;sessionStorage.removeItem(KEY);
    for(const key of ['realmAuth','realmUser','genesisRole'])sessionStorage.removeItem(key);
    localStorage.removeItem('genesisLogin');localStorage.removeItem('genesisAdminSession');
  }
  async function fetchJSON(path,options={},token='',failureMessage='Access verification failed. Sign in again or retry.'){
    const b=config();if(!b?.url||!b?.anonKey)throw Error('Sign-in service is unavailable.');
    const response=await fetch(b.url+path,{...options,cache:'no-store',headers:{apikey:b.anonKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers},signal:AbortSignal.timeout(12000)});
    let data=null;try{data=await response.json()}catch{}
    if(!response.ok)throw Error(failureMessage);
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
  async function verifyAccount(){
    const access=await token();
    const identity=await fetchJSON('/auth/v1/user',{},access);
    if(!identity?.id)throw Error('Sign in to continue.');
    const rows=await fetchJSON('/rest/v1/rpc/genesis_session_access',{method:'POST',body:'{}'},access);
    const result=Array.isArray(rows)?rows[0]:rows;
    if(!result || result.role==='conflict'){
      clear();
      throw Error(result?.role==='conflict'?'This login was used in two sessions. Both were signed out. Please log in again.':'Your session ended. Please log in again.');
    }
    if(!result||result.user_id!==identity.id||result.active!==true){
      const id=result?.display_id;clear();
      throw Error(id?'ID '+id+' is deactivated or awaiting administrator approval.':'This account needs administrator approval.');
    }
    verified=Object.freeze({id:identity.id,name:String(identity.user_metadata?.display_name||(result.role==='admin'?'Admin':identity.email)||'Genesis user'),role:result.role==='admin'?'admin':'user',displayId:String(result.display_id)});
    localStorage.setItem('genesisDisplayId',verified.displayId);
    localStorage.removeItem('genesisDeviceBlocked');
    global.genesisRegisteredDevice={display_id:result.display_id,active:true};
    localStorage.setItem('genesisLogin',JSON.stringify({user:verified.name,role:verified.role,expires:Date.now()+3600000}));
    sessionStorage.setItem('realmAuth','1');sessionStorage.setItem('realmUser',verified.name);sessionStorage.setItem('genesisRole',verified.role);
    return verified;
  }
  function verify(){
    if(!verification)verification=verifyAccount().finally(()=>{verification=null});
    return verification;
  }
  async function signIn(email,password){
    const supplied=String(email).trim();
    const alias=supplied.includes('@')?'':await fetchJSON('/rest/v1/rpc/genesis_resolve_login',{method:'POST',body:JSON.stringify({p_username:supplied})});
    const identifier=supplied.includes('@')?supplied:({admin:config()?.adminEmail,lk:'lk@accounts.genesisoss.lol',kl:'kl@accounts.genesisoss.lol'})[alias];
    if(!identifier)throw Error('Incorrect username or password.');
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
    const access=session()?.access_token;
    if(access)await fetchJSON('/rest/v1/rpc/genesis_release_login',{method:'POST',body:'{}'},access).catch(()=>{});
    clear();
    if(access)await fetchJSON('/auth/v1/logout?scope=local',{method:'POST'},access).catch(()=>{});
  }
  async function changePassword(currentPassword,newPassword){
    if(!currentPassword || String(newPassword).length<6)throw Error('Enter your current password and a new password of at least 6 characters.');
    if(passwordChange)throw Error('A password change is already in progress.');
    passwordChange=true;
    let proof,adopted=false;
    try{
      await verify();
      const access=await token();
      const identity=await fetchJSON('/auth/v1/user',{},access);
      proof=await fetchJSON('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:identity.email,password:currentPassword})},'','The current password is incorrect.');
      // Use the freshly reauthenticated session, including after long sign-ins.
      await fetchJSON('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:newPassword,current_password:currentPassword})},proof.access_token,'Could not change password. Choose a different password with at least 6 characters.');
      await fetchJSON('/rest/v1/rpc/genesis_release_login',{method:'POST',body:'{}'},access).catch(()=>{});
      await fetchJSON('/auth/v1/logout?scope=local',{method:'POST'},access).catch(()=>{});
      save(proof);adopted=true;await verify();
    }finally{
      if(proof&&!adopted)await fetchJSON('/auth/v1/logout?scope=local',{method:'POST'},proof.access_token).catch(()=>{});
      passwordChange=false;
    }
  }
  async function changeUsername(name){
    await verify();
    const result=await fetchJSON('/rest/v1/rpc/genesis_set_username',{method:'POST',body:JSON.stringify({p_username:String(name).trim()})},await token(),'That username is unavailable. Use 2-24 letters, numbers, spaces, dots, dashes or underscores.');
    await verify();
    return result;
  }
  function visitorId(){
    let value;try{value=localStorage.getItem('genesisVisitorIdV1')}catch{}
    if(!/^[A-F0-9]{12}$/.test(value||'')){
      value=global.crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
      try{localStorage.setItem('genesisVisitorIdV1',value)}catch{}
    }
    return value;
  }
  function locked(message){
    clear();
    try{global.GenesisMessages?.onWindowClose?.()}catch{}
    for(const media of document.querySelectorAll('audio,video'))try{media.pause()}catch{}
    for(const frame of document.querySelectorAll('iframe'))try{frame.src='about:blank'}catch{}
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
  global.GenesisAuth=Object.freeze({ready,signIn,signOut,verify,token,rpc,adminToken,changePassword,changeUsername,visitorId,get user(){return verified}});
  if(protectedPage){
    setInterval(()=>{if(!passwordChange)verify().catch(error=>locked(error.message))},5000);
    setInterval(pollAlerts,10000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!passwordChange)verify().catch(error=>locked(error.message))});
  }
})(window);
