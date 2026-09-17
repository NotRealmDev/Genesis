const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../genesis-test.js'),'utf8');
function fixture(role='admin'){
  const elements={};const icons=[];const peers=[];const sent=[];let callback;
  const element=id=>elements[id]||(elements[id]={textContent:'',value:'',hidden:false,isConnected:true,closest:()=>({classList:{contains:()=>false}})});
  const desktop={querySelector:()=>null,appendChild:icon=>icons.push(icon)};
  const track={kind:'video',stopped:false,applyConstraints:async function(value){this.constraints=value},stop(){this.stopped=true}};
  const stream={active:true,getTracks:()=>[track],getVideoTracks:()=>[track]};
  class Peer{
    constructor(){this.candidates=[];peers.push(this)}
    addTransceiver(){}
    addTrack(){return {getParameters:()=>({encodings:[{}]}),setParameters:async()=>{}}}
    async createOffer(){return {type:'offer',sdp:'synthetic-offer'}}
    async createAnswer(){return {type:'answer',sdp:'synthetic-answer'}}
    async setLocalDescription(value){this.localDescription=value}
    async setRemoteDescription(value){this.remoteDescription=value}
    async addIceCandidate(value){this.candidates.push(value)}
    close(){this.closed=true}
  }
  const channel={on(type,filter,handler){callback=handler;return this},subscribe(handler){handler('SUBSCRIBED')},async send(packet){sent.push(packet.payload);return 'ok'}};
  const client={channel:()=>channel,removeChannel:async()=>{}};
  const context={console,crypto:webcrypto,apps:{},genesisRole:()=>role,localStorage:{getItem:()=>null},document:{getElementById:id=>id==='desktop'?desktop:element(id),createElement:()=>({dataset:{},style:{}})},navigator:{mediaDevices:{getDisplayMedia:()=>Promise.resolve(stream)}},RTCPeerConnection:Peer,setTimeout,clearTimeout,setInterval,clearInterval,addEventListener:()=>{},GENESIS_BACKEND:{url:'https://fixture.supabase.co',anonKey:'public-fixture'},supabase:{createClient:()=>client}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  const app=context.GenesisTest;app.state.root=element('genesisTestRoot');
  return {app,context,icons,track,sent,peers,element,deliver:message=>callback({payload:message}),flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('Test installs only for admin and never auto-opens',()=>{
  const user=fixture('user');assert.equal(user.context.apps.test,undefined);assert.equal(user.icons.length,0);
  const admin=fixture();assert.equal(admin.context.apps.test.title,'Test');assert.equal(admin.context.apps.test.adminOnly,true);assert.equal(admin.icons.length,1);assert.equal(admin.app.state.peer,null);
});
test('Test keys require all 64 random hex characters',()=>{
  const f=fixture();assert.equal(f.app.validKey('a'.repeat(64)),true);assert.equal(f.app.validKey('12345678'),false);assert.equal(f.app.validKey('z'.repeat(64)),false);
});
test('PC capture requests 60 FPS and stops its tracks',async()=>{
  const f=fixture();await f.app.share();assert.equal(f.track.constraints.frameRate.ideal,60);assert.equal(f.app.state.host,true);assert.equal(f.app.state.key.length,64);await f.app.stop();assert.equal(f.track.stopped,true);assert.equal(f.app.state.channel,null);
});
test('Browser capture denial is reported without a stream',async()=>{
  const f=fixture();f.context.navigator.mediaDevices.getDisplayMedia=()=>Promise.reject(new Error('Permission denied'));await f.app.share();assert.match(f.element('genesisTestStatus').textContent,/Permission denied/);assert.equal(f.app.state.stream,null);
});
test('Viewer buffers ICE until the answer is applied',async()=>{
  const f=fixture();f.element('genesisTestInput').value='a'.repeat(64);await f.app.connect();const session=f.app.state.session;
  f.deliver({type:'host-ice',session,candidate:{candidate:'synthetic'}});await f.flush();assert.equal(f.peers[0].candidates.length,0);
  f.deliver({type:'answer',session,description:{type:'answer',sdp:'synthetic'}});await f.flush();assert.equal(f.peers[0].candidates.length,1);
  await f.app.stop();assert.equal(f.peers[0].closed,true);
});
test('Host preserves ICE that arrives before the viewer offer',async()=>{
  const f=fixture();await f.app.share();f.deliver({type:'viewer-ice',session:'early-session',candidate:{candidate:'early'}});await f.flush();
  f.deliver({type:'offer',session:'early-session',description:{type:'offer',sdp:'synthetic'}});await f.flush();await f.flush();assert.equal(f.peers[0].candidates.length,1);assert.equal(f.sent.at(-1).type,'answer');await f.app.stop();
});
test('Revoked admin role cannot start a viewer',async()=>{
  const f=fixture('user');f.element('genesisTestInput').value='a'.repeat(64);await f.app.connect();assert.equal(f.peers.length,0);
});
