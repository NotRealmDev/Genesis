/* Shared GPT setup is managed by the site owner, outside the browser app. */
(function(global){
  "use strict";
  function html(){
    return `<div class="gpt-app">
      <div class="gpt-toolbar"><div class="gpt-provider-label"><span class="gpt-mark-small">✦</span>Genesis GPT</div></div>
      <div class="gpt-status" role="status" aria-live="polite">Setup pending</div>
      <div class="gpt-messages"><div class="gpt-empty"><div class="gpt-empty-mark">✦</div><h2>Your AI workspace</h2><p>Genesis GPT is being connected. Once ready, everyone can chat here without entering an API key.</p></div></div>
      <form class="gpt-composer"><textarea class="gpt-input" rows="1" disabled aria-label="Message Genesis GPT" placeholder="Chat will be available once setup is complete"></textarea><button class="gpt-send" type="submit" disabled aria-label="Send message">↑</button></form>
      <div class="gpt-footer">The shared connection is managed by the Genesis owner.</div></div>`;
  }
  function init(win){
    if(!win?.isConnected)return;
    // Discard obsolete personal configuration; no provider key is read or fetched.
    try{
      sessionStorage.removeItem("genesisGPTApiKeySession");
      sessionStorage.removeItem("genesisGPTModelSession");
    }catch{}
    const form=win.querySelector(".gpt-composer");
    if(form)form.onsubmit=event=>event.preventDefault();
  }
  function close(){}
  global.GenesisGPT=Object.freeze({html,init,close});
})(window);
