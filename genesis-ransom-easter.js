(function(global){
  "use strict";

  const ASSETS=Object.freeze({
    tapeZero:"assets/ransom/tape-zero.mp4",
    encrypted:"assets/ransom/encrypted.mp3",
    coinSound:"assets/ransom/coins.mp3",
    thankYouSound:"assets/ransom/thank-you.mp3",
    jumpscare:"assets/ransom/jumpscare.mp4",
    hud:"assets/ransom/hud.png",
    skull:"assets/ransom/skull-static.png",
    purpleVertical:"assets/ransom/purple-static-vertical.png",
    redStatic:"assets/ransom/red-static.png",
    purpleHorizontal:"assets/ransom/purple-static-horizontal.png",
    coin:"assets/ransom/coin.png",
    thankYou:"assets/ransom/thank-you.png",
    stopHand:"assets/ransom/stop-hand.png"
  });
  const GAME_DURATION_MS=63_000;
  const COIN_VALUE=100;
  const COIN_COUNT=5;
  const TARGET_COINS=COIN_VALUE*COIN_COUNT;
  const GLITCH_UNLOCK_KEY="genesisRansomGlitchUnlocked";
  const RANSOM_SESSION_KEY="genesisRansomSession";
  const INTRO_TIMEOUT_MS=16_000;
  const RESULT_DISPLAY_MS=4_200;

  let introActive=false;
  let introRoot=null;
  let introWatchdog=0;
  let eventState=null;

  function asset(name){
    const path=ASSETS[name];
    if(!path)throw new Error("Unknown RANSOM asset");
    return new URL(path,document.baseURI||location.href).href;
  }
  function storageGet(storage,key){
    try{return storage?.getItem(key)||""}catch{return ""}
  }
  function storageSet(storage,key,value){
    try{storage?.setItem(key,value)}catch{}
  }
  function storageRemove(storage,key){
    try{storage?.removeItem(key)}catch{}
  }
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
  function formatTime(milliseconds){
    const seconds=Math.ceil(Math.max(0,milliseconds)/1000);
    const minutes=Math.floor(seconds/60);
    return String(minutes).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
  }
  function clearIntro(){
    clearTimeout(introWatchdog);
    introWatchdog=0;
    document.removeEventListener("keydown",onIntroKeydown,true);
    document.documentElement.classList.remove("genesis-ransom-running");
    introRoot?.remove();
    introRoot=null;
    introActive=false;
  }
  function onIntroKeydown(event){
    if(event.key!=="Escape")return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    clearIntro();
  }
  function introError(){
    clearTimeout(introWatchdog);
    if(!introRoot)return;
    introRoot.classList.remove("playing");
    introRoot.innerHTML=`<section class="ransom-start-card" role="dialog" aria-modal="true">
      <img class="ransom-stop-hand" src="${asset("stopHand")}" alt="">
      <h1>TAPE ZERO COULD NOT PLAY</h1>
      <p>The local clip could not be loaded. The event has stopped; no files or settings were changed.</p>
      <button type="button" data-ransom-exit>EXIT</button>
    </section>`;
    introRoot.querySelector("[data-ransom-exit]")?.addEventListener("click",clearIntro,{once:true});
  }
  function enterRansomOs(){
    if(!introRoot)return;
    clearTimeout(introWatchdog);
    document.removeEventListener("keydown",onIntroKeydown,true);
    introRoot.remove();
    introRoot=null;
    introActive=false;
    document.documentElement.classList.remove("genesis-ransom-running");

    const expires=Date.now()+(12*60*60*1000);
    storageSet(global.localStorage,"genesisLogin",JSON.stringify({user:"RANSOM",role:"user",expires}));
    storageSet(global.sessionStorage,"realmAuth","1");
    storageSet(global.sessionStorage,"realmUser","RANSOM");
    storageSet(global.sessionStorage,"genesisRole","user");
    storageSet(global.sessionStorage,RANSOM_SESSION_KEY,"1");

    const next=new URL("os.html",location.href);
    next.searchParams.set("ransomEvent","1");
    location.replace(next.pathname+next.search+next.hash);
  }
  function playTape(){
    if(!introRoot)return;
    introRoot.classList.add("playing");
    introRoot.innerHTML=`<div class="ransom-tape-frame">
      <video class="ransom-tape-video" playsinline preload="auto" aria-label="Local Tape Zero footage"></video>
      <button class="ransom-exit-button" type="button" data-ransom-exit>EXIT</button>
      <div class="ransom-tape-caption">TAPE ZERO · LOCAL VIDEO</div>
    </div>`;
    const video=introRoot.querySelector("video");
    video.src=asset("tapeZero");
    video.addEventListener("ended",enterRansomOs,{once:true});
    video.addEventListener("error",introError,{once:true});
    introRoot.querySelector("[data-ransom-exit]")?.addEventListener("click",clearIntro,{once:true});
    introWatchdog=setTimeout(()=>{
      if(!introRoot)return;
      if(video.readyState>=2)enterRansomOs();
      else introError();
    },INTRO_TIMEOUT_MS);
    const playing=video.play();
    playing?.catch?.(()=>{});
  }
  function startIntro(){
    if(introActive)return;
    global.GenesisUI?.pauseMusic?.();
    introActive=true;
    document.documentElement.classList.add("genesis-ransom-running");
    const root=document.createElement("div");
    root.id="genesisRansomIntro";
    root.className="genesis-ransom-intro";
    root.innerHTML=`<section class="ransom-start-card" role="dialog" aria-modal="true" aria-labelledby="ransomStartTitle">
      <img class="ransom-stop-hand" src="${asset("stopHand")}" alt="">
      <div class="ransom-safe-tag">SAFE GAME SIMULATION</div>
      <h1 id="ransomStartTitle">RANSOM://WARNING</h1>
      <p>This is a timed coin hunt. It does not read, change, or encrypt your files.</p>
      <p class="ransom-instructions">Watch Tape Zero, then collect five 100-coin tokens in 01:03.</p>
      <div class="ransom-start-actions">
        <button type="button" data-ransom-start>PLAY TAPE ZERO</button>
        <button type="button" data-ransom-exit>EXIT</button>
      </div>
    </section>`;
    introRoot=root;
    document.body.appendChild(root);
    document.addEventListener("keydown",onIntroKeydown,true);
    root.querySelector("[data-ransom-start]")?.addEventListener("click",playTape,{once:true});
    root.querySelector("[data-ransom-exit]")?.addEventListener("click",clearIntro,{once:true});
  }
  function interceptLogin(event){
    if(!credentialsMatch()){
      storageRemove(global.sessionStorage,RANSOM_SESSION_KEY);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    startIntro();
  }
  function installLoginTrigger(){
    document.addEventListener("click",event=>{
      if(event.target?.closest?.("#loginButton"))interceptLogin(event);
    },true);
    document.addEventListener("keydown",event=>{
      if(event.key==="Enter"&&(event.target?.id==="username"||event.target?.id==="password"))interceptLogin(event);
    },true);
  }

  function lockApps(){
    document.documentElement.classList.add("genesis-ransom-event-running");
    document.querySelectorAll(".desktop-icon .app-icon,.dock-app").forEach(host=>{
      if(host.querySelector(".ransom-lock-symbol"))return;
      const img=document.createElement("img");
      img.className="ransom-lock-symbol";
      img.src=asset("skull");
      img.alt="";
      host.appendChild(img);
    });
  }
  function unlockApps(){
    document.documentElement.classList.remove("genesis-ransom-event-running");
    document.querySelectorAll(".ransom-lock-symbol").forEach(node=>node.remove());
  }
  function createAudio(name,loop=false,volume=0.85){
    const player=new global.Audio(asset(name));
    player.preload="auto";
    player.loop=loop;
    player.volume=volume;
    return player;
  }
  function tryPlay(player){
    try{const result=player?.play?.();result?.catch?.(()=>{})}catch{}
  }
  function clearStateTimers(state){
    if(state.clock)clearInterval(state.clock);
    if(state.chaos)clearInterval(state.chaos);
    for(const timer of state.timeouts)clearTimeout(timer);
    state.timeouts.clear();
  }
  function schedule(state,callback,delay){
    const timer=setTimeout(()=>{
      state.timeouts.delete(timer);
      if(!state.ended)callback();
    },delay);
    state.timeouts.add(timer);
    return timer;
  }
  function updateHud(state){
    const remaining=Math.max(0,state.deadline-Date.now());
    const timer=state.root.querySelector("#ransomTimer");
    const points=state.root.querySelector("#ransomPoints");
    const coins=state.root.querySelector("#ransomCoinCount");
    if(timer)timer.textContent=formatTime(remaining);
    if(points)points.textContent=String(state.coins*COIN_VALUE);
    if(coins)coins.textContent=String(state.coins);
  }
  function spawnChaosWindow(state){
    if(state.ended||!state.root?.isConnected)return;
    const variants=["purpleVertical","redStatic","purpleHorizontal","skull"];
    const key=variants[Math.floor(Math.random()*variants.length)];
    const win=document.createElement("div");
    win.className="ransom-chaos-window";
    win.style.left=(5+Math.random()*74)+"%";
    win.style.top=(20+Math.random()*62)+"%";
    win.style.width=(130+Math.random()*125)+"px";
    win.style.height=(90+Math.random()*100)+"px";
    const img=document.createElement("img");
    img.src=asset(key);
    img.alt="";
    win.appendChild(img);
    state.root.appendChild(win);
    schedule(state,()=>win.remove(),900+Math.random()*700);
  }
  function spawnCoin(state){
    if(state.ended||state.coins>=COIN_COUNT)return;
    const button=document.createElement("button");
    button.type="button";
    button.className="ransom-coin";
    button.setAttribute("aria-label",`Collect coin ${state.coins+1} of ${COIN_COUNT}, worth ${COIN_VALUE} points`);
    button.style.left=(12+Math.random()*76)+"%";
    button.style.top=(28+Math.random()*58)+"%";
    button.innerHTML=`<img src="${asset("coin")}" alt=""><span>+${COIN_VALUE}</span>`;
    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      if(state.ended||button.dataset.collected==="1")return;
      button.dataset.collected="1";
      state.coins++;
      tryPlay(state.music);
      tryPlay(createAudio("coinSound",false,0.9));
      const plus=document.createElement("div");
      plus.className="ransom-plus";
      plus.textContent=`+${COIN_VALUE}`;
      plus.style.left=button.style.left;
      plus.style.top=button.style.top;
      state.root.appendChild(plus);
      schedule(state,()=>plus.remove(),650);
      button.remove();
      updateHud(state);
      if(state.coins===COIN_COUNT){
        finishEvent(state,true);
      }else{
        schedule(state,()=>spawnCoin(state),420);
      }
    });
    state.root.appendChild(button);
  }
  function forceLogout(){
    storageRemove(global.localStorage,"genesisLogin");
    storageRemove(global.localStorage,"genesisAdminSession");
    storageRemove(global.sessionStorage,"realmAuth");
    storageRemove(global.sessionStorage,"realmUser");
    storageRemove(global.sessionStorage,"genesisRole");
    storageRemove(global.sessionStorage,RANSOM_SESSION_KEY);
    document.getElementById("os")?.classList.add("logging-out");
    setTimeout(()=>location.replace("index.html"),240);
  }
  function finishEvent(state,success){
    if(state.ended)return;
    state.ended=true;
    clearStateTimers(state);
    document.removeEventListener("keydown",state.onKeydown,true);
    state.music?.pause?.();
    unlockApps();

    if(success){
      storageSet(global.sessionStorage,GLITCH_UNLOCK_KEY,"1");
      state.root.className="genesis-ransom-result success";
      state.root.innerHTML=`<img class="ransom-thank-you-image" src="${asset("thankYou")}" alt="Thank you">
        <p>Five coins collected. Glitch is unlocked in Store.</p>`;
      tryPlay(createAudio("thankYouSound",false,0.95));
      setTimeout(forceLogout,RESULT_DISPLAY_MS);
      return;
    }

    state.root.className="genesis-ransom-result failure";
    state.root.innerHTML="";
    const video=document.createElement("video");
    video.className="ransom-jumpscare-video";
    video.src=asset("jumpscare");
    video.autoplay=true;
    video.playsInline=true;
    video.preload="auto";
    video.setAttribute("aria-label","RANSOM jumpscare");
    state.root.appendChild(video);
    const play=video.play();
    play?.catch?.(()=>{
      video.muted=true;
      video.loop=true;
      tryPlay(video);
      const soundButton=document.createElement("button");
      soundButton.type="button";
      soundButton.className="ransom-unmute";
      soundButton.textContent="TAP FOR SOUND";
      soundButton.addEventListener("click",()=>{
        video.muted=false;
        video.loop=false;
        video.currentTime=0;
        tryPlay(video);
        soundButton.remove();
      },{once:true});
      state.root.appendChild(soundButton);
    });
    setTimeout(forceLogout,2_100);
  }
  function stopEvent(){
    const state=eventState;
    if(!state)return;
    state.ended=true;
    clearStateTimers(state);
    document.removeEventListener("keydown",state.onKeydown,true);
    state.music?.pause?.();
    state.root?.remove();
    unlockApps();
    eventState=null;
  }
  function startOsEvent(){
    if(eventState||!isOsPage())return;
    const params=new URLSearchParams(location.search||"");
    if(params.get("ransomEvent")!=="1")return;
    global.GenesisUI?.pauseMusic?.();
    const os=document.getElementById("os");
    if(!os){setTimeout(startOsEvent,250);return}
    params.delete("ransomEvent");
    const rest=params.toString();
    try{history.replaceState(history.state,"",location.pathname+(rest?"?"+rest:"")+location.hash)}catch{}

    const root=document.createElement("div");
    root.id="genesisRansomOSEvent";
    root.className="genesis-ransom-os-layer";
    root.setAttribute("role","application");
    root.setAttribute("aria-label","RANSOM timed coin hunt");
    root.innerHTML=`<div class="ransom-static-backdrop" aria-hidden="true"></div>
      <section class="ransom-hud" aria-label="RANSOM score and timer">
        <img class="ransom-hud-design" src="${asset("hud")}" alt="Your files have been encrypted">
        <div class="ransom-hud-live">
          <div class="ransom-hud-score"><img src="${asset("coin")}" alt=""><strong><span id="ransomPoints">0</span> / ${TARGET_COINS}</strong></div>
          <div class="ransom-hud-clock"><span>TIME</span><strong id="ransomTimer">01:03</strong></div>
        </div>
      </section>
      <div class="ransom-progress-line"><strong><span id="ransomCoinCount">0</span> / ${COIN_COUNT} COINS</strong><span>Collect five tokens · +${COIN_VALUE} each</span><button type="button" data-ransom-stop>EXIT</button></div>`;
    document.body.appendChild(root);

    const state={
      root,coins:0,deadline:Date.now()+GAME_DURATION_MS,ended:false,
      clock:0,chaos:0,timeouts:new Set(),music:null,lastChaosAt:0,onKeydown:null
    };
    eventState=state;
    state.onKeydown=event=>{
      if(event.key==="Escape"){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        stopEvent();
      }
    };
    document.addEventListener("keydown",state.onKeydown,true);
    root.querySelector("[data-ransom-stop]")?.addEventListener("click",stopEvent,{once:true});
    lockApps();

    try{
      state.music=createAudio("encrypted",true,0.66);
      tryPlay(state.music);
    }catch{}
    state.clock=setInterval(()=>{
      updateHud(state);
      if(Date.now()>=state.deadline)finishEvent(state,false);
    },100);
    state.chaos=setInterval(()=>spawnChaosWindow(state),1_250);
    root.addEventListener("pointermove",()=>{
      const now=Date.now();
      if(now-state.lastChaosAt>700){state.lastChaosAt=now;spawnChaosWindow(state)}
    },{passive:true});
    updateHud(state);
    schedule(state,()=>spawnCoin(state),800);
  }

  function injectStyles(){
    if(document.getElementById("genesisRansomEasterStyles"))return;
    const style=document.createElement("style");
    style.id="genesisRansomEasterStyles";
    style.textContent=`
      .genesis-ransom-running,.genesis-ransom-running body{overflow:hidden!important}
      .genesis-ransom-intro{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#300009,#050006 65%);color:#fff;font-family:Arial,system-ui,sans-serif;padding:18px}
      .ransom-start-card{width:min(570px,94vw);padding:32px 30px 26px;border:2px solid #f10b2d;background:linear-gradient(145deg,rgba(52,0,12,.96),rgba(8,0,10,.98));box-shadow:0 0 65px rgba(255,0,37,.22);text-align:center}
      .ransom-stop-hand{display:block;width:92px;height:118px;object-fit:contain;margin:0 auto 14px;filter:drop-shadow(0 0 16px rgba(255,0,34,.36))}
      .ransom-safe-tag{display:inline-block;padding:6px 9px;border:1px solid rgba(255,255,255,.28);font:800 10px/1 monospace;letter-spacing:.16em}
      .ransom-start-card h1{margin:12px 0 8px;color:#ff193d;font:900 clamp(23px,5vw,37px)/1 Impact,Arial Black,sans-serif;letter-spacing:.035em}
      .ransom-start-card p{margin:9px auto;color:rgba(255,255,255,.83);font-size:14px;line-height:1.55;max-width:440px}
      .ransom-start-card .ransom-instructions{font-weight:800;color:#fff}
      .ransom-start-actions{display:flex;justify-content:center;gap:11px;margin-top:20px}
      .ransom-start-actions button,.ransom-start-card>button{min-height:42px;padding:0 17px;border:1px solid #ff193d;background:#eb0b2b;color:#fff;font-size:11px;font-weight:900;letter-spacing:.08em;cursor:pointer}
      .ransom-start-actions button[data-ransom-exit],.ransom-start-card>button[data-ransom-exit]{background:transparent;border-color:rgba(255,255,255,.3)}
      .ransom-tape-frame{position:fixed;inset:0;display:grid;place-items:center;background:#000}
      .ransom-tape-video{width:100vw;height:100vh;object-fit:contain;background:#000}
      .ransom-exit-button{position:absolute;top:18px;left:18px;padding:10px 14px;border:1px solid rgba(255,255,255,.36);background:rgba(0,0,0,.55);color:#fff;font-weight:850;cursor:pointer}
      .ransom-tape-caption{position:absolute;bottom:18px;left:18px;padding:8px 10px;background:rgba(0,0,0,.55);color:#fff;font:800 10px/1 monospace;letter-spacing:.12em}
      .genesis-ransom-event-running .desktop-icon,.genesis-ransom-event-running .dock-app,.genesis-ransom-event-running .quick,.genesis-ransom-event-running .account-button,.genesis-ransom-event-running .window{pointer-events:none!important;filter:saturate(.45) brightness(.65)}
      .genesis-ransom-event-running .app-icon,.genesis-ransom-event-running .dock-app{position:relative;overflow:hidden!important;border-color:rgba(255,0,35,.65)!important;background:#350008!important}
      .ransom-lock-symbol{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;opacity:.84!important;mix-blend-mode:screen;pointer-events:none;animation:ransomLock .34s steps(2,end) infinite}
      .genesis-ransom-os-layer{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#060007;color:#fff;font-family:Arial,system-ui,sans-serif;isolation:isolate}
      .ransom-static-backdrop{position:absolute;inset:0;opacity:.22;background-image:url("assets/ransom/red-static.png");background-size:cover;background-position:center;mix-blend-mode:screen;pointer-events:none}
      .ransom-hud{position:absolute;left:18px;top:16px;width:min(363px,calc(100vw - 36px));z-index:3;filter:drop-shadow(0 10px 22px rgba(0,0,0,.5))}
      .ransom-hud-design{display:block;width:100%;height:auto}
      .ransom-hud-live{position:absolute;left:2.4%;right:2.4%;bottom:2.8%;height:17.5%;display:grid;grid-template-columns:38% 62%;align-items:stretch;border:2px solid #160007;font-family:Impact,Arial Black,monospace;font-weight:900}
      .ransom-hud-score{display:flex;align-items:center;justify-content:center;gap:5px;background:#090306;color:#fff}
      .ransom-hud-score img{width:22px;height:22px;object-fit:contain}
      .ransom-hud-score strong{font-size:clamp(10px,2.9vw,17px);white-space:nowrap}
      .ransom-hud-clock{display:flex;align-items:center;justify-content:center;gap:7px;background:#ed061f;color:#090000}
      .ransom-hud-clock span{font-size:clamp(8px,2.4vw,13px)}
      .ransom-hud-clock strong{font-size:clamp(16px,4vw,24px);letter-spacing:.04em}
      .ransom-progress-line{position:absolute;left:18px;top:calc(16px + min(210px, 57.9vw - 20.844px));z-index:3;display:flex;align-items:center;gap:11px;padding:8px 10px;border:1px solid rgba(255,30,60,.55);background:rgba(4,0,5,.84);font:800 10px/1.2 monospace}
      .ransom-progress-line strong{color:#fff}
      .ransom-progress-line>span{color:rgba(255,255,255,.64)}
      .ransom-progress-line button{border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;padding:5px 7px;font:800 9px/1 monospace;cursor:pointer}
      .ransom-chaos-window{position:absolute;z-index:1;overflow:hidden;border:2px solid rgba(255,15,53,.62);box-shadow:7px 8px 0 rgba(0,0,0,.34);animation:ransomWindow .12s steps(3,end)}
      .ransom-chaos-window img{display:block;width:100%;height:100%;object-fit:cover;filter:saturate(.75) contrast(1.2)}
      .ransom-coin{position:absolute;z-index:5;width:78px;height:84px;padding:4px;border:0;background:transparent;cursor:pointer;transform:translate(-50%,-50%);filter:drop-shadow(0 0 12px rgba(255,231,89,.85));animation:ransomCoinBob .65s ease-in-out infinite alternate}
      .ransom-coin img{display:block;width:100%;height:70%;object-fit:contain}
      .ransom-coin span{display:block;margin-top:1px;color:#fff4a1;font:900 11px/1 monospace;text-shadow:0 2px 5px #000}
      .ransom-coin:focus-visible{outline:3px solid #fff;outline-offset:3px}
      .ransom-plus{position:absolute;z-index:6;transform:translate(-50%,-50%);color:#fff06c;font:900 25px/1 monospace;text-shadow:2px 2px #000;pointer-events:none;animation:ransomPlus .65s ease-out forwards}
      .genesis-ransom-result{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;overflow:hidden;background:#050006}
      .ransom-thank-you-image{width:min(80vw,620px);height:min(76vh,420px);object-fit:contain;filter:drop-shadow(0 0 24px rgba(101,255,90,.25))}
      .genesis-ransom-result.success p{position:absolute;bottom:5vh;margin:0;color:#fff;font:800 13px/1.4 monospace;text-shadow:0 2px 6px #000}
      .ransom-jumpscare-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#900}
      .ransom-unmute{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:2;padding:10px 14px;border:1px solid #fff;background:rgba(0,0,0,.72);color:#fff;font:900 11px/1 monospace}
      @keyframes ransomWindow{from{opacity:.1;transform:scale(.72)}to{opacity:1;transform:none}}
      @keyframes ransomCoinBob{to{transform:translate(-50%,-60%) rotate(4deg)}}
      @keyframes ransomPlus{to{opacity:0;transform:translate(-50%,-90%) scale(1.2)}}
      @keyframes ransomLock{0%,100%{transform:translate(0)}50%{transform:translate(2px,-1px)}}
      @media(max-width:650px){.ransom-hud{left:10px;top:10px;width:min(330px,calc(100vw - 20px))}.ransom-progress-line{left:10px;top:calc(10px + min(191px, 57.9vw - 11.58px));gap:7px;font-size:9px}.ransom-coin{width:70px;height:76px}.ransom-start-card{padding:24px 17px}.ransom-stop-hand{width:72px;height:95px}}
      @media(prefers-reduced-motion:reduce){.ransom-lock-symbol,.ransom-chaos-window,.ransom-coin{animation:none!important}}
    `;
    document.head.appendChild(style);
  }
  function install(){
    injectStyles();
    if(isLoginPage())installLoginTrigger();
    if(isOsPage()&&new URLSearchParams(location.search||"").get("ransomEvent")==="1"){
      setTimeout(startOsEvent,650);
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  global.GenesisRansomEaster=Object.freeze({
    start:startIntro,
    startIntro,
    startOsEvent,
    credentialsMatch,
    isGlitchUnlocked:()=>storageGet(global.sessionStorage,GLITCH_UNLOCK_KEY)==="1",
    isRunning:()=>introActive||eventState!==null,
    __test:Object.freeze({
      ASSETS,GAME_DURATION_MS,COIN_VALUE,COIN_COUNT,TARGET_COINS,GLITCH_UNLOCK_KEY,RANSOM_SESSION_KEY,RESULT_DISPLAY_MS,
      formatTime
    })
  });
})(globalThis);
