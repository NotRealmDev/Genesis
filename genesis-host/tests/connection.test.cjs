const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const viewerSource=fs.readFileSync(path.join(__dirname,'../../genesis-host-vm.js'),'utf8');
const hostSource=fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8');
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};

function harness(){
  let now=0,nextTimer=1;
  const timers=new Map(),elements=new Map(),peers=[],signals=[],handlers=new Map();
  function element(id){
    if(elements.has(id))return elements.get(id);
    const listeners=new Map();
    const el={id,style:{},value:'',textContent:'',innerHTML:'',checked:false,tabIndex:0,
      readyState:0,videoWidth:0,videoHeight:0,paused:true,muted:false,
      classList:{hidden:false,add(){this.hidden=true},remove(){this.hidden=false},toggle(){}},
      addEventListener(name,fn){listeners.set(name,fn)},
      fire(name,event={}){return listeners.get(name)?.(event)},
      focus(){},insertBefore(){},setAttribute(){},remove(){},getBoundingClientRect(){return {left:0,top:0,width:1280,height:720}},
      async play(){if(el.blockPlayback&&!el.muted)throw Object.assign(new Error('Gesture required'),{name:'NotAllowedError'});el.paused=false;el.readyState=2;el.videoWidth=1280;el.videoHeight=720;el.fire('playing')}
    };
    elements.set(id,el);return el;
  }
  class Peer{
    constructor(){this.remoteDescription=null;this.localDescription=null;this.connectionState='new';this.added=[];peers.push(this)}
    addTransceiver(){}
    createDataChannel(){return {readyState:'connecting',close(){},send(){}}}
    addTrack(track){return {track}}
    async createOffer(){return {type:'offer',sdp:'test-offer'}}
    async createAnswer(){return {type:'answer',sdp:'test-answer'}}
    async setLocalDescription(value){this.localDescription=value}
    async setRemoteDescription(value){this.remoteDescription=value}
    async addIceCandidate(value){if(!this.remoteDescription)throw new Error('InvalidStateError');this.added.push(value)}
    close(){this.connectionState='closed';this.onconnectionstatechange?.()}
  }
  const track={kind:'video',readyState:'live',stop(){this.readyState='ended'}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[]};
  const channel={
    on(type,{event},fn){handlers.set(event,fn);return this},
    subscribe(fn){fn('SUBSCRIBED');return this},
    async httpSend(event,payload){signals.push({event,payload});return {success:true}}
  };
  const context={console:{error(){},warn(){},info(){}},URL,Date,Math,Set,Map,Promise,
    localStorage:{getItem:()=> 'test-host-key-abcdefghijklmnopqrstuvwxyz',setItem(){}},
    crypto:{randomUUID:()=> 'current-session'},innerWidth:1280,innerHeight:720,devicePixelRatio:1,
    document:{getElementById:element,querySelector:selector=>selector.includes('stage')?element('stage'):null,
      createElement:()=>element('genesisVmStream'),head:{appendChild(){}},pointerLockElement:null},
    GenesisVM:{isAdmin:()=>true},GENESIS_BACKEND:{url:'https://example.supabase.co',anonKey:'public-test-key-1234567890'},
    supabase:{createClient:()=>({channel:()=>channel,async removeChannel(){}})},
    RTCPeerConnection:Peer,MediaStream:class{},
    navigator:{platform:'test',mediaDevices:{async getDisplayMedia(){return stream}}},
    setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{fn,at:now+ms});return id},
    clearTimeout:id=>timers.delete(id),setInterval(){return 1000},clearInterval(){},
    requestAnimationFrame(){return 1001},cancelAnimationFrame(){},addEventListener(){},
    genesisHost:{async getConfig(){return {hostKey:'test-host-key-abcdefghijklmnopqrstuvwxyz',autoLaunch:false}},
      async connectSignal(){},async sendSignal(event,payload){signals.push({event,payload})},
      onSignal(fn){context.hostSignal=fn},onStatus(){},async launchGeForce(){return {ok:true}},
      async captureReady(){return {found:true}},focusGeForce(){},sendInput(){}}
  };
  context.window=context;
  vm.createContext(context);
  async function advance(ms){
    now+=ms;
    for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn()}
    await settle();
  }
  return {context,element,peers,signals,handlers,timers,stream,advance};
}

test('viewer queues early host ICE until the answer is applied',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  await h.context.GenesisHostVM.connect();
  const candidate={candidate:'candidate:early',sdpMid:'0'};
  await h.handlers.get('host-ice')({payload:{sessionId:'current-session',candidate}});
  await h.handlers.get('host-answer')({payload:{sessionId:'current-session',answer:{type:'answer',sdp:'test'}}});
  assert.equal(h.peers[0].added.length,1,'early ICE was silently dropped');
});

test('an SDP answer without video still ends in a bounded visible error',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  await h.context.GenesisHostVM.connect();
  await h.handlers.get('host-answer')({payload:{sessionId:'current-session',answer:{type:'answer',sdp:'test'}}});
  await h.advance(60000);
  assert.match(h.element('genesisVmCard').innerHTML,/no video|did not start|timed out/i);
});

test('transport connection alone must not hide the black-screen overlay',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  await h.context.GenesisHostVM.connect();
  const pc=h.peers[0];pc.connectionState='connected';pc.onconnectionstatechange();
  assert.equal(h.element('genesisVmOverlay').classList.hidden,false,'connected transport was mistaken for working video');
});

test('blocked autoplay recovers muted video and offers an explicit sound action',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  await h.context.GenesisHostVM.connect();
  const video=h.element('genesisVmStream');video.blockPlayback=true;
  const pc=h.peers[0];pc.connectionState='connected';pc.onconnectionstatechange();
  pc.ontrack({streams:[h.stream],track:h.stream.getVideoTracks()[0]});await settle();
  assert.equal(video.muted,true);
  assert.equal(video.paused,false);
  assert.equal(h.element('genesisVmOverlay').classList.hidden,true);
  assert.match(h.element('genesisVmSound').textContent,/sound/i);
});

test('host preserves early ICE for the matching offer and excludes old sessions',async()=>{
  const h=harness();vm.runInContext(hostSource,h.context);await settle();
  await h.context.hostSignal({event:'viewer-ice',payload:{sessionId:'current-session',candidate:{candidate:'early'}}});
  await h.context.hostSignal({event:'viewer-ice',payload:{sessionId:'old-session',candidate:{candidate:'old'}}});
  const answering=h.context.hostSignal({event:'viewer-offer',payload:{sessionId:'current-session',offer:{type:'offer',sdp:'test'}}});
  await settle();await h.advance(1000);await answering;
  assert.deepEqual(h.peers[0].added.map(c=>c.candidate),['early']);
  assert.equal(h.signals.some(s=>s.event==='host-answer'),true);
});

test('canceling during startup cannot create a stray peer or offer',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  const pending=h.context.GenesisHostVM.connect();
  await h.context.GenesisHostVM.disconnect();await pending;
  assert.equal(h.peers.length,0);
  assert.equal(h.signals.length,0);
  assert.equal(h.context.GenesisHostVM.state.connecting,false);
});

test('old answers and candidates cannot reach a new viewer session',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  await h.context.GenesisHostVM.connect();
  h.context.crypto.randomUUID=()=> 'new-session';
  await h.context.GenesisHostVM.connect(true);
  await h.handlers.get('host-ice')({payload:{sessionId:'current-session',candidate:{candidate:'old'}}});
  await h.handlers.get('host-answer')({payload:{sessionId:'current-session',answer:{type:'answer',sdp:'old'}}});
  assert.equal(h.peers[1].remoteDescription,null);
  assert.equal(h.context.GenesisHostVM.state.pendingIce.length,0);
});

test('a disconnected transport gets one bounded reconnect attempt',async()=>{
  const h=harness();vm.runInContext(viewerSource,h.context);
  await h.context.GenesisHostVM.connect();
  const pc=h.peers[0];pc.connectionState='disconnected';pc.onconnectionstatechange();
  await h.advance(5000);
  assert.equal(h.peers.length,2);
  assert.equal(pc.connectionState,'closed');
});

test('Enable stream starts capture within the click, before asynchronous work',async()=>{
  const h=harness();let activated=false,captureCalls=0;
  h.context.navigator.mediaDevices.getDisplayMedia=()=>{
    assert.equal(activated,true,'capture was requested after user activation was lost');
    captureCalls++;return Promise.resolve(h.stream);
  };
  vm.runInContext(hostSource,h.context);await settle();
  activated=true;const starting=h.element('prepareStream').fire('click');activated=false;
  await starting;
  assert.equal(captureCalls,1);
  assert.equal(h.element('prepareStream').textContent,'Stop stream');
});

const configSource=fs.readFileSync(path.join(__dirname,'../../supabase-config.js'),'utf8');
function loaderHarness({fail=false,hang=false}={}){
  const h=harness();let resumed=0;
  h.context.sessionStorage={getItem:()=> 'admin'};
  h.context.location={pathname:'/os.html'};
  h.context.document.readyState='complete';
  h.context.GenesisVM.mount=()=>{throw new Error('generic iframe must not mount')};
  h.context.document.head.appendChild=script=>{
    if(script.src.startsWith('genesis-host-vm')){
      h.context.GenesisVM.mount();
      if(hang)return;
      if(fail){queueMicrotask(()=>script.onerror());return}
      h.context.GenesisHostVM={patch(){
        h.context.GenesisVM.__hostPatched=true;
        h.context.GenesisVM.mount=()=>resumed++;
      }};
    }
    queueMicrotask(()=>script.onload());
  };
  vm.runInContext(configSource,h.context);
  return {...h,resumed:()=>resumed};
}

test('Host loader resumes VM opened while the Host module was downloading',async()=>{
  const h=loaderHarness();await settle();
  assert.equal(h.context.GenesisVM.__hostPatched,true);
  assert.equal(h.resumed(),1);
});

test('Host loader failure displays an actionable retry instead of a spinner',async()=>{
  const h=loaderHarness({fail:true});await settle();
  assert.match(h.element('genesisVmCard').innerHTML,/Retry loading/);
  assert.equal(typeof h.context.GenesisHostLoader.retry,'function');
});

test('a stalled Host script download times out visibly',async()=>{
  const h=loaderHarness({hang:true});await settle();await h.advance(12000);
  assert.match(h.element('genesisVmCard').innerHTML,/Host module unavailable/);
});
