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
    const path=location.pathname||"/";
    if(/(?:^|\/)index\.html$/i.test(path)||path==="/"||path===""){
      const easter=document.createElement('script');
      easter.src='genesis-ransom-easter.js?build=ransom-easter-r1';
      easter.defer=true;
      easter.onerror=()=>console.error('RANSOM Easter egg did not load. Refresh to retry.');
      document.head.appendChild(easter);
    }

    if(!/(?:^|\/)os\.html$/i.test(path))return;
    for(const [src,label] of [['genesis-browser-extras.js?build=browser-extras-r3','Browser extras'],['genesis-ui-polish.js?build=ui-polish-r1','Genesis UI polish']]){
      const script=document.createElement('script');script.src=src;script.defer=true;
      script.onerror=()=>console.error(label+' did not load. Refresh to retry.');document.head.appendChild(script);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
