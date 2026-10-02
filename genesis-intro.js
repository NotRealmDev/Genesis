(function(){
  "use strict";
  const audio=document.getElementById("showcaseAudio");
  const scenes=Array.from(document.querySelectorAll(".scene"));
  const boundaries=[0,.112,.232,.352,.472,.594,.726,.858,1];
  const captions=["Welcome to Genesis","01 / Browser","02 / Games","03 / GPT","04 / Messages","05 / Themes","06 / Your everyday","Your world is ready"];
  const gate=document.getElementById("showcaseStart");
  const playButton=document.getElementById("showcasePlay");
  const pauseButton=document.getElementById("showcasePause");
  const soundButton=document.getElementById("showcaseSound");
  const progress=document.getElementById("showcaseProgress");
  const progressBar=progress.parentElement;
  const fallbackDuration=33.410563; // Duration of the supplied soundtrack.
  let login=null;
  try{login=JSON.parse(localStorage.getItem("genesisLogin")||"null");}catch{}
  if(!login || !login.expires || Date.now()>=login.expires)return;
  if(!GenesisIntroState.shouldShow(login) && new URLSearchParams(location.search).get("replay")!=="1")return;
  let ended=false,started=false,silent=false,silentPaused=false,audioFailed=false;
  let frame=0,lastTick=0,silentTime=0,currentScene=-1,resumeOnVisible=false;
  audio.volume=.8;
  function duration(){return Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:fallbackDuration;}
  function render(time){
    const fraction=Math.max(0,Math.min(1,time/duration()));
    const nextBoundary=boundaries.findIndex((end,i)=>i>0 && fraction<end);
    const index=nextBoundary<0?scenes.length-1:nextBoundary-1;
    if(index!==currentScene){
      currentScene=index;
      scenes.forEach((scene,i)=>{
        scene.classList.toggle("active",i===index);
        scene.classList.toggle("past",i<index);
        scene.setAttribute("aria-hidden",String(i!==index));
      });
      document.getElementById("sceneCaption").textContent=captions[index];
      document.body.dataset.scene=scenes[index].dataset.scene;
    }
    const localProgress=(fraction-boundaries[index])/(boundaries[index+1]-boundaries[index]);
    document.documentElement.style.setProperty("--film-progress",fraction);
    document.documentElement.style.setProperty("--scene-progress",Math.max(0,Math.min(1,localProgress)));
    progress.style.transform="scaleX("+fraction+")";
    progressBar.setAttribute("aria-valuenow",String(Math.round(fraction*100)));
  }
  function tick(now){
    if(ended)return;
    if(silent && !silentPaused && lastTick)silentTime+=Math.min((now-lastTick)/1000,.1);
    lastTick=now;
    // Visual time follows the soundtrack, including pauses and buffering.
    render(silent?silentTime:audio.currentTime);
    if(silent && silentTime>=duration()){finish();return;}
    frame=requestAnimationFrame(tick);
  }
  function setPaused(paused){
    document.body.classList.toggle("paused",paused);
    pauseButton.textContent=paused?"Resume":"Pause";
    pauseButton.setAttribute("aria-label",paused?"Resume showcase":"Pause showcase");
  }
  function beginTimeline(){
    if(ended)return;
    gate.hidden=true;
    if(!started){started=true;frame=requestAnimationFrame(tick);}
    setPaused(false);
  }
  async function play(){
    if(ended)return;
    playButton.disabled=true;
    try{
      if(audioFailed){startSilent();return;}
      await audio.play();
      beginTimeline();
    }catch{
      if(!ended){gate.hidden=false;setPaused(true);playButton.focus();}
    }finally{playButton.disabled=false;}
  }
  function startSilent(){
    if(ended)return;
    silentTime=audio.currentTime||0;
    silent=true;silentPaused=false;
    audio.pause();
    soundButton.disabled=true;
    soundButton.textContent="No soundtrack";
    beginTimeline();
  }
  function pause(){
    if(silent){silentPaused=true;setPaused(true);}else audio.pause();
  }
  function resume(){
    if(silent){silentPaused=false;lastTick=0;setPaused(false);}else play();
  }
  function finish(){
    if(ended)return;
    ended=true;
    cancelAnimationFrame(frame);
    audio.pause();
    // Only completion or an intentional skip marks this update as seen.
    GenesisIntroState.complete(login);
    document.body.classList.add("leaving");
    setTimeout(()=>location.replace("os.html"),350);
  }
  playButton.addEventListener("click",play);
  document.getElementById("showcaseSilent").addEventListener("click",startSilent);
  document.getElementById("showcaseSkip").addEventListener("click",finish);
  document.getElementById("showcaseGateSkip").addEventListener("click",finish);
  document.getElementById("showcaseBrand").addEventListener("click",event=>{event.preventDefault();finish();});
  pauseButton.addEventListener("click",()=>{
    if(!started){play();return;}
    if(silent?silentPaused:audio.paused)resume();else pause();
  });
  soundButton.addEventListener("click",()=>{
    audio.muted=!audio.muted;
    soundButton.textContent=audio.muted?"Sound off":"Sound on";
    soundButton.setAttribute("aria-label",audio.muted?"Unmute music":"Mute music");
    soundButton.setAttribute("aria-pressed",String(audio.muted));
  });
  audio.addEventListener("playing",beginTimeline);
  audio.addEventListener("pause",()=>{if(!silent)setPaused(true);render(audio.currentTime);});
  // Keep the visual chapter in sync even when a browser pauses animation
  // frames while media is stopped or a test/device seeks the soundtrack.
  audio.addEventListener("seeking",()=>render(audio.currentTime));
  audio.addEventListener("seeked",()=>render(audio.currentTime));
  audio.addEventListener("ended",finish);
  audio.addEventListener("error",()=>{
    audioFailed=true;
    if(ended)return;
    gate.hidden=false;
    document.getElementById("showcaseStartMessage").textContent="The soundtrack couldn’t load. You can still watch the intro without sound.";
    playButton.textContent="Watch intro ▶";
    playButton.disabled=false;
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){
      resumeOnVisible=started && !(silent?silentPaused:audio.paused);
      if(resumeOnVisible)pause();
    }else if(resumeOnVisible && !ended){resumeOnVisible=false;resume();}
  });
  globalThis.addEventListener("pagehide",()=>{audio.pause();cancelAnimationFrame(frame);});
  render(0);
  play();
  setTimeout(()=>{
    if(!started && !ended){gate.hidden=false;playButton.disabled=false;}
  },5000);
})();
