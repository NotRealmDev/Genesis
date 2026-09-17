(function(global){
  'use strict';
  const state={attempt:0,root:null,stream:null,peer:null,client:null,channel:null,key:'',session:'',host:false,ice:[],earlyIce:new Map(),timer:null,observer:null,watch:null,stats:null};
  const el=id=>document.getElementById('genesisTest'+id);
  function isAdmin(){
    try{if(typeof genesisRole==='function')return genesisRole()==='admin'}catch{}
    try{const login=JSON.parse(localStorage.getItem('genesisLogin')||'null');return login?.role==='admin'&&login.expires>Date.now()}catch{return false}
  }
  function status(text){if(el('Status'))el('Status').textContent=text}
  function active(attempt){return attempt===state.attempt&&isAdmin()&&state.root?.isConnected&&!state.root.closest('.window')?.classList.contains('closing')}
  function randomKey(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')}
  function validKey(key){return /^[a-f0-9]{64}$/.test(key)}
  function closePeer(){
    clearTimeout(state.timer);clearInterval(state.stats);state.timer=state.stats=null;
    const peer=state.peer;state.peer=null;state.ice=[];
    if(peer){peer.ontrack=peer.onicecandidate=peer.onconnectionstatechange=null;peer.close()}
    if(el('Video')){el('Video').srcObject=null;el('Video').hidden=true}
  }
  async function stop(){
    state.attempt++;closePeer();state.earlyIce.clear();
    if(state.stream){state.stream.getTracks().forEach(track=>track.stop());state.stream=null}
    const channel=state.channel,client=state.client;state.channel=state.client=null;state.session='';state.key='';state.host=false;
    if(el('Key'))el('Key').textContent='Not sharing';
    if(el('Share'))el('Share').disabled=false;
    if(client&&channel)await client.removeChannel(channel).catch(()=>{});
    status('Stopped · start sharing on the PC or enter its Test key');
  }
  async function sdk(){
    if(global.supabase?.createClient)return global.supabase;
    if(global.GenesisTestSdkPromise)return global.GenesisTestSdkPromise;
    global.GenesisTestSdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');let finished=false;
      const timeout=setTimeout(()=>finish(new Error('Signaling library download timed out.')),10000);
      function finish(error){if(finished)return;finished=true;clearTimeout(timeout);script.onload=script.onerror=null;if(error){script.remove();reject(error)}else resolve(global.supabase)}
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js';
      script.onload=()=>finish(global.supabase?.createClient?null:new Error('Signaling library unavailable.'));
      script.onerror=()=>finish(new Error('Could not download the signaling library.'));document.head.appendChild(script);
    }).finally(()=>{global.GenesisTestSdkPromise=null});
    return global.GenesisTestSdkPromise;
  }
  async function send(type,data={},session=state.session){
    const channel=state.channel;if(!channel)throw new Error('Signaling is not connected.');
    const result=await channel.send({type:'broadcast',event:'test-signal',payload:{type,session,...data}});
    if(result!=='ok')throw new Error('Signaling failed: '+result);
  }
  async function subscribe(key,attempt){
    const library=await sdk();if(!active(attempt))return;
    const backend=global.GENESIS_BACKEND;
    if(!backend?.url||!backend?.anonKey)throw new Error('Genesis signaling is not configured.');
    const client=state.client=library.createClient(backend.url,backend.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:30}}});
    const channel=state.channel=client.channel('genesis-test-'+key,{config:{broadcast:{self:false,ack:true}}});
    let queue=Promise.resolve();
    channel.on('broadcast',{event:'test-signal'},packet=>{
      queue=queue.then(()=>{if(active(attempt))return receive(packet.payload,attempt)}).catch(error=>{if(active(attempt))status('Stream error: '+error.message)});
    });
    await new Promise((resolve,reject)=>{
      let settled=false;const timer=setTimeout(()=>finish(new Error('Signaling timed out. Try again.')),12000);
      function finish(error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve()}
      channel.subscribe(value=>{
        if(value==='SUBSCRIBED')finish();
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(value)){
          const error=new Error('Signaling disconnected. Stop, then try again.');finish(error);if(active(attempt))status(error.message);
        }
      });
    });
  }
  function makePeer(session,attempt){
    closePeer();state.session=session;
    // STUN discovers routes; no TURN relay is configured, so some connections
    // may still require a working LAN route. Do not claim universal connectivity.
    const peer=state.peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    const current=()=>active(attempt)&&state.peer===peer;
    peer.onicecandidate=event=>{if(event.candidate&&current())send(state.host?'host-ice':'viewer-ice',{candidate:event.candidate.toJSON()},session).catch(error=>{if(current())status(error.message)})};
    peer.onconnectionstatechange=()=>{if(current()&&['failed','disconnected'].includes(peer.connectionState))status('Video connection lost. Stop, then reconnect with the PC Test key.')};
    state.timer=setTimeout(()=>{if(current())status('No video arrived. Check PC sharing and the Test key. Some networks need a TURN relay, which is not configured.')},25000);
    if(!state.host){
      peer.addTransceiver('video',{direction:'recvonly'});
      peer.ontrack=event=>{
        if(!current())return;
        const video=el('Video');if(!video)return;
        if(!video.srcObject)video.srcObject=event.streams?.[0]||new MediaStream([event.track]);
        video.hidden=false;video.muted=true;
        video.play().catch(error=>{if(current())status('Playback did not start: '+error.message)});
        let previous=null;
        state.stats=setInterval(async()=>{
          if(!current())return;
          try{
            const report=await peer.getStats();if(!current())return;
            for(const item of report.values())if(item.type==='inbound-rtp'&&item.kind==='video'&&item.framesDecoded>0){
              clearTimeout(state.timer);
              const fps=previous&&item.timestamp>previous.timestamp?Math.round((item.framesDecoded-previous.framesDecoded)*1000/(item.timestamp-previous.timestamp)):null;
              status('Receiving video · '+(fps===null?'measuring FPS':fps+' decoded FPS')+' · target 60 FPS');previous=item;
            }
          }catch{}
        },2000);
      };
    }
    return peer;
  }
  async function receive(message,attempt){
    if(!message||!message.session||!active(attempt))return;
    if(state.host&&message.type==='viewer-ice'&&message.session!==state.session){
      if(!state.earlyIce.has(message.session)&&state.earlyIce.size>=16)return;
      const candidates=state.earlyIce.get(message.session)||[];
      if(candidates.length<128)candidates.push(message.candidate);
      state.earlyIce.set(message.session,candidates);return;
    }
    if(state.host&&message.type==='offer'){
      if(!state.stream?.active){await send('error',{message:'The PC is not sharing a screen.'},message.session);return}
      const peer=makePeer(message.session,attempt);
      for(const track of state.stream.getTracks()){
        const sender=peer.addTrack(track,state.stream);const params=sender.getParameters();
        if(!params.encodings?.length)params.encodings=[{}];params.encodings[0].maxFramerate=60;params.encodings[0].maxBitrate=8_000_000;params.degradationPreference='maintain-framerate';
        await sender.setParameters(params).catch(()=>{});
      }
      if(!active(attempt)||state.peer!==peer)return;
      await peer.setRemoteDescription(message.description);
      if(!active(attempt)||state.peer!==peer)return;
      for(const candidate of state.earlyIce.get(message.session)||[])await peer.addIceCandidate(candidate);
      state.earlyIce.clear();
      await peer.setLocalDescription(await peer.createAnswer());
      if(active(attempt)&&state.peer===peer){await send('answer',{description:peer.localDescription});clearTimeout(state.timer);status('PC sharing · viewer establishing video · target 60 FPS')}
      return;
    }
    if(message.session!==state.session)return;
    const peer=state.peer;
    if(message.type==='closed'){closePeer();status('The PC stopped sharing.');return}
    if(!peer)return;
    if(!state.host&&message.type==='error'){status(message.message||'PC stream failed.');return}
    if(!state.host&&message.type==='answer'){
      await peer.setRemoteDescription(message.description);
      if(!active(attempt)||state.peer!==peer)return;
      for(const candidate of state.ice.splice(0))await peer.addIceCandidate(candidate);
    }else if(message.type===(state.host?'viewer-ice':'host-ice')){
      if(peer.remoteDescription)await peer.addIceCandidate(message.candidate);else if(state.ice.length<128)state.ice.push(message.candidate);
    }
  }
  async function share(){
    if(!isAdmin())return;
    // Invoke directly in the user's click handler, before any asynchronous work.
    const capture=navigator.mediaDevices?.getDisplayMedia?.({video:{displaySurface:'monitor',frameRate:{ideal:60,max:60},width:{ideal:1280},height:{ideal:720}},audio:false});
    if(!capture){status('Screen capture requires desktop Chrome/Edge and HTTPS.');return}
    // Attach rejection handling before stop awaits signaling cleanup.
    const captureResult=Promise.resolve(capture).then(stream=>({stream}),error=>({error}));
    await stop();const attempt=state.attempt;status('Choose Entire screen on your PC…');
    try{
      const result=await captureResult;if(result.error)throw result.error;
      const stream=result.stream;
      if(!active(attempt)){stream.getTracks().forEach(track=>track.stop());return}
      state.host=true;state.stream=stream;state.key=randomKey();
      const track=stream.getVideoTracks()[0];track.contentHint='motion';
      await track.applyConstraints({frameRate:{ideal:60,max:60},width:{max:1280},height:{max:720}});
      track.onended=()=>{send('closed').catch(()=>{});stop()};
      await subscribe(state.key,attempt);if(!active(attempt))return;
      el('Key').textContent=state.key;el('Share').disabled=true;
      status('PC ready · copy this Test key to the Chromebook · target 60 FPS');
    }catch(error){if(active(attempt)){await stop();status('Could not share: '+error.message)}}
  }
  async function connect(){
    if(!isAdmin())return;
    const key=String(el('Input')?.value||'').trim().toLowerCase();
    if(!validKey(key)){status('Paste the complete 64-character key shown in Test on the PC.');return}
    await stop();const attempt=state.attempt;
    try{
      state.key=key;status('Connecting to PC…');await subscribe(key,attempt);if(!active(attempt))return;
      const peer=makePeer(crypto.randomUUID(),attempt);
      await peer.setLocalDescription(await peer.createOffer());
      if(active(attempt)&&state.peer===peer)await send('offer',{description:peer.localDescription});
    }catch(error){if(active(attempt)){await stop();status('Could not connect: '+error.message)}}
  }
  function html(){
    setTimeout(mount,0);
    return '<div id="genesisTestRoot" style="height:100%;display:flex;flex-direction:column;background:#05070c;color:white"><div style="padding:16px;flex:none"><h3 style="margin:0 0 8px">Test · PC screen mirror</h3><p id="genesisTestStatus" role="status">Start sharing on your PC, then pair your Chromebook.</p><p>PC: <button class="os-btn" id="genesisTestShare">Share PC screen</button> <button class="os-btn" id="genesisTestCopy">Copy Test key</button></p><p id="genesisTestKey" style="overflow-wrap:anywhere;user-select:text;font:12px monospace">Not sharing</p><p>Chromebook: <input id="genesisTestInput" autocomplete="off" spellcheck="false" placeholder="Paste PC Test key" style="max-width:65%;padding:9px;border-radius:9px;background:#172235;color:white;border:1px solid #34445d"> <button class="os-btn" id="genesisTestConnect">Connect</button></p><button class="os-btn" id="genesisTestStop">Stop</button> <button class="os-btn" id="genesisTestFull">Fullscreen</button><p style="font-size:11px;opacity:.65">Read-only · no audio · 720p · 60 FPS target, not guaranteed. Keep the PC Test app open. Sharing exposes everything visible on the selected screen.</p></div><video id="genesisTestVideo" autoplay muted playsinline hidden style="width:100%;flex:1;min-height:0;object-fit:contain;background:black"></video></div>';
  }
  function mount(){
    if(!isAdmin())return;
    const root=document.getElementById('genesisTestRoot');if(!root||root.__mounted)return;
    root.__mounted=true;state.root=root;
    el('Share').onclick=share;el('Connect').onclick=connect;
    el('Stop').onclick=()=>{if(state.host)send('closed').catch(()=>{});stop()};
    el('Copy').onclick=async()=>{try{if(!state.key||!state.host)throw new Error('Share a screen on the PC first.');await navigator.clipboard.writeText(state.key);status('Test key copied. Paste it in Test on your Chromebook.')}catch(error){status(error.message+' You can select and copy the key manually.')}};
    el('Full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen()}catch(error){status('Fullscreen unavailable: '+error.message)}};
    state.observer?.disconnect();clearInterval(state.watch);
    const check=()=>{if(root.isConnected&&isAdmin()&&!root.closest('.window')?.classList.contains('closing'))return;state.observer?.disconnect();clearInterval(state.watch);state.watch=null;stop()};
    state.observer=new MutationObserver(check);state.observer.observe(document.getElementById('os')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});state.watch=setInterval(check,500);
  }
  function install(){
    if(!isAdmin())return;
    try{if(typeof apps!=='object')return;apps.test={title:'Test',adminOnly:true,content:html}}catch{return}
    const desktop=document.getElementById('desktop');if(!desktop||desktop.querySelector('[data-app="test"]'))return;
    const icon=document.createElement('div');icon.className='desktop-icon admin-only-icon';icon.dataset.app='test';icon.dataset.adminOnly='1';icon.style.left='430px';icon.style.top='260px';
    icon.innerHTML='<div class="app-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 9h6"/></svg></div><div class="app-name">Test</div>';
    icon.ondblclick=()=>{if(isAdmin()&&typeof openApp==='function')openApp('test')};desktop.appendChild(icon);
  }
  global.GenesisTest={install,mount,share,connect,stop,isAdmin,validKey,state};install();
  global.addEventListener('pagehide',()=>{if(state.stream)state.stream.getTracks().forEach(track=>track.stop());closePeer()});
})(window);
