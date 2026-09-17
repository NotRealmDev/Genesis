(()=>{
  "use strict";

  const state={config:null,peer:null,stream:null,capturePromise:null,sessionId:"",pendingIce:new Map(),connected:false,offerBusy:false,signalReady:false};
  const statusText=document.getElementById("statusText"),statusSub=document.getElementById("statusSub"),statusDot=document.getElementById("statusDot"),hostKeyInput=document.getElementById("hostKey"),copyKey=document.getElementById("copyKey"),newKey=document.getElementById("newKey"),launchGfn=document.getElementById("launchGfn"),focusGfn=document.getElementById("focusGfn"),gfnStatus=document.getElementById("gfnStatus"),autoLaunch=document.getElementById("autoLaunch"),logEl=document.getElementById("log");

  function log(message){
    const stamp=new Date().toLocaleTimeString([], {hour12:false});
    logEl.textContent=`${stamp}  ${message}\n`+logEl.textContent.slice(0,5000);
  }
  function setStatus(message,sub="",live=false){
    statusText.textContent=message;
    if(sub)statusSub.textContent=sub;
    statusDot.classList.toggle("live",!!live);
  }
  function closePeer({keepPendingIce=false}={}){
    const peer=state.peer;state.peer=null;
    if(!keepPendingIce)state.pendingIce.clear();state.connected=false;state.sessionId="";
    try{if(peer){peer.onconnectionstatechange=null;peer.onicecandidate=null;peer.close()}}catch{}
    window.genesisHost.sendInput({type:"release-all"});
  }
  function stopCapture(){
    if(state.stream){for(const track of state.stream.getTracks())try{track.stop()}catch{}}
    state.stream=null;
    const button=document.getElementById("prepareStream");if(button)button.textContent="Enable stream";
  }
  function beginCapture(){
    if(state.capturePromise)return state.capturePromise;
    // Call getDisplayMedia synchronously from the Enable stream click. Waiting
    // for an incoming offer first loses the user activation browsers require.
    const request=navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:60,max:60},width:{ideal:1920},height:{ideal:1080}},audio:true});
    state.capturePromise=Promise.resolve(request).then(stream=>{
      const video=stream.getVideoTracks()[0];
      if(!video){for(const track of stream.getTracks())track.stop();throw new Error("GeForce NOW video capture did not start.")}
      video.contentHint="motion";
      video.onended=()=>{
        const sessionId=state.sessionId;
        stopCapture();closePeer();log("GeForce NOW capture ended");
        setStatus("Capture stopped","Click Enable stream, then reconnect Genesis.");
        if(sessionId)send("host-error",{sessionId,message:"Host capture stopped. Click Enable stream in Genesis Host, then retry."}).catch(()=>{});
      };
      for(const audio of stream.getAudioTracks())audio.contentHint="music";
      state.stream=stream;
      const button=document.getElementById("prepareStream");if(button)button.textContent="Stop stream";
      return stream;
    }).catch(error=>{
      if(error.name==="InvalidStateError"||error.name==="NotAllowedError")throw new Error("Click Enable stream in Genesis Host while GeForce NOW is open, then reconnect Genesis.");
      throw error;
    }).finally(()=>{state.capturePromise=null});
    return state.capturePromise;
  }
  async function ensureCapture(){
    if(state.stream&&state.stream.getVideoTracks().some(track=>track.readyState==="live"))return state.stream;
    let ready;
    // Chrome/Edge may take several seconds to create the correctly titled
    // GFN window. A fixed 700ms pause was too short on slower host PCs.
    for(let attempt=0;attempt<60;attempt++){
      ready=await window.genesisHost.captureReady();
      if(ready?.found)break;
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    if(!ready?.found)throw new Error("GeForce NOW window was not found. Open GeForce NOW first.");
    return beginCapture();
  }
  async function tuneSender(sender){
    if(sender.track?.kind!=="video")return;
    try{
      const params=sender.getParameters();
      params.degradationPreference="maintain-framerate";
      if(!params.encodings?.length)params.encodings=[{}];
      params.encodings[0].maxBitrate=14000000;
      params.encodings[0].maxFramerate=60;
      await sender.setParameters(params);
    }catch{}
  }
  async function send(event,payload){
    try{return await window.genesisHost.sendSignal(event,payload)}catch(error){log("Signal send failed: "+error.message);throw error}
  }
  async function answerOffer(payload){
    if(state.offerBusy){
      if(payload?.sessionId&&payload.sessionId!==state.sessionId)send("host-error",{sessionId:payload.sessionId,message:"Host is preparing another connection. Retry in a few seconds."}).catch(()=>{});
      return;
    }
    if(!payload?.sessionId||!payload?.offer?.sdp)return;
    state.offerBusy=true;
    try{
      setStatus("Viewer connecting…","Preparing GeForce NOW and the WebRTC stream.");
      closePeer({keepPendingIce:true});
      state.sessionId=payload.sessionId;
      for(const key of state.pendingIce.keys())if(key!==state.sessionId)state.pendingIce.delete(key);
      const sessionId=payload.sessionId;
      const gfn=await window.genesisHost.launchGeForce();
      if(!gfn?.ok)throw new Error(gfn?.error||"Could not launch GeForce NOW");
      await new Promise(resolve=>setTimeout(resolve,700));
      const stream=await ensureCapture();
      const pc=new RTCPeerConnection({iceServers:[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}],iceCandidatePoolSize:4,bundlePolicy:"max-bundle"});
      state.peer=pc;
      for(const track of stream.getTracks()){
        const sender=pc.addTrack(track,stream);
        tuneSender(sender);
      }
      pc.onicecandidate=event=>{if(event.candidate&&state.peer===pc)send("host-ice",{sessionId,candidate:event.candidate.toJSON?.()||event.candidate}).catch(()=>{})};
      pc.ondatachannel=event=>{
        const channel=event.channel;
        if(channel.label!=="genesis-control")return;
        channel.onopen=()=>{window.genesisHost.focusGeForce();log("Remote controls connected")};
        channel.onmessage=message=>{
          try{const value=JSON.parse(message.data);window.genesisHost.sendInput(value)}catch{}
        };
        channel.onclose=()=>window.genesisHost.sendInput({type:"release-all"});
      };
      pc.onconnectionstatechange=()=>{
        if(state.peer!==pc)return;
        const current=pc.connectionState;
        if(current==="connected"){
          state.connected=true;setStatus("Connected","Genesis is viewing GeForce NOW.",true);gfnStatus.textContent="Streaming GeForce NOW";window.genesisHost.focusGeForce();log("WebRTC stream connected");
        }else if(current==="disconnected"){
          setStatus("Connection interrupted","Waiting for WebRTC to recover…");log("Viewer connection interrupted")
        }else if(current==="failed"){
          state.connected=false;setStatus("Connection failed","The viewer may be behind a network that needs a TURN relay.");log("WebRTC connection failed")
        }else if(current==="closed")state.connected=false;
      };
      await pc.setRemoteDescription(payload.offer);
      const currentIce=state.pendingIce.get(sessionId)||[];state.pendingIce.delete(sessionId);
      for(const candidate of currentIce){try{await pc.addIceCandidate(candidate)}catch(error){log("Viewer ICE candidate rejected: "+error.message)}}
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await send("host-answer",{sessionId:state.sessionId,answer:{type:pc.localDescription.type,sdp:pc.localDescription.sdp},host:{platform:navigator.platform,videoTracks:stream.getVideoTracks().length,audioTracks:stream.getAudioTracks().length},sentAt:new Date().toISOString()});
      setStatus("Connecting stream…","Waiting for the browser to finish the direct WebRTC connection.");
      log("Answered Genesis VM viewer request");
    }catch(error){
      log("Viewer setup failed: "+error.message);
      setStatus("Host error",error.message);
      if(payload?.sessionId)send("host-error",{sessionId:payload.sessionId,message:error.message}).catch(()=>{});
    }finally{state.offerBusy=false}
  }
  async function addViewerIce(payload){
    if(!payload?.candidate||typeof payload.sessionId!=="string"||payload.sessionId.length>128)return;
    if(state.sessionId&&payload.sessionId!==state.sessionId)return;
    if(!state.peer?.remoteDescription){
      if(!state.pendingIce.has(payload.sessionId)){
        if(state.pendingIce.size>=4)state.pendingIce.delete(state.pendingIce.keys().next().value);
        state.pendingIce.set(payload.sessionId,[]);
      }
      const queue=state.pendingIce.get(payload.sessionId);
      if(queue.length<128)queue.push(payload.candidate);
      return;
    }
    try{await state.peer.addIceCandidate(payload.candidate)}catch(error){log("Viewer ICE candidate rejected: "+error.message)}
  }
  async function handleSignal(packet){
    const payload=packet?.payload||{};
    if(packet.event==="viewer-offer")await answerOffer(payload);
    else if(packet.event==="viewer-ice")await addViewerIce(payload);
    else if(packet.event==="viewer-ping"){
      await send("host-status",{sessionId:payload.sessionId,status:state.connected?"Host online · streaming":"Host online · ready",sentAt:Date.now()}).catch(()=>{});
    }
  }

  async function connectSignaling(){
    setStatus("Connecting signaling…","Genesis Host is connecting to the same realtime service used by Genesis Messages.");
    await window.genesisHost.connectSignal(state.config.hostKey);
    state.signalReady=true;
    setStatus("Host online","Waiting for Genesis VM to connect with this Host Key.",true);
    log("Signaling connected. Host is ready.");
  }

  async function init(){
    state.config=await window.genesisHost.getConfig();
    hostKeyInput.value=state.config.hostKey;
    autoLaunch.checked=!!state.config.autoLaunch;
    gfnStatus.textContent=state.config.browserRunning?"GeForce NOW browser is already running":"GeForce NOW will open in Chrome or Edge";
    window.genesisHost.onSignal(handleSignal);
    window.genesisHost.onStatus(payload=>{
      if(payload?.message){log(payload.message);if(payload.type==="gfn")gfnStatus.textContent=payload.message}
    });
    try{await connectSignaling()}catch(error){setStatus("Signaling offline",error.message);log("Signaling failed: "+error.message)}
  }

  copyKey.addEventListener("click",async()=>{await window.genesisHost.copyKey(hostKeyInput.value);copyKey.textContent="Copied";setTimeout(()=>copyKey.textContent="Copy",900)});
  newKey.addEventListener("click",async()=>{
    const value=await window.genesisHost.regenerateKey();
    if(value?.hostKey){
      closePeer();stopCapture();state.config.hostKey=value.hostKey;hostKeyInput.value=value.hostKey;state.signalReady=false;
      setStatus("New key generated","Reconnect Genesis using the new Host Key.");
      try{await connectSignaling()}catch(error){setStatus("Signaling offline",error.message)}
    }
  });
  launchGfn.addEventListener("click",async()=>{gfnStatus.textContent="Opening GeForce NOW…";const result=await window.genesisHost.launchGeForce();gfnStatus.textContent=result?.ok?"GeForce NOW is open":result?.error||"Could not open GeForce NOW";if(result?.ok)log("GeForce NOW opened")});
  focusGfn.addEventListener("click",()=>window.genesisHost.focusGeForce());
  document.getElementById("prepareStream")?.addEventListener("click",async()=>{
    const button=document.getElementById("prepareStream");
    if(state.stream){
      const sessionId=state.sessionId;closePeer();stopCapture();setStatus("Host online","Stream stopped. Your GeForce NOW login remains saved.",true);
      if(sessionId)send("host-error",{sessionId,message:"Streaming was stopped in Genesis Host."}).catch(()=>{});
      return;
    }
    button.disabled=true;
    try{await beginCapture();setStatus("Stream ready","Reconnect Genesis VM with this Host Key.",true);log("GeForce NOW capture prepared")}
    catch(error){setStatus("Capture unavailable",error.message);log("Capture failed: "+error.message)}
    finally{button.disabled=false}
  });
  autoLaunch.addEventListener("change",()=>window.genesisHost.setAutoLaunch(autoLaunch.checked));
  window.addEventListener("beforeunload",()=>{window.genesisHost.sendInput({type:"release-all"});closePeer();stopCapture()});

  init().catch(error=>{setStatus("Host failed",error.message);log(error.stack||error.message)});
})();
