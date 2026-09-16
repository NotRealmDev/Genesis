(()=>{
  "use strict";

  const state={config:null,peer:null,stream:null,sessionId:"",pendingIce:[],connected:false,offerBusy:false,signalReady:false};
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
  function closePeer(){
    try{state.peer?.close()}catch{}
    state.peer=null;state.pendingIce=[];state.connected=false;state.sessionId="";
  }
  function stopCapture(){
    if(state.stream){for(const track of state.stream.getTracks())try{track.stop()}catch{}}
    state.stream=null;
  }
  async function ensureCapture(){
    if(state.stream&&state.stream.getVideoTracks().some(track=>track.readyState==="live"))return state.stream;
    const ready=await window.genesisHost.captureReady();
    if(!ready?.found)throw new Error("GeForce NOW window was not found. Open GeForce NOW first.");
    const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:60,max:60},width:{ideal:1920},height:{ideal:1080}},audio:true});
    const video=stream.getVideoTracks()[0];
    if(!video)throw new Error("GeForce NOW video capture did not start.");
    video.contentHint="motion";
    video.onended=()=>{state.stream=null;log("GeForce NOW capture ended")};
    for(const audio of stream.getAudioTracks())audio.contentHint="music";
    state.stream=stream;
    return stream;
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
    if(state.offerBusy)return;
    if(!payload?.sessionId||!payload?.offer?.sdp)return;
    state.offerBusy=true;
    try{
      setStatus("Admin connecting…","Verifying Genesis admin session and preparing the stream.");
      const verified=await window.genesisHost.verifyAdmin(payload.adminToken||"");
      if(!verified?.ok){
        await send("host-error",{sessionId:payload.sessionId,message:verified?.error||"Admin verification failed"});
        log("Rejected viewer: admin verification failed");
        return;
      }
      const gfn=await window.genesisHost.launchGeForce();
      if(!gfn?.ok)throw new Error(gfn?.error||"Could not launch GeForce NOW");
      await new Promise(resolve=>setTimeout(resolve,700));
      const stream=await ensureCapture();
      closePeer();
      state.sessionId=payload.sessionId;
      const pc=new RTCPeerConnection({iceServers:[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}],iceCandidatePoolSize:4,bundlePolicy:"max-bundle"});
      state.peer=pc;
      for(const track of stream.getTracks()){
        const sender=pc.addTrack(track,stream);
        tuneSender(sender);
      }
      pc.onicecandidate=event=>{if(event.candidate)send("host-ice",{sessionId:state.sessionId,candidate:event.candidate.toJSON?.()||event.candidate}).catch(()=>{})};
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
        const current=pc.connectionState;
        if(current==="connected"){
          state.connected=true;setStatus("Connected","Genesis admin is viewing GeForce NOW.",true);gfnStatus.textContent="Streaming GeForce NOW";window.genesisHost.focusGeForce();log("WebRTC stream connected");
        }else if(current==="disconnected"){
          setStatus("Connection interrupted","Waiting for WebRTC to recover…");log("Viewer connection interrupted")
        }else if(current==="failed"){
          state.connected=false;setStatus("Connection failed","The viewer may be behind a network that needs a TURN relay.");log("WebRTC connection failed")
        }else if(current==="closed")state.connected=false;
      };
      await pc.setRemoteDescription(payload.offer);
      for(const candidate of state.pendingIce.splice(0)){try{await pc.addIceCandidate(candidate)}catch{}}
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
    if(!payload?.candidate)return;
    if(payload.sessionId!==state.sessionId||!state.peer){state.pendingIce.push(payload.candidate);return}
    try{await state.peer.addIceCandidate(payload.candidate)}catch{}
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
    setStatus("Host online","Waiting for an admin to open VM in Genesis.",true);
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
  autoLaunch.addEventListener("change",()=>window.genesisHost.setAutoLaunch(autoLaunch.checked));
  window.addEventListener("beforeunload",()=>{window.genesisHost.sendInput({type:"release-all"});closePeer();stopCapture()});

  init().catch(error=>{setStatus("Host failed",error.message);log(error.stack||error.message)});
})();
