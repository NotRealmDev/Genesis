/* One install controller for the login page and desktop. */
(function(global){
  "use strict";
  const baseURL=new URL("./",document.currentScript?.src||location.href);
  const standalone=global.matchMedia("(display-mode: standalone)");
  let deferredPrompt=null;
  let installed=standalone.matches || navigator.standalone===true;
  let prompting=false;
  let dialog=null;
  let workerPromise=null;
  const isFramed=()=>global.top!==global.self;
  function updateButtons(){
    document.querySelectorAll("[data-genesis-install]").forEach(button=>{
      button.hidden=installed;
      button.disabled=prompting;
      button.dataset.installState=installed?"installed":deferredPrompt?"ready":"help";
    });
  }
  function instructions(){
    if(isFramed())return "Open Genesis in its own browser tab to install it.";
    const ua=navigator.userAgent;
    if(/iPhone|iPad|iPod/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1)){
      return "In Safari, tap Share, then Add to Home Screen. Choose Open as Web App if shown, and tap Add.";
    }
    if(/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua))return "In Safari on Mac, choose File → Add to Dock, then Add.";
    return "Look for Install Genesis in your browser’s address bar or app menu. If no install option appears, open Genesis in Chrome or Edge and try again.";
  }
  function showHelp(){
    if(!dialog){
      dialog=document.createElement("dialog");
      dialog.className="genesis-install-dialog";
      dialog.setAttribute("aria-labelledby","genesisInstallTitle");
      dialog.innerHTML=`<form method="dialog"><button class="genesis-install-close" aria-label="Close install help">×</button></form>
        <div class="genesis-install-symbol" aria-hidden="true">↧</div>
        <h2 id="genesisInstallTitle">Install Genesis</h2>
        <p>Keep Genesis in its own app window, ready from your desktop or home screen.</p>
        <p class="genesis-install-instructions"></p>
        <button type="button" class="genesis-install-native" hidden>Install Genesis</button>
        <a class="genesis-install-open" target="_blank" rel="noopener noreferrer" hidden>Open Genesis to install ↗</a>
        <small>Online features still need an internet connection.</small>`;
      dialog.querySelector(".genesis-install-native").addEventListener("click",install);
      document.body.appendChild(dialog);
    }
    dialog.querySelector(".genesis-install-instructions").textContent=instructions();
    const open=dialog.querySelector(".genesis-install-open");
    open.href=new URL("index.html",baseURL).href;
    open.hidden=!isFramed();
    dialog.querySelector(".genesis-install-native").hidden=!deferredPrompt;
    if(!dialog.open)dialog.showModal();
  }
  async function install(){
    if(installed || prompting)return;
    if(!deferredPrompt){showHelp();return;}
    const prompt=deferredPrompt;
    deferredPrompt=null; // A browser install event can only be used once.
    prompting=true;
    dialog?.close();
    updateButtons();
    try{
      // Call synchronously from the click to preserve browser user activation.
      const result=await prompt.prompt();
      const choice=result?.outcome?result:await prompt.userChoice;
      if(choice?.outcome==="accepted")installed=true;
    }catch{
      showHelp();
    }finally{
      prompting=false;
      updateButtons();
    }
  }
  function registerWorker(){
    if(!global.isSecureContext || !("serviceWorker" in navigator))return Promise.resolve(null);
    if(!workerPromise){
      // Browser and GPT register this exact same URL/scope; never replace the
      // proxy router with a competing PWA service worker.
      workerPromise=navigator.serviceWorker.register(new URL("servy.js",baseURL).href,{
        scope:baseURL.pathname,type:"classic",updateViaCache:"none"
      }).catch(error=>{workerPromise=null;console.warn("Genesis install setup:",error);return null;});
    }
    return workerPromise;
  }
  global.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    deferredPrompt=event;
    installed=false;
    updateButtons();
    if(dialog?.open)dialog.querySelector(".genesis-install-native").hidden=false;
  });
  global.addEventListener("appinstalled",()=>{
    installed=true;deferredPrompt=null;dialog?.close();updateButtons();
  });
  standalone.addEventListener("change",event=>{
    installed=event.matches||navigator.standalone===true;updateButtons();
  });
  document.addEventListener("click",event=>{
    if(event.target.closest?.("[data-genesis-install]"))install();
  });
  function init(){updateButtons();registerWorker();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
  global.GenesisInstall=Object.freeze({install,registerWorker,refresh:updateButtons});
})(window);
