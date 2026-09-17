(function(global){
  "use strict";

  const HOST_KEY_STORAGE="genesisVmHostKey";
  const SDK_VERSION="2.116.0";
  const state={client:null,channel:null,peer:null,control:null,sessionId:"",video:null,connected:false,mediaReady:false,connecting:false,attempt:0,pendingIce:[],answerTimer:null,streamTimer:null,reconnectTimer:null,gamepadTimer:null,gamepadKeys:new Set()};
  const ICE_SERVERS=[
    {urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}
  ];

  function isAdmin(){
    try{return global.GenesisVM?.isAdmin?.()===true}catch{return false}
  }
  function backend(){
    const b=global.GENESIS_BACKEND||{};
    if(!/^https:\/\/.+\.supabase\.co$/i.test(String(b.url||"")))return null;
    if(String(b.anonKey||"").length<20)return null;
    return b;
  }
  function hostKey(){
    return String(localStorage.getItem(HOST_KEY_STORAGE)||"").trim();
  }
  function validHostKey(value){
    return /^[A-Za-z0-9_-]{24,128}$/.test(String(value||"").trim());
  }
  function escapeHTML(value){
    return String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function setStatus(text){
    const el=document.getElementById("genesisVmStatus");
    if(el)el.textContent=String(text||"");
  }
  function showOverlay(markup){
    const overlay=document.getElementById("genesisVmOverlay");
    const card=document.getElementById("genesisVmCard");
    if(!overlay||!card)return;
    card.innerHTML=markup;
    overlay.classList.remove("hidden");
  }
  function hideOverlay(){document.getElementById("genesisVmOverlay")?.classList.add("hidden")}
  function pairScreen(message="Pair Genesis with the Host app running on the computer that will stream GeForce NOW."){
    const saved=hostKey();
    showOverlay(`<div class="genesis-vm-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h10M7 12h6"/></svg></div><h2>Connect Genesis Host</h2><p>${escapeHTML(message)}</p><div class="genesis-vm-actions" style="display:grid;grid-template-columns:minmax(190px,1fr) auto;width:min(470px,100%);margin-left:auto;margin-right:auto"><input id="genesisVmHostKey" value="${escapeHTML(saved)}" autocomplete="off" spellcheck="false" placeholder="Paste Host Key" style="height:38px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.065);color:#fff;padding:0 12px;outline:0"><button type="button" class="genesis-vm-button" onclick="GenesisHostVM.saveAndConnect()">Connect</button></div><p style="margin-top:12px;font-size:10px">Open Genesis Host on the host PC and copy the Host Key shown there. The key is saved only in this browser.</p>`);
    setStatus("Waiting for Host Key");
    setTimeout(()=>document.getElementById("genesisVmHostKey")?.focus(),80);
  }
  function waitingScreen(text="Looking for Genesis Host…"){
    showOverlay(`<div class="genesis-vm-spinner"></div><h2 style="font-size:20px">${escapeHTML(text)}</h2><p>The host PC must be awake with Genesis Host running and GeForce NOW open.</p><div class="genesis-vm-actions"><button type="button" class="genesis-vm-button" onclick="GenesisHostVM.disconnect();GenesisHostVM.pair()">Change Host</button></div>`);
  }
  function errorScreen(message){
    closePeer();
    showOverlay(`<div class="genesis-vm-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 9h6"/></svg></div><h2>Host unavailable</h2><p>${escapeHTML(message)}</p><div class="genesis-vm-actions"><button type="button" class="genesis-vm-button" onclick="GenesisHostVM.connect(true)">Retry</button><button type="button" class="genesis-vm-button" onclick="GenesisHostVM.disconnect();GenesisHostVM.pair()">Change Host</button></div>`);
    setStatus("Host offline");
  }

  function ensureVideo(){
    const stage=document.querySelector("#genesisVmRoot .genesis-vm-stage");
    const oldFrame=document.getElementById("genesisVmFrame");
    if(oldFrame)oldFrame.style.display="none";
    if(!stage)return null;
    let video=document.getElementById("genesisVmStream");
    if(!video){
      video=document.createElement("video");
      video.id="genesisVmStream";
      video.autoplay=true;
      video.playsInline=true;
      video.tabIndex=0;
      video.setAttribute("aria-label","Genesis Host GeForce NOW stream");
      video.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;outline:0;display:none;touch-action:none";
      stage.insertBefore(video,stage.firstChild);
      bindInput(video);
    }
    state.video=video;
    if(!video.__genesisMediaBound){
      video.__genesisMediaBound=true;
      video.addEventListener("playing",finishMediaStartup);
      video.addEventListener("loadeddata",finishMediaStartup);
    }
    let sound=document.getElementById("genesisVmSound");
    if(!sound){
      sound=document.createElement("button");
      sound.id="genesisVmSound";sound.type="button";sound.className="genesis-vm-button";
      sound.style.cssText="position:absolute;right:14px;bottom:14px;z-index:3;display:none;background:rgba(10,15,25,.9)";
      sound.addEventListener("click",enableSound);
      stage.insertBefore(sound,stage.firstChild);
    }
    sound.textContent="Enable sound";
    return video;
  }

  function finishMediaStartup(){
    const video=state.video;
    if(!state.connected||!video||video.readyState<2||!video.videoWidth||video.paused)return;
    state.mediaReady=true;clearAnswerTimer();clearTimeout(state.streamTimer);state.streamTimer=null;
    hideOverlay();video.style.display="block";setStatus("Connected · Genesis Host");
    const sound=document.getElementById("genesisVmSound");
    if(sound)sound.style.display=video.muted?"block":"none";
    video.focus();startGamepad();
  }

  async function playStream(pc){
    const video=state.video;
    try{await video.play()}
    catch(error){
      if(state.peer!==pc)return;
      if(error?.name!=="NotAllowedError"){errorScreen("Host video did not start: "+error.message);return}
      // Browsers may refuse autoplay with audio after asynchronous pairing.
      // Start silent video, then let an explicit click enable the audio.
      video.muted=true;
      try{await video.play()}catch(retryError){if(state.peer===pc)errorScreen("Host video did not start: "+retryError.message);return}
    }
    if(state.peer===pc)finishMediaStartup();
  }

  async function enableSound(){
    if(!state.video?.srcObject)return;
    state.video.muted=false;
    try{await state.video.play();finishMediaStartup()}
    catch{state.video.muted=true;setStatus("Video connected · click Enable sound to retry audio")}
  }

  function ensureSupabase(){
    if(global.supabase?.createClient)return Promise.resolve(global.supabase);
    if(state.sdkPromise)return state.sdkPromise;
    state.sdkPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector("script[data-genesis-host-supabase]");
      if(existing)existing.remove();
      const script=document.createElement("script");
      const timeout=setTimeout(()=>finish(new Error("Supabase signaling library did not load. Retry to download it again.")),9000);
      function finish(error){
        clearTimeout(timeout);script.onload=null;script.onerror=null;
        if(error){script.remove();reject(error)}else resolve(global.supabase);
      }
      script.src=`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SDK_VERSION}/dist/umd/supabase.min.js`;
      script.dataset.genesisHostSupabase="1";
      script.onload=()=>finish(global.supabase?.createClient?null:new Error("Supabase signaling library is unavailable."));
      script.onerror=()=>finish(new Error("Genesis could not load its signaling library."));
      document.head.appendChild(script);
    }).finally(()=>{state.sdkPromise=null});
    return state.sdkPromise;
  }

  async function sendSignal(event,payload){
    if(!state.channel)throw new Error("Host signaling is not connected");
    if(typeof state.channel.httpSend==="function"){
      const result=await state.channel.httpSend(event,payload);
      if(result?.success===false)throw new Error(result.error||"Signaling failed");
      return result;
    }
    const result=await state.channel.send({type:"broadcast",event,payload});
    if(result!=="ok")throw new Error("Signaling returned "+result);
    return result;
  }

  function clearAnswerTimer(){if(state.answerTimer)clearTimeout(state.answerTimer);state.answerTimer=null}
  function closePeer(){
    clearAnswerTimer();
    clearTimeout(state.streamTimer);clearTimeout(state.reconnectTimer);state.streamTimer=null;state.reconnectTimer=null;
    sendControl({type:"release-all"});stopGamepad();
    const control=state.control,peer=state.peer;
    state.control=null;state.peer=null;state.connected=false;state.mediaReady=false;state.pendingIce=[];
    try{if(control){control.onopen=null;control.onclose=null;control.close()}}catch{}
    try{if(peer){peer.onconnectionstatechange=null;peer.ontrack=null;peer.onicecandidate=null;peer.close()}}catch{}
    if(state.video){try{state.video.srcObject=null}catch{}state.video.style.display="none"}
    const sound=document.getElementById("genesisVmSound");if(sound)sound.style.display="none";
  }
  async function disconnect(keepConnecting=false){
    state.attempt++;
    state.sessionId="";
    closePeer();
    const client=state.client,channel=state.channel;
    state.channel=null;state.client=null;state.connecting=keepConnecting;
    if(client&&channel){try{await client.removeChannel(channel)}catch{}}
  }

  function sessionMatches(payload){return payload&&payload.sessionId===state.sessionId}
  async function handleAnswer(packet){
    const payload=packet?.payload||packet;
    if(!sessionMatches(payload)||!state.peer||!payload.answer)return;
    const pc=state.peer;
    try{
      await pc.setRemoteDescription(payload.answer);
      if(state.peer!==pc||!sessionMatches(payload))return;
      for(const candidate of state.pendingIce.splice(0)){
        try{await pc.addIceCandidate(candidate)}catch(error){console.warn("Host ICE candidate rejected:",error.message)}
      }
      clearAnswerTimer();
      setStatus("Host answered · establishing stream…");
      if(!state.mediaReady){
        clearTimeout(state.streamTimer);
        state.streamTimer=setTimeout(()=>{
          if(state.peer===pc&&!state.mediaReady)errorScreen("Host answered, but no video arrived. Check that the Host is capturing the GeForce NOW window, then retry.");
        },30000);
      }
    }catch(error){if(state.peer===pc)errorScreen("The Host answer could not be applied: "+error.message)}
  }
  async function handleHostIce(packet){
    const payload=packet?.payload||packet;
    if(!sessionMatches(payload)||!state.peer||!payload.candidate)return;
    if(!state.peer.remoteDescription){
      if(state.pendingIce.length<128)state.pendingIce.push(payload.candidate);
      return;
    }
    try{await state.peer.addIceCandidate(payload.candidate)}catch(error){console.warn("Host ICE candidate rejected:",error.message)}
  }
  function handleHostError(packet){
    const payload=packet?.payload||packet;
    if(payload?.sessionId&&payload.sessionId!==state.sessionId)return;
    errorScreen(payload?.message||"Genesis Host reported an error.");
  }
  function handleHostStatus(packet){
    const payload=packet?.payload||packet;
    if(payload?.sessionId&&payload.sessionId!==state.sessionId)return;
    if(payload?.status&&state.peer&&!state.mediaReady)setStatus(String(payload.status));
  }

  async function subscribe(key,attempt){
    const b=backend();
    if(!b)throw new Error("Genesis signaling is not configured.");
    const sdk=await ensureSupabase();
    if(state.attempt!==attempt)return;
    state.client=sdk.createClient(b.url,b.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:30}}});
    state.channel=state.client
      .channel("genesis-vm-"+key,{config:{broadcast:{self:false,ack:true}}})
      .on("broadcast",{event:"host-answer"},handleAnswer)
      .on("broadcast",{event:"host-ice"},handleHostIce)
      .on("broadcast",{event:"host-error"},handleHostError)
      .on("broadcast",{event:"host-status"},handleHostStatus);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("Signaling connection timed out.")),10000);
      state.channel.subscribe(status=>{
        if(status==="SUBSCRIBED"){clearTimeout(timeout);resolve()}
        else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){clearTimeout(timeout);reject(new Error("Signaling service is unavailable."))}
      });
    });
  }

  async function createViewerPeer(){
    closePeer();
    const video=ensureVideo();
    if(!video)throw new Error("Genesis VM display is not available.");
    const pc=new RTCPeerConnection({iceServers:ICE_SERVERS,iceCandidatePoolSize:4,bundlePolicy:"max-bundle"});
    state.peer=pc;
    pc.addTransceiver("video",{direction:"recvonly"});
    pc.addTransceiver("audio",{direction:"recvonly"});
    const control=pc.createDataChannel("genesis-control",{ordered:true});
    state.control=control;
    control.onopen=()=>{if(state.peer!==pc)return;setStatus(state.mediaReady?"Connected · controls ready":"Host controls ready · waiting for video…");startGamepad()};
    control.onclose=()=>{if(state.connected)setStatus("Video connected · controls reconnecting")};
    pc.ontrack=event=>{
      if(state.peer!==pc)return;
      let stream=event.streams?.[0];
      if(!stream){stream=video.srcObject instanceof MediaStream?video.srcObject:new MediaStream();stream.addTrack(event.track)}
      video.srcObject=stream;
      video.style.display="block";
      playStream(pc);
    };
    pc.onicecandidate=event=>{if(event.candidate)sendSignal("viewer-ice",{sessionId:state.sessionId,candidate:event.candidate.toJSON?.()||event.candidate}).catch(()=>{})};
    pc.onconnectionstatechange=()=>{
      if(state.peer!==pc)return;
      const status=pc.connectionState;
      if(status==="connected"){
        state.connected=true;clearTimeout(state.reconnectTimer);state.reconnectTimer=null;
        setStatus("Host connected · waiting for video…");finishMediaStartup();
      }else if(status==="failed"){
        state.connected=false;errorScreen("The direct WebRTC connection failed. Retry first; some networks may require a TURN relay.");
      }else if(status==="disconnected"){
        state.connected=false;
        setStatus("Host connection interrupted · reconnecting…");
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer=setTimeout(()=>{if(state.peer===pc&&pc.connectionState==="disconnected")connect(true)},5000);
      }else if(status==="closed")state.connected=false;
    };
    return pc;
  }

  async function connect(force=false){
    // Late loader/timer callbacks must not connect after the VM was closed.
    const root=document.getElementById("genesisVmRoot");
    if(!root||root.__genesisHostClosed||root.closest?.('.window')?.classList?.contains?.('closing'))return;
    if(!isAdmin()){errorScreen("This app is available only to Genesis administrators.");return}
    const key=hostKey();
    if(!validHostKey(key)){pairScreen();return}
    if(state.connecting&&!force)return;
    if(state.peer&&!force)return;
    state.connecting=true;
    waitingScreen(force?"Reconnecting to Genesis Host…":"Looking for Genesis Host…");
    setStatus("Connecting to Host…");
    const cleanup=disconnect(true),attempt=state.attempt;
    try{
      await cleanup;
      if(state.attempt!==attempt)return;
      await subscribe(key,attempt);
      if(state.attempt!==attempt)return;
      state.sessionId=global.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
      const pc=await createViewerPeer();
      const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});
      if(state.attempt!==attempt)return;
      await pc.setLocalDescription(offer);
      if(state.attempt!==attempt)return;
      // Arm before sending: a fast answer can arrive before send resolves.
      state.answerTimer=setTimeout(()=>{
        if(state.peer===pc&&!pc.remoteDescription)errorScreen("Genesis Host did not answer. Make sure the Windows Host app is running, GeForce NOW is open, and this Host Key matches the one shown in the app.");
      },35000);
      await sendSignal("viewer-offer",{
        sessionId:state.sessionId,
        offer:{type:pc.localDescription.type,sdp:pc.localDescription.sdp},
        viewer:{width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio||1},
        sentAt:new Date().toISOString()
      });
      if(state.attempt!==attempt)return;
      await sendSignal("viewer-ping",{sessionId:state.sessionId,sentAt:Date.now()}).catch(()=>{});
    }catch(error){
      if(state.attempt!==attempt)return;
      console.error("Genesis Host connection failed:",error);
      errorScreen(error?.message||String(error));
    }finally{if(state.attempt===attempt)state.connecting=false}
  }

  function sendControl(payload){
    if(state.control?.readyState!=="open")return false;
    try{state.control.send(JSON.stringify(payload));return true}catch{return false}
  }
  function pointerPayload(event,kind){
    const rect=state.video?.getBoundingClientRect();
    if(!rect||!rect.width||!rect.height)return null;
    return {
      type:"pointer",event:kind,
      x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
      y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)),
      movementX:Number(event.movementX||0),movementY:Number(event.movementY||0),
      button:Number(event.button||0),buttons:Number(event.buttons||0),
      deltaX:Number(event.deltaX||0),deltaY:Number(event.deltaY||0),
      locked:document.pointerLockElement===state.video
    };
  }
  function keyPayload(event,kind){
    return {type:"key",event:kind,key:event.key,code:event.code,repeat:!!event.repeat,alt:!!event.altKey,ctrl:!!event.ctrlKey,shift:!!event.shiftKey,meta:!!event.metaKey};
  }
  function bindInput(video){
    if(video.__genesisHostInputBound)return;video.__genesisHostInputBound=true;
    video.addEventListener("contextmenu",event=>event.preventDefault());
    video.addEventListener("pointerdown",event=>{video.focus();const p=pointerPayload(event,"down");if(p)sendControl(p);try{video.setPointerCapture(event.pointerId)}catch{}});
    video.addEventListener("pointerup",event=>{const p=pointerPayload(event,"up");if(p)sendControl(p)});
    video.addEventListener("pointermove",event=>{if(!state.connected)return;const p=pointerPayload(event,"move");if(p)sendControl(p)});
    video.addEventListener("wheel",event=>{event.preventDefault();const p=pointerPayload(event,"wheel");if(p)sendControl(p)},{passive:false});
    video.addEventListener("dblclick",()=>{video.requestPointerLock?.()});
    video.addEventListener("keydown",event=>{if(!state.connected)return;if(!["F5","F12"].includes(event.key))event.preventDefault();sendControl(keyPayload(event,"down"))});
    video.addEventListener("keyup",event=>{if(!state.connected)return;if(!["F5","F12"].includes(event.key))event.preventDefault();sendControl(keyPayload(event,"up"))});
    video.addEventListener("blur",()=>sendControl({type:"release-all"}));
  }

  function gamepadButtonMap(index){return ["Space","ControlLeft","KeyE","KeyR","KeyQ","KeyF","MouseLeft","MouseRight","Tab","Enter","ShiftLeft","ShiftRight","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"][index]||""}
  function stopGamepad(){
    if(state.gamepadTimer)cancelAnimationFrame(state.gamepadTimer);state.gamepadTimer=null;
    if(state.gamepadKeys.size){for(const code of state.gamepadKeys)sendControl({type:"key",event:"up",code,key:""});state.gamepadKeys.clear()}
  }
  function startGamepad(){
    if(state.gamepadTimer)return;
    const loop=()=>{
      if(state.control?.readyState!=="open"){state.gamepadTimer=null;return}
      const pad=[...(navigator.getGamepads?.()||[])].find(Boolean);
      if(pad){
        const wanted=new Set();
        const lx=pad.axes?.[0]||0,ly=pad.axes?.[1]||0,rx=pad.axes?.[2]||0,ry=pad.axes?.[3]||0;
        if(ly<-.35)wanted.add("KeyW");if(ly>.35)wanted.add("KeyS");if(lx<-.35)wanted.add("KeyA");if(lx>.35)wanted.add("KeyD");
        pad.buttons?.forEach((button,index)=>{if(button?.pressed){const code=gamepadButtonMap(index);if(code&&code!=="MouseLeft"&&code!=="MouseRight")wanted.add(code)}});
        for(const code of wanted)if(!state.gamepadKeys.has(code))sendControl({type:"key",event:"down",code,key:""});
        for(const code of [...state.gamepadKeys])if(!wanted.has(code))sendControl({type:"key",event:"up",code,key:""});
        state.gamepadKeys=wanted;
        if(Math.abs(rx)>.12||Math.abs(ry)>.12)sendControl({type:"pointer",event:"move",locked:true,movementX:rx*18,movementY:ry*18,x:.5,y:.5,button:0,buttons:0});
        const left=pad.buttons?.[6]?.pressed,right=pad.buttons?.[7]?.pressed;
        sendControl({type:"gamepad-mouse",left:!!left,right:!!right});
      }
      state.gamepadTimer=requestAnimationFrame(loop);
    };
    state.gamepadTimer=requestAnimationFrame(loop);
  }

  function saveAndConnect(){
    const input=document.getElementById("genesisVmHostKey");
    const value=String(input?.value||"").trim();
    if(!validHostKey(value)){pairScreen("That Host Key does not look complete. Copy the entire key from the Genesis Host app.");return}
    localStorage.setItem(HOST_KEY_STORAGE,value);
    connect(true);
  }
  function pair(){pairScreen()}

  function patchGenesisVm(){
    const vm=global.GenesisVM;
    if(!vm||vm.__hostPatched)return false;
    vm.__hostPatched=true;
    vm.connect=connect;
    vm.launch=function(force=false){
      if(!isAdmin())return;
      try{
        if(typeof openApp==="function")openApp("vm");
      }catch{}
      setTimeout(()=>connect(force),0);
    };
    vm.focusVm=function(){try{if(typeof openWindows==="object"&&openWindows.vm){focusWindow?.(openWindows.vm);return true}}catch{}return false};
    vm.mount=function(){
      const root=document.getElementById("genesisVmRoot");
      if(!isAdmin()||!root||root.__genesisHostClosed||root.closest?.('.window')?.classList?.contains?.('closing'))return;
      try{if(typeof openWindows==="object"&&openWindows.vm)openWindows.vm.classList.add("maximized")}catch{}
      const close=root.closest?.('.window')?.querySelector('.window-control.close');
      if(close&&!close.__genesisHostCloseBound){
        close.__genesisHostCloseBound=true;close.addEventListener("click",()=>{root.__genesisHostClosed=true;disconnect()});
      }
      const previous=state.video;ensureVideo();
      connect(!!state.peer&&previous!==state.video);
    };
    return true;
  }

  global.GenesisHostVM={connect,disconnect,pair,saveAndConnect,enableSound,state,patch:patchGenesisVm};
  global.addEventListener("pagehide",()=>disconnect());
  if(!patchGenesisVm()){
    const timer=setInterval(()=>{if(patchGenesisVm())clearInterval(timer)},60);
    setTimeout(()=>clearInterval(timer),8000);
  }
})(window);
