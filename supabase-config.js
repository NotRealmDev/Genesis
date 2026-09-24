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
    for(const [src,label] of [['genesis-browser-extras.js?build=browser-extras-r3','Browser extras'],['genesis-ui-polish.js?build=ui-polish-r1','Genesis UI polish']]){
      const script=document.createElement('script');script.src=src;script.defer=true;
      script.onerror=()=>console.error(label+' did not load. Refresh to retry.');document.head.appendChild(script);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
