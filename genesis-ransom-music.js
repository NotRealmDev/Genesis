(function(global){
  "use strict";

  const TRACK="assets/ransom/encrypted.mp3";
  const MUSIC_ID="genesisRansomMusic";
  const NativeAudio=global.Audio;
  let music=null;
  let unlockInstalled=false;

  function isRansomOS(){
    const params=new URLSearchParams(location.search||"");
    return /(?:^|\/)os\.html$/i.test(location.pathname||"") && (params.get("ransomEvent")==="1" || sessionStorage.getItem("genesisRansomSession")==="1");
  }

  function ensureMusic(){
    if(!isRansomOS())return null;
    if(music && document.contains(music))return music;
    music=document.getElementById(MUSIC_ID);
    if(!music){
      music=document.createElement("audio");
      music.id=MUSIC_ID;
      music.src=TRACK;
      music.loop=true;
      music.preload="auto";
      music.autoplay=true;
      music.volume=.72;
      music.muted=false;
      music.setAttribute("playsinline","");
      music.style.display="none";
      (document.body||document.documentElement).appendChild(music);
    }
    global.__GENESIS_RANSOM_MUSIC__=music;
    return music;
  }

  function removeUnlockers(){
    if(!unlockInstalled)return;
    unlockInstalled=false;
    for(const type of ["pointerdown","touchstart","keydown","mousedown","click"]){
      document.removeEventListener(type,startMusic,true);
    }
  }

  function installUnlockers(){
    if(unlockInstalled)return;
    unlockInstalled=true;
    for(const type of ["pointerdown","touchstart","keydown","mousedown","click"]){
      document.addEventListener(type,startMusic,true);
    }
  }

  function startMusic(){
    const audio=ensureMusic();
    if(!audio)return;
    audio.muted=false;
    audio.volume=.72;
    const result=audio.play();
    if(result&&typeof result.then==="function"){
      result.then(removeUnlockers).catch(installUnlockers);
    }else{
      removeUnlockers();
    }
  }

  // Reuse the same guaranteed soundtrack instance when the RANSOM event
  // asks for encrypted.mp3, preventing duplicate tracks/echo.
  function GenesisAudio(src){
    const value=String(src||"");
    if(/assets\/ransom\/encrypted\.mp3(?:$|[?#])/i.test(value) && isRansomOS()){
      return ensureMusic();
    }
    return new NativeAudio(src);
  }
  GenesisAudio.prototype=NativeAudio.prototype;
  try{Object.setPrototypeOf(GenesisAudio,NativeAudio)}catch{}
  global.Audio=GenesisAudio;

  function boot(){
    if(!isRansomOS())return;
    const audio=ensureMusic();
    audio.addEventListener("canplay",startMusic,{once:true});
    startMusic();
    // Retry briefly while the OS finishes loading. If the browser blocks
    // autoplay, the first real click/key/touch starts it with no prompt.
    let attempts=0;
    const retry=setInterval(()=>{
      attempts++;
      if(!music?.paused || attempts>=12){clearInterval(retry);return;}
      startMusic();
    },250);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  global.GenesisRansomMusic=Object.freeze({start:startMusic,get:()=>music});
})(globalThis);
