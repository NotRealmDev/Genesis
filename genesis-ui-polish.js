(function(global){
  'use strict';
  if(!/(?:^|\/)os\.html$/i.test(location.pathname)||global.GenesisUI)return;

  let context=null,lastSoundAt=0;
  const audio=()=>context||(context=new (global.AudioContext||global.webkitAudioContext)());
  function sound(kind='tap'){
    try{
      const nowMs=performance.now();if(kind==='tap'&&nowMs-lastSoundAt<38)return;lastSoundAt=nowMs;
      const ctx=audio();if(ctx.state==='suspended')ctx.resume();
      const notes={tap:[460,.035,.024],open:[620,.085,.035],close:[310,.07,.028],focus:[760,.025,.018],key:[700,.018,.014],success:[840,.1,.03]};
      const note=notes[kind]||notes.tap,now=ctx.currentTime;
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();
      oscillator.type=kind==='key'?'sine':'triangle';oscillator.frequency.setValueAtTime(note[0],now);oscillator.frequency.exponentialRampToValueAtTime(note[0]*(kind==='open'?1.22:.82),now+note[1]);
      gain.gain.setValueAtTime(note[2],now);gain.gain.exponentialRampToValueAtTime(.0001,now+note[1]);oscillator.connect(gain).connect(ctx.destination);oscillator.start(now);oscillator.stop(now+note[1]);
    }catch{}
  }

  document.addEventListener('pointerup',event=>{
    const button=event.target.closest('button,a,.file-card,.game-card');if(!button)return;
    if(button.matches('.desktop-icon,[onclick*="openApp"],.dock-app'))return;
    sound(button.matches('.close')?'close':button.matches('.maximize,.minimize')?'focus':'tap');
  },true);
  const originalOpen=global.openApp;
  if(typeof originalOpen==='function')global.openApp=function(...args){sound('open');return originalOpen.apply(this,args)};
  const originalClose=global.closeWindow;
  if(typeof originalClose==='function')global.closeWindow=function(...args){sound('close');return originalClose.apply(this,args)};

  const RANSOM_SESSION_KEY='genesisRansomSession';
  function canPlayMenuMusic(){
    try{
      if(global.sessionStorage?.getItem('realmAuth')!=='1')return false;
      if(global.sessionStorage?.getItem(RANSOM_SESSION_KEY)==='1')return false;
      if(new URLSearchParams(location.search||'').get('ransomEvent')==='1')return false;
      const login=JSON.parse(global.localStorage?.getItem('genesisLogin')||'null');
      if(!login||!login.expires||Date.now()>=Number(login.expires))return false;
      if(document.documentElement.classList.contains('genesis-ransom-running')||document.documentElement.classList.contains('genesis-ransom-event-running'))return false;
      if(document.getElementById('genesisRansomOSEvent')||document.querySelector('.genesis-ransom-result'))return false;
      if(global.GenesisRansomEaster?.isRunning?.())return false;
      return true;
    }catch{return false}
  }
  let musicStarted=false;
  function pauseMusic(){
    try{
      if(typeof global.genesisGetMusicAudio!=='function')return false;
      global.genesisGetMusicAudio().pause();
      musicStarted=false;
      return true;
    }catch{return false}
  }
  async function startMusic(){
    if(!canPlayMenuMusic()){
      pauseMusic();
      return false;
    }
    if(musicStarted||typeof global.genesisGetMusicAudio!=='function')return false;
    try{
      const player=global.genesisGetMusicAudio();player.loop=true;player.preload='auto';
      await player.play();musicStarted=true;cleanupStartListeners();return true;
    }catch{return false}
  }
  function cleanupStartListeners(){document.removeEventListener('pointerdown',startOnGesture,true);document.removeEventListener('keydown',startOnGesture,true)}
  function startOnGesture(){startMusic()}
  document.addEventListener('pointerdown',startOnGesture,true);document.addEventListener('keydown',startOnGesture,true);
  if(canPlayMenuMusic())startMusic();else pauseMusic();

  const style=document.createElement('style');style.id='genesisUiPolishStyles';style.textContent=`
    :root{--ease-spring:cubic-bezier(.2,.82,.2,1);--soft-outline:0 0 0 3px hsla(var(--accent),80%,62%,.16)}
    button,a,input,textarea{transition:border-color .18s var(--ease-spring),background .18s var(--ease-spring),box-shadow .18s var(--ease-spring),transform .18s var(--ease-spring),opacity .18s}
    button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:0;box-shadow:var(--soft-outline);border-color:hsla(var(--accent),75%,68%,.38)!important}
    .window{border-color:rgba(255,255,255,.16);box-shadow:inset 0 1px rgba(255,255,255,.12),0 32px 100px rgba(0,0,0,.5);animation-duration:.34s}
    .window-header{background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018))}
    .window-control{box-shadow:inset 0 -1px 1px rgba(0,0,0,.22)}.window-control:hover{transform:scale(1.16)}
    .sidebar{box-shadow:inset 0 1px rgba(255,255,255,.12),0 28px 80px rgba(0,0,0,.38)}
    .quick,.os-btn,.dock-app,.app-icon{will-change:transform}.quick:active,.os-btn:active,.nav-btn:active,.dock-app:active{transform:scale(.94)}
    .dock{padding:9px 13px;gap:10px;box-shadow:inset 0 1px rgba(255,255,255,.14),0 18px 56px rgba(0,0,0,.38)}
    .dock-app:hover{transform:translateY(-7px) scale(1.1)}
    .desktop-icon:hover .app-icon{transform:translateY(-5px) scale(1.055);box-shadow:inset 0 1px rgba(255,255,255,.16),0 18px 42px rgba(0,0,0,.3)}
    .app-name{padding:3px 7px;border-radius:7px}.desktop-icon.selected .app-name{background:rgba(0,0,0,.28)}
    .browser-toolbar{position:relative;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));padding:9px 11px}
    .nav-btn,.browser-go{display:grid;place-items:center}.nav-btn svg,.browser-go svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .browser-go svg{width:15px;height:15px}.nav-btn:hover,.browser-go:hover{transform:translateY(-1px);background:rgba(255,255,255,.13)}
    .browser-menu{position:absolute;right:10px;top:52px;z-index:30;width:205px;padding:7px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(12,17,28,.94);backdrop-filter:blur(24px) saturate(160%);box-shadow:0 20px 55px rgba(0,0,0,.45);opacity:0;transform:translateY(-7px) scale(.97);pointer-events:none}
    .browser-menu.open{opacity:1;transform:none;pointer-events:auto}.browser-menu button{width:100%;height:38px;padding:0 11px;border:0;border-radius:10px;background:transparent;color:#fff;text-align:left;font-size:12px;cursor:pointer}.browser-menu button:hover{background:rgba(255,255,255,.09)}
    .browser-menu .menu-divider{height:1px;margin:5px;background:rgba(255,255,255,.08)}
    .browser-status{height:27px;padding:6px 13px;background:rgba(0,0,0,.16)}
    .music-art{box-shadow:inset 0 1px rgba(255,255,255,.16),0 18px 50px hsla(var(--accent),80%,45%,.18);animation:musicFloat 4s ease-in-out infinite alternate}
    @keyframes musicFloat{to{transform:translateY(-5px) rotate(2deg)}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;document.head.appendChild(style);

  global.GenesisUI={sound,startMusic,pauseMusic,canPlayMenuMusic};
})(window);
