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
  function loadScript(src,label){
    const script=document.createElement('script');
    script.src=src;
    script.defer=true;
    script.onerror=()=>console.error(label+' did not load. Refresh to retry.');
    document.head.appendChild(script);
  }

  function load(){
    const path=location.pathname||"/";
    const isLogin=/(?:^|\/)index\.html$/i.test(path)||path==="/"||path==="";
    const isOS=/(?:^|\/)os\.html$/i.test(path);

    if(isLogin||isOS){
      loadScript('genesis-ransom-easter.js?build=ransom-event-r2','RANSOM Easter egg');
    }

    if(!isOS)return;
    for(const [src,label] of [['genesis-browser-extras.js?build=browser-extras-r3','Browser extras'],['genesis-ui-polish.js?build=ui-polish-r1','Genesis UI polish']]){
      loadScript(src,label);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
