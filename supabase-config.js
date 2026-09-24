/*
 Genesis Supabase configuration.
 This uses the public/publishable Supabase key.
 NEVER place a secret/service_role key in this file.
*/
window.GENESIS_BACKEND = {
  url: "https://yubpnkcsjuxuczrafmmj.supabase.co",
  anonKey: "sb_publishable_JNxkxsQxxy5gwawUduiFbw_wHYsaQ5V"
};

(function(){
  function load(){
    if(!/(?:^|\/)os\.html$/i.test(location.pathname))return;
    const script=document.createElement('script');script.src='genesis-browser-extras.js?build=browser-extras-r2';
    script.onload=()=>{};script.onerror=()=>console.error('Browser extras did not load. Refresh to retry.');document.head.appendChild(script);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
