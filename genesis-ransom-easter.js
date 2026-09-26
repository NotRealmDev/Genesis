(function(global){
  "use strict";

  const TAPE_ZERO_VIDEO_ID="Ih67uamFYNs";
  const RECREATED_VIDEO_ID="F3k-Rv9Bje8";
  const INTRO_DURATION_MS=12150;
  const GAME_DURATION_MS=60000;
  const COIN_VALUE=100;
  const TARGET_COINS=500;
  const PENDING_KEY="genesisRansomPending";
  const UNLOCK_KEY="genesisGlitchUnlocked";
  const THEME_KEY="genesisGlitchTheme";
  const SYMBOL_DATA="data:image/webp;base64,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";
  const JUMP_AUDIO_DATA="data:audio/mpeg;base64,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";

  let active=false;
  let introTimer=0;
  const eventState={root:null,score:0,deadline:0,tick:0,chaos:0,ended:false,audioFrame:null};

  function isLoginPage(){
    const path=location.pathname||"/";
    return /(?:^|\/)index\.html$/i.test(path)||path==="/"||path==="";
  }
  function isOsPage(){return /(?:^|\/)os\.html$/i.test(location.pathname||"")}
  function credentialsMatch(){
    const username=String(document.getElementById("username")?.value||"").trim().toLowerCase();
    const password=String(document.getElementById("password")?.value||"").toLowerCase();
    return username==="ransom"&&password==="ransom";
  }
  function youtubeEmbed(id,params={}){
    const query=new URLSearchParams({autoplay:"1",controls:"0",disablekb:"1",fs:"0",modestbranding:"1",playsinline:"1",rel:"0",iv_load_policy:"3",...params});
    return `https://www.youtube-nocookie.com/embed/${id}?${query.toString()}`;
  }
  function sourceFrame(id,params,className){
    const frame=document.createElement("iframe");
    frame.className=className||"ransom-source-frame";
    frame.src=youtubeEmbed(id,params);
    frame.allow="autoplay; encrypted-media; picture-in-picture";
    frame.referrerPolicy="strict-origin-when-cross-origin";
    frame.setAttribute("frameborder","0");
    frame.tabIndex=-1;
    return frame;
  }
  function forceLogout(){
    try{localStorage.removeItem("genesisLogin")}catch{}
    try{sessionStorage.removeItem("realmAuth");sessionStorage.removeItem("realmUser");sessionStorage.removeItem("genesisRole")}catch{}
    location.replace("index.html");
  }

  function startIntro(){
    if(active)return;
    active=true;
    try{localStorage.setItem(PENDING_KEY,"1")}catch{}
    document.documentElement.classList.add("genesis-ransom-running");
    const root=document.createElement("div");
    root.id="genesisRansomEgg";
    root.className="genesis-ransom-egg intro-stage";
    const shell=document.createElement("div");
    shell.className="genesis-tape-shell";
    shell.append(sourceFrame(TAPE_ZERO_VIDEO_ID,{start:"0",end:"12"},"genesis-tape-video"));
    shell.insertAdjacentHTML("beforeend",'<div class="genesis-vhs-scan"></div><div class="genesis-vhs-flicker"></div>');
    root.appendChild(shell);
    document.body.appendChild(root);
    clearTimeout(introTimer);
    introTimer=setTimeout(enterRansomOS,INTRO_DURATION_MS);
  }
  function enterRansomOS(){
    const expires=Date.now()+15*60*1000;
    try{localStorage.setItem("genesisLogin",JSON.stringify({user:"RANSOM",role:"user",expires}))}catch{}
    try{sessionStorage.setItem("realmAuth","1");sessionStorage.setItem("realmUser","RANSOM");sessionStorage.setItem("genesisRole","user")}catch{}
    location.replace("os.html?ransomEvent=1");
  }
  function intercept(event){
    if(!credentialsMatch())return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();startIntro();
  }
  function installLoginTrigger(){
    document.addEventListener("click",event=>{if(event.target?.closest?.("#loginButton"))intercept(event)},true);
    document.addEventListener("keydown",event=>{
      if(event.key==="Enter"&&(event.target?.id==="password"||event.target?.id==="username"))intercept(event);
    },true);
  }

  function lockApps(){
    document.documentElement.classList.add("genesis-ransom-event-running");
    document.querySelectorAll(".desktop-icon .app-icon,.dock-app").forEach(host=>{
      if(host.querySelector(".ransom-lock-symbol"))return;
      const img=document.createElement("img");
      img.className="ransom-lock-symbol";
      img.src=SYMBOL_DATA;
      img.alt="";
      host.appendChild(img);
    });
  }
  function unlockApps(){
    document.documentElement.classList.remove("genesis-ransom-event-running");
    document.querySelectorAll(".ransom-lock-symbol").forEach(node=>node.remove());
  }
  function startEventAudio(start=5,end=39,loop=true){
    eventState.audioFrame?.remove();
    const params={start:String(start),end:String(end)};
    if(loop){params.loop="1";params.playlist=RECREATED_VIDEO_ID}
    const frame=sourceFrame(RECREATED_VIDEO_ID,params,"ransom-event-audio");
    eventState.audioFrame=frame;
    eventState.root?.appendChild(frame);
  }
  function stopEventAudio(){eventState.audioFrame?.remove();eventState.audioFrame=null}

  function hudHTML(){
    return `<div class="ransom-main-window" id="ransomHud">
      <div class="ransom-title-strip"></div>
      <div class="ransom-hud-body"><img src="${SYMBOL_DATA}" alt=""><div><strong>YOUR FILES<br>HAVE BEEN<br>ENCRYPTED</strong><small>COLLECT 500 COINS BEFORE TIME EXPIRES</small></div></div>
      <div class="ransom-hud-footer"><b id="ransomRemaining">500</b><span class="ransom-mini-coin">◆</span><i></i><b>TIME:</b><span id="ransomTimer">01:00</span></div>
    </div>`;
  }
  function updateHud(){
    const remaining=Math.max(0,TARGET_COINS-eventState.score);
    const left=Math.max(0,eventState.deadline-Date.now());
    const seconds=Math.ceil(left/1000);
    const timer=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
    const amount=document.getElementById("ransomRemaining");
    const clock=document.getElementById("ransomTimer");
    if(amount)amount.textContent=String(remaining);
    if(clock)clock.textContent=timer;
  }
  function spawnChaosWindow(){
    if(eventState.ended||!eventState.root)return;
    const node=document.createElement("div");
    const purple=Math.random()<.38;
    node.className="ransom-chaos-window "+(purple?"purple":"red");
    const width=Math.round(150+Math.random()*190);
    const height=Math.round(85+Math.random()*145);
    node.style.width=width+"px";
    node.style.height=height+"px";
    node.style.left=Math.round(8+Math.random()*Math.max(40,innerWidth-width-45))+"px";
    node.style.top=Math.round(35+Math.random()*Math.max(50,innerHeight-height-95))+"px";
    if(purple){
      node.innerHTML='<div class="ransom-title-strip"></div><div class="ransom-static"></div>';
    }else{
      node.innerHTML=`<div class="ransom-title-strip"></div><div class="ransom-red-fill">${Math.random()<.58?`<img src="${SYMBOL_DATA}" alt="">`:""}</div>`;
    }
    eventState.root.appendChild(node);
    requestAnimationFrame(()=>node.classList.add("show"));
    setTimeout(()=>{node.classList.add("closing");setTimeout(()=>node.remove(),180)},650+Math.random()*1450);
  }
  function randomCoinPosition(coin){
    const margin=34;
    const maxX=Math.max(margin,innerWidth-90);
    const maxY=Math.max(90,innerHeight-105);
    coin.style.left=Math.round(margin+Math.random()*(maxX-margin))+"px";
    coin.style.top=Math.round(70+Math.random()*(maxY-70))+"px";
  }
  function spawnCoin(){
    if(eventState.ended||eventState.score>=TARGET_COINS||!eventState.root)return;
    document.querySelector(".ransom-coin")?.remove();
    const coin=document.createElement("button");
    coin.type="button";
    coin.className="ransom-coin";
    coin.setAttribute("data-ransom-interactive","1");
    coin.innerHTML='<span>◆</span><small>100</small>';
    randomCoinPosition(coin);
    coin.addEventListener("click",event=>{
      event.preventDefault();event.stopPropagation();
      if(eventState.ended)return;
      const rect=coin.getBoundingClientRect();
      coin.remove();
      eventState.score=Math.min(TARGET_COINS,eventState.score+COIN_VALUE);
      updateHud();
      const pop=document.createElement("div");
      pop.className="ransom-plus";pop.textContent="+100";pop.style.left=rect.left+"px";pop.style.top=rect.top+"px";
      eventState.root.appendChild(pop);setTimeout(()=>pop.remove(),650);
      if(eventState.score>=TARGET_COINS)winEvent();else setTimeout(spawnCoin,280);
    },{once:true});
    eventState.root.appendChild(coin);
  }
  function clearEventTimers(){clearInterval(eventState.tick);clearInterval(eventState.chaos);eventState.tick=0;eventState.chaos=0}
  function winEvent(){
    if(eventState.ended)return;
    eventState.ended=true;clearEventTimers();document.querySelector(".ransom-coin")?.remove();
    try{localStorage.setItem(UNLOCK_KEY,"1");localStorage.removeItem(PENDING_KEY)}catch{}
    stopEventAudio();
    eventState.root.querySelectorAll(".ransom-chaos-window,.ransom-main-window").forEach(node=>node.remove());
    const card=document.createElement("div");
    card.className="ransom-thank-you";
    card.innerHTML='<strong>THANK YOU!</strong><div class="thank-coin">◆</div>';
    eventState.root.appendChild(card);
    startEventAudio(37,41,false);
    setTimeout(forceLogout,3200);
  }
  function loseEvent(){
    if(eventState.ended)return;
    eventState.ended=true;clearEventTimers();
    try{localStorage.removeItem(PENDING_KEY)}catch{}
    stopEventAudio();unlockApps();
    eventState.root.innerHTML=`<div class="ransom-jumpscare"><div class="jump-currency">✦ 119&nbsp;&nbsp; ◈ 2,060&nbsp;&nbsp; ◆ 520</div><img src="${SYMBOL_DATA}" alt=""><div class="jump-health"><i></i></div><audio id="ransomJumpAudio" src="${JUMP_AUDIO_DATA}" autoplay></audio></div>`;
    const audio=document.getElementById("ransomJumpAudio");
    audio?.play?.().catch(()=>{});
    setTimeout(forceLogout,1150);
  }
  function startOsEvent(){
    if(active||!isOsPage())return;
    if(localStorage.getItem(PENDING_KEY)!=="1")return;
    const os=document.getElementById("os");
    if(!os){setTimeout(startOsEvent,250);return}
    active=true;eventState.ended=false;eventState.score=0;eventState.deadline=Date.now()+GAME_DURATION_MS;
    lockApps();
    const root=document.createElement("div");
    root.id="genesisRansomOS";root.className="genesis-ransom-os-layer";root.innerHTML=hudHTML();
    eventState.root=root;document.body.appendChild(root);
    startEventAudio();
    for(let i=0;i<7;i++)setTimeout(spawnChaosWindow,180+i*190);
    eventState.chaos=setInterval(spawnChaosWindow,720);
    eventState.tick=setInterval(()=>{
      updateHud();
      if(Date.now()>=eventState.deadline)loseEvent();
    },100);
    updateHud();setTimeout(spawnCoin,850);
  }

  function setGlitchTheme(enabled){
    const on=!!enabled;
    document.documentElement.classList.toggle("genesis-glitch-theme",on);
    try{localStorage.setItem(THEME_KEY,on?"1":"0")}catch{}
    let layer=document.getElementById("genesisGlitchThemeLayer");
    if(on&&!layer){layer=document.createElement("div");layer.id="genesisGlitchThemeLayer";layer.className="genesis-glitch-theme-layer";document.body.appendChild(layer)}
    if(!on&&layer)layer.remove();
    const status=document.getElementById("glitchThemeStatus");if(status)status.textContent=on?"ACTIVE":"READY";
  }
  function openGlitchShop(){
    document.querySelector(".ransom-shop-window")?.remove();
    const os=document.getElementById("os")||document.body;
    const win=document.createElement("div");
    win.className="window ransom-shop-window";
    win.innerHTML=`<div class="window-header"><div class="window-controls"><button class="window-control close" type="button"></button><span class="window-control minimize"></span><span class="window-control maximize"></span></div><div class="window-title">GLITCH SHOP</div></div>
      <div class="window-content"><div class="ransom-shop-inner"><div class="shop-eyebrow">RANSOM EVENT REWARD</div><h1>GLITCH//SHOP</h1><p>A hidden theme recovered from the event.</p><div class="glitch-theme-card"><div class="glitch-preview"><span>GENESIS</span><img src="${SYMBOL_DATA}" alt=""></div><div><strong>RANSOM // REDSHIFT</strong><small>Reactive scanlines · red/violet chromatic drift · corrupted glass</small><b id="glitchThemeStatus">${localStorage.getItem(THEME_KEY)==="1"?"ACTIVE":"READY"}</b></div></div><div class="shop-actions"><button type="button" data-theme-on>APPLY GLITCH THEME</button><button type="button" data-theme-off>RESTORE NORMAL</button></div></div></div>`;
    win.querySelector(".close")?.addEventListener("click",()=>win.remove());
    win.querySelector("[data-theme-on]")?.addEventListener("click",()=>setGlitchTheme(true));
    win.querySelector("[data-theme-off]")?.addEventListener("click",()=>setGlitchTheme(false));
    os.appendChild(win);
  }
  function installGlitchReward(){
    if(!isOsPage()||localStorage.getItem(UNLOCK_KEY)!=="1")return;
    if(!document.querySelector(".ransom-shop-icon")){
      const desktop=document.querySelector(".desktop");
      if(desktop){
        const icon=document.createElement("div");
        icon.className="desktop-icon ransom-shop-icon";icon.style.left="430px";icon.style.top="375px";
        icon.innerHTML=`<div class="app-icon"><img src="${SYMBOL_DATA}" alt=""></div><div class="app-name">Glitch Shop</div>`;
        icon.addEventListener("dblclick",openGlitchShop);icon.addEventListener("click",event=>{if(event.detail===1)setTimeout(()=>{if(event.detail===1)openGlitchShop()},210)});
        desktop.appendChild(icon);
      }
      const dock=document.querySelector(".dock");
      if(dock){
        const item=document.createElement("button");item.type="button";item.className="dock-app ransom-shop-dock";item.title="Glitch Shop";item.innerHTML=`<img src="${SYMBOL_DATA}" alt=""><span class="dock-dot"></span>`;item.addEventListener("click",openGlitchShop);dock.appendChild(item);
      }
    }
    if(localStorage.getItem(THEME_KEY)==="1")setGlitchTheme(true);
  }

  function install(){
    injectStyles();
    if(isLoginPage())installLoginTrigger();
    if(isOsPage()){
      installGlitchReward();
      if(localStorage.getItem(PENDING_KEY)==="1")setTimeout(startOsEvent,650);
    }
  }
  function injectStyles(){
    if(document.getElementById("genesisRansomEasterStyles"))return;
    const style=document.createElement("style");style.id="genesisRansomEasterStyles";
    style.textContent=`
      html.genesis-ransom-running,html.genesis-ransom-running body{overflow:hidden!important;background:#000!important}
      .genesis-ransom-egg{position:fixed;inset:0;z-index:2147483647;background:#000;display:grid;place-items:center;overflow:hidden;cursor:none}
      .genesis-tape-shell{position:relative;width:min(100vw,calc(100vh * 4 / 3));height:min(100vh,calc(100vw * 3 / 4));background:#000;overflow:hidden;box-shadow:0 0 0 100vmax #000}
      .genesis-tape-video{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;transform:scale(1.006)}
      .genesis-vhs-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,rgba(0,0,0,.05) 2px,rgba(0,0,0,.05) 3px);mix-blend-mode:overlay;opacity:.65}.genesis-vhs-flicker{position:absolute;inset:-3%;background:linear-gradient(90deg,rgba(255,0,60,.025),transparent 28%,rgba(0,80,255,.03) 72%,transparent);animation:ransomFlicker .09s steps(2,end) infinite;pointer-events:none}
      .genesis-ransom-event-running .desktop-icon,.genesis-ransom-event-running .dock-app,.genesis-ransom-event-running .quick,.genesis-ransom-event-running .account-button,.genesis-ransom-event-running .window{pointer-events:none!important;filter:saturate(.35) brightness(.72)}
      .genesis-ransom-event-running .app-icon,.genesis-ransom-event-running .dock-app{position:relative;overflow:hidden!important;border-color:rgba(255,0,35,.65)!important;background:#350008!important}.ransom-lock-symbol{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;opacity:.9!important;filter:contrast(1.25) saturate(.35)!important;mix-blend-mode:screen;pointer-events:none;animation:ransomIconGlitch .32s steps(2,end) infinite}
      .genesis-ransom-os-layer{position:fixed;inset:0;z-index:2147480000;pointer-events:none;overflow:hidden;background:linear-gradient(rgba(125,0,0,.055),rgba(0,0,0,.02));font-family:Arial Black,Impact,system-ui,sans-serif}.genesis-ransom-os-layer:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent 0 3px,rgba(255,0,25,.035) 4px);pointer-events:none}
      .ransom-event-audio{position:absolute;width:1px;height:1px;left:-10px;top:-10px;opacity:.001;border:0}
      .ransom-main-window{position:absolute;left:20%;top:13%;width:315px;background:#ec001f;border:4px solid #280006;box-shadow:9px 9px 0 rgba(0,0,0,.32);z-index:2147481800;animation:ransomWinIn .17s steps(3,end)}.ransom-title-strip{height:14px;background:#fff;border-bottom:4px solid #270006}.ransom-hud-body{display:grid;grid-template-columns:112px 1fr;min-height:112px}.ransom-hud-body img{width:112px;height:112px;object-fit:cover;filter:contrast(1.35) saturate(.25)}.ransom-hud-body>div{padding:8px 7px 5px;text-align:center}.ransom-hud-body strong{display:block;color:#fff;font-size:17px;line-height:.98;letter-spacing:.5px}.ransom-hud-body small{display:block;margin-top:7px;color:#090000;font:800 7px/1.25 Arial,sans-serif}.ransom-hud-footer{height:31px;background:#080003;color:#fff;display:flex;align-items:center;gap:7px;padding:0 8px;font:900 12px/1 monospace}.ransom-hud-footer #ransomRemaining{color:#d9ff13;font-size:16px}.ransom-mini-coin{color:#ffe951;font-size:17px}.ransom-hud-footer i{width:2px;height:18px;background:#df1025;margin:0 3px}.ransom-hud-footer #ransomTimer{color:#ff2338;font-size:16px}
      .ransom-chaos-window{position:absolute;z-index:2147481200;border:3px solid #470008;box-shadow:8px 8px 0 rgba(0,0,0,.2);opacity:0;transform:scale(.72) translateY(12px)}.ransom-chaos-window.show{opacity:1;transform:none;transition:.13s steps(3,end)}.ransom-chaos-window.closing{opacity:0;transform:scale(.7);transition:.14s steps(2,end)}.ransom-chaos-window.red{background:#bd001c}.ransom-red-fill{height:calc(100% - 14px);display:grid;place-items:center;background:#b9001b}.ransom-red-fill img{width:min(90%,150px);height:min(90%,150px);object-fit:cover;filter:saturate(.3) contrast(1.4)}.ransom-chaos-window.purple{background:#18051d}.ransom-static{height:calc(100% - 14px);background:repeating-linear-gradient(0deg,#160019 0 2px,#5d175e 3px 4px,#250127 5px 7px,#852c79 8px 9px);animation:ransomStatic .08s steps(2,end) infinite}
      .ransom-coin{position:absolute;z-index:2147482500;width:55px;height:55px;border:0;background:transparent;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 0 12px rgba(255,225,57,.85));animation:ransomCoinBob .7s ease-in-out infinite alternate}.ransom-coin span{width:43px;height:43px;margin:auto;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8a1,#ffd719 35%,#e19a00 70%,#8a4d00);border:3px solid #fff17b;color:#fff4a2;font-size:25px;transform:rotate(45deg);box-shadow:inset 0 0 0 3px rgba(126,71,0,.25)}.ransom-coin small{display:block;margin-top:3px;color:#fff;font:900 9px/1 monospace;text-shadow:0 2px 4px #000}.ransom-plus{position:absolute;z-index:2147482600;color:#fff45b;font:900 24px/1 monospace;text-shadow:2px 2px #000;animation:ransomPlus .65s ease-out forwards}
      .ransom-thank-you{position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);z-index:2147483000;width:310px;height:178px;background:#16e329;border:4px solid #087d13;box-shadow:8px 8px 0 rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:ransomWinIn .16s steps(3,end)}.ransom-thank-you strong{color:#fff;font:900 30px/1 Impact,Arial Black,sans-serif;font-style:italic}.thank-coin{margin-top:16px;width:62px;height:62px;border:7px solid #64ff5b;border-radius:50%;display:grid;place-items:center;color:#09720f;font-size:34px}
      .ransom-jumpscare{position:fixed;inset:0;z-index:2147483647;background:#9f0000;overflow:hidden;display:grid;place-items:center;animation:ransomJumpShake .07s steps(2,end) infinite}.ransom-jumpscare:before{content:"";position:absolute;inset:0;background:radial-gradient(circle,rgba(255,0,0,.08),#7b0000 72%);animation:ransomPulse .12s steps(2,end) infinite}.ransom-jumpscare>img{position:relative;width:min(60vw,630px);height:min(82vh,630px);object-fit:cover;filter:contrast(1.8) saturate(.25) brightness(.78);mix-blend-mode:multiply;animation:ransomFace .12s steps(2,end) infinite}.jump-currency{position:absolute;right:4%;top:2%;z-index:3;color:#fff;font:900 20px/1 Arial,sans-serif;text-shadow:2px 2px 4px #000}.jump-health{position:absolute;left:4%;bottom:5%;width:250px;height:24px;border:5px solid #fff;border-radius:8px;z-index:3;box-shadow:0 0 0 3px #661919}.jump-health i{display:block;width:58%;height:100%;background:#fff3c3}
      .ransom-shop-icon .app-icon,.ransom-shop-dock{background:linear-gradient(135deg,#0a0005,#6b001a 55%,#1b002b)!important;border-color:rgba(255,70,113,.55)!important;box-shadow:0 0 22px rgba(255,0,68,.22)!important}.ransom-shop-icon img,.ransom-shop-dock img{width:80%;height:80%;object-fit:cover;filter:contrast(1.5) saturate(.4);animation:ransomIconGlitch .4s steps(2,end) infinite}.ransom-shop-window{z-index:9000!important;border-color:rgba(255,28,83,.5)!important;background:linear-gradient(145deg,rgba(31,0,13,.96),rgba(11,0,28,.94))!important}.ransom-shop-inner{padding:28px}.shop-eyebrow{color:#ff386b;font-size:9px;font-weight:900;letter-spacing:.18em}.ransom-shop-inner h1{font-size:31px;margin:8px 0 3px;letter-spacing:-1px;text-shadow:2px 0 #ff184f,-2px 0 #651bff}.ransom-shop-inner>p{margin:0 0 20px;color:rgba(255,255,255,.55);font-size:11px}.glitch-theme-card{display:grid;grid-template-columns:170px 1fr;gap:18px;padding:16px;border:1px solid rgba(255,56,107,.22);border-radius:16px;background:rgba(255,255,255,.035)}.glitch-preview{height:118px;border-radius:11px;position:relative;overflow:hidden;display:grid;place-items:center;background:repeating-linear-gradient(0deg,#090008 0 5px,#2d0010 6px 7px),linear-gradient(120deg,#660016,#170021)}.glitch-preview span{position:relative;z-index:2;font-weight:1000;font-size:24px;letter-spacing:-2px;text-shadow:4px 0 #ff003c,-4px 0 #6c1cff}.glitch-preview img{position:absolute;right:-20px;bottom:-34px;width:120px;opacity:.45;filter:contrast(1.6) saturate(.3)}.glitch-theme-card strong,.glitch-theme-card small,.glitch-theme-card b{display:block}.glitch-theme-card strong{font-size:14px}.glitch-theme-card small{margin-top:6px;color:rgba(255,255,255,.5);font-size:9px;line-height:1.5}.glitch-theme-card b{margin-top:13px;color:#ff3f73;font-size:9px}.shop-actions{display:flex;gap:9px;margin-top:16px}.shop-actions button{height:38px;padding:0 13px;border:1px solid rgba(255,56,107,.25);border-radius:10px;background:rgba(255,34,88,.1);color:#fff;font-size:9px;font-weight:800;cursor:pointer}.shop-actions button:hover{background:rgba(255,34,88,.22)}
      html.genesis-glitch-theme #os{--accent:347;background:radial-gradient(circle at 18% 20%,rgba(255,0,63,.32),transparent 32%),radial-gradient(circle at 82% 70%,rgba(101,14,255,.25),transparent 36%),linear-gradient(145deg,#080006,#1a0010 48%,#04000d)!important}html.genesis-glitch-theme .app-icon,html.genesis-glitch-theme .dock-app{box-shadow:-3px 0 rgba(255,0,69,.22),3px 0 rgba(81,37,255,.22),0 14px 34px rgba(0,0,0,.42)!important}html.genesis-glitch-theme .window{border-color:rgba(255,30,83,.2)!important}.genesis-glitch-theme-layer{position:fixed;inset:0;z-index:999999;pointer-events:none;opacity:.22;background:repeating-linear-gradient(to bottom,transparent 0 3px,rgba(255,0,70,.08) 4px),linear-gradient(90deg,rgba(255,0,70,.06),transparent 35%,rgba(78,33,255,.05));mix-blend-mode:screen;animation:glitchLayer 3.5s steps(2,end) infinite}
      @keyframes ransomFlicker{0%{opacity:.18;transform:translate(0)}50%{opacity:.42;transform:translate(-1px,1px)}100%{opacity:.22;transform:translate(1px,0)}}@keyframes ransomIconGlitch{0%,100%{transform:translate(0);filter:contrast(1.4) saturate(.3)}35%{transform:translate(2px,-1px);filter:contrast(1.7) hue-rotate(-8deg)}70%{transform:translate(-2px,1px);filter:contrast(1.3) hue-rotate(9deg)}}@keyframes ransomWinIn{from{opacity:0;transform:translateY(8px) scale(.8)}to{opacity:1;transform:none}}@keyframes ransomStatic{to{background-position:0 9px}}@keyframes ransomCoinBob{to{transform:translateY(-8px) rotate(4deg)}}@keyframes ransomPlus{to{opacity:0;transform:translateY(-34px) scale(1.3)}}@keyframes ransomJumpShake{0%{transform:translate(-8px,4px)}50%{transform:translate(8px,-4px)}100%{transform:translate(-4px,-2px)}}@keyframes ransomFace{0%{transform:scale(.96) rotate(-1deg)}50%{transform:scale(1.08) rotate(1deg)}100%{transform:scale(1.01)}}@keyframes ransomPulse{50%{filter:brightness(1.7)}}@keyframes glitchLayer{0%,90%,100%{transform:none;clip-path:inset(0)}92%{transform:translateX(5px);clip-path:inset(18% 0 62% 0)}95%{transform:translateX(-6px);clip-path:inset(66% 0 12% 0)}}
      @media(max-width:650px){.ransom-main-window{left:6%;top:10%;transform:scale(.82);transform-origin:top left}.glitch-theme-card{grid-template-columns:1fr}.ransom-shop-inner{padding:18px}}
      @media(prefers-reduced-motion:reduce){.genesis-vhs-flicker,.ransom-lock-symbol,.ransom-static,.genesis-glitch-theme-layer{animation:none}}
    `;
    document.head.appendChild(style);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();

  global.GenesisRansomEaster=Object.freeze({
    start:startIntro,startIntro,startOsEvent,credentialsMatch,openGlitchShop,setGlitchTheme,
    __test:Object.freeze({GAME_DURATION_MS,COIN_VALUE,TARGET_COINS,PENDING_KEY,UNLOCK_KEY,THEME_KEY,TAPE_ZERO_VIDEO_ID,RECREATED_VIDEO_ID})
  });
})(globalThis);
