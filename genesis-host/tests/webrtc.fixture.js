(async()=>{
  const host=document.getElementById('host'),viewer=document.getElementById('viewer');
  const start=document.getElementById('start'),reconnect=document.getElementById('reconnect'),stop=document.getElementById('stop');
  let hostReady=false,viewerReady=false,run=0,done=false;
  const counts={earlyHostIce:0,earlyViewerIce:0,controls:0};
  let offerDelivered=false,answerDelivered=false;
  function ready(){if(hostReady&&viewerReady){start.disabled=false;document.getElementById('status').textContent='Ready'}}
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||![host.contentWindow,viewer.contentWindow].includes(event.source))return;
    const packet=event.data;
    if(packet?.type==='host-ready'){hostReady=true;ready()}
    if(packet?.type==='viewer-ready'){viewerReady=true;ready()}
    if(packet?.type==='control'){
      counts.controls++;
      document.getElementById('control').textContent='Received '+packet.payload.type+': '+(packet.payload.code||packet.payload.event||'');
    }
    if(packet?.type!=='signal')return;
    const fromHost=event.source===host.contentWindow,target=fromHost?viewer.contentWindow:host.contentWindow;
    if(packet.event==='host-ice'&&!answerDelivered)counts.earlyHostIce++;
    if(packet.event==='viewer-ice'&&!offerDelivered)counts.earlyViewerIce++;
    // Deliberately deliver ICE before SDP to exercise the real signaling race.
    const delay=packet.event==='host-answer'?900:packet.event==='viewer-offer'?250:0;
    setTimeout(()=>{
      if(packet.event==='host-answer')answerDelivered=true;
      if(packet.event==='viewer-offer')offerDelivered=true;
      target.postMessage({type:'signal',event:packet.event,payload:packet.payload},location.origin);
    },delay);
  });
  function connect(force){
    run++;done=false;offerDelivered=false;answerDelivered=false;
    document.getElementById('status').textContent='Connecting run '+run+'…';document.getElementById('result').textContent='';
    viewer.contentWindow.postMessage({type:'connect',force},location.origin);
    reconnect.disabled=false;stop.disabled=false;
  }
  start.addEventListener('click',()=>connect(false));reconnect.addEventListener('click',()=>connect(true));
  stop.addEventListener('click',()=>{viewer.contentWindow.postMessage({type:'disconnect'},location.origin);document.getElementById('status').textContent='Stopped';done=true});
  setInterval(async()=>{
    if(done||!run)return;
    const state=viewer.contentWindow.GenesisHostVM?.state;
    if(!state?.peer||!state.mediaReady)return;
    const stats=await state.peer.getStats();let framesDecoded=0;
    for(const report of stats.values())if(report.type==='inbound-rtp'&&report.kind==='video')framesDecoded+=report.framesDecoded||0;
    if(framesDecoded<3)return;
    done=true;document.getElementById('status').textContent='PASS run '+run;
    document.getElementById('result').textContent=JSON.stringify({run,framesDecoded,width:state.video.videoWidth,height:state.video.videoHeight,earlyHostIce:counts.earlyHostIce,earlyViewerIce:counts.earlyViewerIce},null,2);
  },150);
  const hostHTML=await (await fetch('../renderer.html')).text();
  host.srcdoc=hostHTML.replace('<head>','<head><base href="/genesis-host/">').replace('<script src="renderer.js"></script>','<script src="tests/host.fixture.js"></script><script src="renderer.js"></script>');
  viewer.srcdoc='<!doctype html><html><head><base href="/genesis-host/tests/"><style>body{margin:0;background:#05070c;color:white;font:14px system-ui}.genesis-vm-stage{position:relative;height:520px}.genesis-vm-overlay{position:absolute;inset:0;display:grid;place-items:center;background:#111827ee;z-index:4;padding:24px}.hidden{display:none!important}</style></head><body><div id="genesisVmRoot"><p id="genesisVmStatus">Starting viewer</p><div class="genesis-vm-stage"><iframe id="genesisVmFrame"></iframe><div id="genesisVmOverlay" class="genesis-vm-overlay"><div id="genesisVmCard">Preparing…</div></div></div></div><script src="viewer.fixture.js"></script><script src="../../genesis-host-vm.js"></script></body></html>';
})().catch(error=>{document.getElementById('status').textContent='FAIL: '+error.message});
