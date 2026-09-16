(function(global){
  "use strict";

  const STYLE_ID="genesisVmStyles";
  const APP_ID="vm";
  const STARTUP_URL="https://play.geforcenow.com/";
  const state={
    connecting:false,
    viewerUrl:"",
    sessionId:"",
    expiresAt:"",
    externalWindow:null,
    pendingWindow:null
  };

  function role(){
    try{if(typeof genesisRole==="function")return String(genesisRole()||"").toLowerCase()}catch{}
    try{
      const login=JSON.parse(localStorage.getItem("genesisLogin")||"null");
      return String(login?.role||sessionStorage.getItem("genesisRole")||"user").toLowerCase();
    }catch{return String(sessionStorage.getItem("genesisRole")||"user").toLowerCase()}
  }
  function isAdmin(){return role()==="admin"}
  function escapeHTML(value){return String(value==null?"":value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}

  function config(){
    const raw=global.GENESIS_VM||{};
    return {
      provider:String(raw.provider||"Genesis VM").trim()||"Genesis VM",
      viewerUrl:String(raw.viewerUrl||"").trim(),
      sessionEndpoint:String(raw.sessionEndpoint||"").trim(),
      startupUrl:String(raw.startupUrl||STARTUP_URL).trim()||STARTUP_URL,
      sessionMode:String(raw.sessionMode||"persistent").trim()||"persistent",
      displayMode:String(raw.displayMode||"embed").trim().toLowerCase()
    };
  }
  function usesTopLevelWindow(){
    return ["tab","top-level","external","window"].includes(config().displayMode);
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
      .genesis-vm{height:100%;min-height:0;display:flex;flex-direction:column;background:#05070c;color:#fff}
      .genesis-vm-bar{height:50px;flex:none;display:flex;align-items:center;gap:9px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035)}
      .genesis-vm-title{font-size:12px;font-weight:700;white-space:nowrap}.genesis-vm-status{min-width:0;flex:1;font-size:10px;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .genesis-vm-button{height:34px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.07);color:#fff;padding:0 12px;cursor:pointer;font:600 11px/1 Inter,Poppins,system-ui,sans-serif}.genesis-vm-button:hover{background:rgba(255,255,255,.13)}.genesis-vm-button:disabled{opacity:.45;cursor:default}
      .genesis-vm-stage{position:relative;flex:1;min-height:0;background:#020307;overflow:hidden}.genesis-vm-frame{display:block;width:100%;height:100%;border:0;background:#020307}
      .genesis-vm-overlay{position:absolute;inset:0;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 50% 35%,hsla(var(--accent),80%,55%,.15),transparent 35%),#05070c;text-align:center;z-index:2}.genesis-vm-overlay.hidden{display:none}
      .genesis-vm-card{width:min(540px,92%)}.genesis-vm-icon{width:70px;height:70px;margin:0 auto 18px;border:1px solid rgba(255,255,255,.13);border-radius:22px;display:grid;place-items:center;background:rgba(255,255,255,.065)}.genesis-vm-icon svg{width:36px;height:36px;stroke:#fff;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
      .genesis-vm-card h2{margin:0 0 9px;font-size:26px;letter-spacing:-.03em}.genesis-vm-card p{margin:0 auto;color:rgba(255,255,255,.58);font-size:12px;line-height:1.6;max-width:460px}.genesis-vm-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:18px}
      .genesis-vm-spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.12);border-top-color:#fff;animation:genesisVmSpin .75s linear infinite;margin:0 auto 15px}@keyframes genesisVmSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function html(){
    queueMicrotask(()=>setTimeout(()=>global.GenesisVM?.mount?.(),0));
    return `<div class="genesis-vm" id="genesisVmRoot"><div class="genesis-vm-bar"><div class="genesis-vm-title">VM</div><div class="genesis-vm-status" id="genesisVmStatus">Preparing virtual computer…</div><button type="button" class="genesis-vm-button" id="genesisVmReconnect" onclick="GenesisVM.launch(true)">Open VM</button></div><div class="genesis-vm-stage"><iframe id="genesisVmFrame" class="genesis-vm-frame" title="Genesis virtual computer" allow="fullscreen; autoplay; clipboard-read; clipboard-write; gamepad; pointer-lock; microphone; camera" allowfullscreen></iframe><div class="genesis-vm-overlay" id="genesisVmOverlay"><div class="genesis-vm-card" id="genesisVmCard"><div class="genesis-vm-spinner"></div><p>Preparing your virtual computer…</p></div></div></div></div>`;
  }
  function setStatus(text){const el=document.getElementById("genesisVmStatus");if(el)el.textContent=String(text||"")}
  function showOverlay(markup){const overlay=document.getElementById("genesisVmOverlay"),card=document.getElementById("genesisVmCard");if(!overlay||!card)return;card.innerHTML=markup;overlay.classList.remove("hidden")}
  function hideOverlay(){document.getElementById("genesisVmOverlay")?.classList.add("hidden")}
  function loading(message="Connecting to your virtual computer…"){showOverlay(`<div class="genesis-vm-spinner"></div><p>${escapeHTML(message)}</p>`)}
  function error(message){showOverlay(`<div class="genesis-vm-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 9h6"/></svg></div><h2>VM unavailable</h2><p>${escapeHTML(message)}</p><div class="genesis-vm-actions"><button type="button" class="genesis-vm-button" onclick="GenesisVM.launch(true)">Try Again</button></div>`)}
  function notConfigured(){
    showOverlay(`<div class="genesis-vm-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h10M7 12h6"/></svg></div><h2>VM is ready to connect</h2><p>The Genesis VM app is installed, but a cloud-computer viewer or VM session endpoint has not been connected yet.</p>`);
    setStatus("VM service not configured");
  }
  function showLauncher(message){
    const cfg=config();
    showOverlay(`<div class="genesis-vm-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h10M7 12h6"/></svg></div><h2>${escapeHTML(cfg.provider)}</h2><p>${escapeHTML(message||"This provider must run as a normal browser tab instead of inside an iframe. Open the VM to continue.")}</p><div class="genesis-vm-actions"><button type="button" class="genesis-vm-button" onclick="GenesisVM.launch()">Open Virtual Computer</button></div>`);
    setStatus("Ready · open virtual computer");
  }
  function showLaunched(){
    const cfg=config();
    showOverlay(`<div class="genesis-vm-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h10M7 12h6"/></svg></div><h2>VM opened</h2><p>${escapeHTML(cfg.provider)} is running in its own browser tab because the provider does not allow iframe embedding. The actual desktop runs remotely.</p><div class="genesis-vm-actions"><button type="button" class="genesis-vm-button" onclick="GenesisVM.focusVm()">Focus VM</button><button type="button" class="genesis-vm-button" onclick="GenesisVM.launch(true)">Reconnect</button></div>`);
    setStatus("Connected · remote VM tab");
  }

  function currentIdentity(){
    let login=null;try{login=JSON.parse(localStorage.getItem("genesisLogin")||"null")}catch{}
    return {user:String(login?.user||sessionStorage.getItem("realmUser")||""),role:role(),genesisId:String(localStorage.getItem("genesisDisplayId")||"")};
  }
  function normalizeViewerUrl(value){try{const url=new URL(String(value||""),location.href);return url.protocol==="https:"||url.protocol==="http:"?url.href:""}catch{return""}}

  async function adminToken(){
    if(!isAdmin())throw new Error("Administrator access is required.");
    if(typeof global.genesisAdminSession!=="function")throw new Error("Genesis admin authentication is unavailable. Sign in again.");
    return await global.genesisAdminSession();
  }

  async function requestSession(endpoint,startupUrl){
    const backend=global.GENESIS_BACKEND||{};
    const token=await adminToken();
    const headers={"Content-Type":"application/json","Accept":"application/json","Authorization":`Bearer ${token}`};
    if(backend.anonKey)headers.apikey=backend.anonKey;
    const response=await fetch(endpoint,{method:"POST",headers,cache:"no-store",body:JSON.stringify({...currentIdentity(),startupUrl,app:"Genesis VM",persistent:true})});
    if(!response.ok)throw new Error((await response.text())||`VM session request failed (${response.status})`);
    const data=await response.json();
    const url=normalizeViewerUrl(data?.url||data?.viewerUrl||data?.sessionUrl);
    if(!url)throw new Error("The VM service did not return a valid viewer URL.");
    state.sessionId=String(data?.sessionId||data?.id||"");state.expiresAt=String(data?.expiresAt||"");return url;
  }

  async function resolveViewer(force=false){
    const cfg=config();if(!force&&state.viewerUrl)return state.viewerUrl;
    if(cfg.sessionEndpoint){state.viewerUrl=await requestSession(cfg.sessionEndpoint,cfg.startupUrl);return state.viewerUrl}
    const fixed=normalizeViewerUrl(cfg.viewerUrl);if(fixed){state.viewerUrl=fixed;return fixed}return"";
  }

  function prepareExternalWindow(){
    let popup=null;
    try{
      popup=global.open("about:blank","GenesisVMCloud");
      if(popup){
        try{
          popup.document.title="Genesis VM";
          popup.document.documentElement.style.cssText="background:#05070c;color:white;font-family:system-ui;height:100%";
          popup.document.body.style.cssText="margin:0;height:100%;display:grid;place-items:center;background:#05070c;color:white";
          popup.document.body.innerHTML="<div style='text-align:center;opacity:.78'><div style='font-size:22px;font-weight:700;margin-bottom:8px'>Genesis VM</div><div style='font-size:13px'>Connecting to remote computer…</div></div>";
        }catch{}
      }
    }catch{}
    return popup;
  }

  async function connect(force=false,popup=null){
    if(!isAdmin()){error("This app is available only to Genesis administrators.");return}
    if(state.connecting)return;
    state.connecting=true;
    const button=document.getElementById("genesisVmReconnect");if(button)button.disabled=true;
    loading(force?"Reconnecting to your virtual computer…":"Starting your virtual computer…");setStatus("Connecting…");
    try{
      if(force)state.viewerUrl="";
      const url=await resolveViewer(force);if(!url){notConfigured();try{popup?.close()}catch{}return}

      if(usesTopLevelWindow()){
        const target=popup || state.externalWindow;
        if(!target || target.closed){
          try{popup?.close()}catch{}
          showLauncher("Your browser blocked the automatic VM tab. Select Open Virtual Computer to launch it.");
          return;
        }
        try{target.location.replace(url)}catch{target.location.href=url}
        state.externalWindow=target;
        try{target.focus()}catch{}
        showLaunched();
        return;
      }

      const frame=document.getElementById("genesisVmFrame");if(!frame)throw new Error("The VM display is not available.");
      let settled=false;const timeout=setTimeout(()=>{if(!settled)setStatus("VM is taking longer than expected…")},12000);
      frame.onload=()=>{settled=true;clearTimeout(timeout);hideOverlay();setStatus(state.sessionId?`Connected · session ${state.sessionId}`:"Connected · virtual computer")};
      frame.onerror=()=>{settled=true;clearTimeout(timeout);error("The virtual-computer viewer could not be loaded inside Genesis.");setStatus("VM connection failed")};
      frame.src=url;
    }catch(err){
      console.error("Genesis VM connection failed:",err);
      try{popup?.close()}catch{}
      error(err?.message||String(err));setStatus("VM connection failed");
    }finally{
      state.connecting=false;if(button)button.disabled=false;
    }
  }

  function focusVm(){
    if(state.externalWindow && !state.externalWindow.closed){try{state.externalWindow.focus()}catch{};return true}
    showLauncher("The previous VM tab is no longer open. Select Open Virtual Computer to reconnect.");
    return false;
  }

  function launch(force=false){
    if(!isAdmin())return;
    let popup=null;
    if(usesTopLevelWindow()){
      if(!force && state.externalWindow && !state.externalWindow.closed){focusVm();return}
      popup=prepareExternalWindow();
      if(!popup){showLauncher("Pop-ups are blocked for Genesis. Allow pop-ups for this site, then select Open Virtual Computer again.");return}
      state.externalWindow=popup;
    }

    try{
      if(typeof openApp==="function" && !(typeof openWindows==="object" && openWindows.vm))openApp(APP_ID);
      else if(typeof openWindows==="object" && openWindows.vm)focusWindow?.(openWindows.vm);
    }catch{}

    connect(force,popup);
  }

  function attachIconDrag(icon){
    const desktop=document.getElementById("desktop");if(!desktop)return;
    const saved=localStorage.getItem("realmOsIcon_"+APP_ID);if(saved){try{const p=JSON.parse(saved);icon.style.left=p.x+"px";icon.style.top=p.y+"px"}catch{}}
    let dragging=false,moved=false,sx=0,sy=0,bx=0,by=0;
    icon.addEventListener("pointerdown",event=>{document.querySelectorAll(".desktop-icon").forEach(item=>item.classList.remove("selected"));icon.classList.add("selected");dragging=true;moved=false;sx=event.clientX;sy=event.clientY;bx=parseFloat(icon.style.left)||0;by=parseFloat(icon.style.top)||0;icon.classList.add("dragging");try{icon.setPointerCapture(event.pointerId)}catch{}});
    icon.addEventListener("pointermove",event=>{if(!dragging)return;const dx=event.clientX-sx,dy=event.clientY-sy;if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;icon.style.left=Math.max(0,Math.min(desktop.clientWidth-icon.offsetWidth,bx+dx))+"px";icon.style.top=Math.max(0,Math.min(desktop.clientHeight-icon.offsetHeight,by+dy))+"px"});
    icon.addEventListener("pointerup",()=>{dragging=false;icon.classList.remove("dragging");if(moved){try{localStorage.setItem("realmOsIcon_"+APP_ID,JSON.stringify({x:parseFloat(icon.style.left),y:parseFloat(icon.style.top)}))}catch{}}});
    icon.addEventListener("dblclick",()=>{if(!moved)launch(false)});
  }

  function installIcon(){
    if(!isAdmin())return;const desktop=document.getElementById("desktop");if(!desktop||desktop.querySelector('[data-app="vm"]'))return;
    const icon=document.createElement("div");icon.className="desktop-icon admin-only-icon";icon.dataset.adminOnly="1";icon.dataset.app=APP_ID;icon.style.left="330px";icon.style.top="260px";
    icon.innerHTML=`<div class="app-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h10M7 12h6"/></svg></div><div class="app-name">VM</div>`;desktop.appendChild(icon);attachIconDrag(icon);
  }
  function registerApp(){if(!isAdmin())return;try{if(typeof apps!=="object"||!apps)return;apps[APP_ID]={title:"VM",adminOnly:true,content:html}}catch(err){console.warn("Genesis VM could not register with the OS app table yet.",err)}}
  function mount(){
    if(!isAdmin())return;injectStyles();
    try{if(typeof openWindows==="object"&&openWindows.vm)openWindows.vm.classList.add("maximized")}catch{}
    if(usesTopLevelWindow()){
      const pending=state.pendingWindow;state.pendingWindow=null;
      if(pending)connect(false,pending);else if(state.externalWindow&&!state.externalWindow.closed)showLaunched();else showLauncher();
    }else connect(false);
  }
  function install(){if(!isAdmin())return;injectStyles();registerApp();installIcon()}

  global.GenesisVM={install,mount,connect,launch,focusVm,isAdmin,config,state};install();
})(window);