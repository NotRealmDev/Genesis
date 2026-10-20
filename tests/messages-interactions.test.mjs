import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../genesis-messages.js',import.meta.url),'utf8');
function setup(){
  const elements=new Map(),stored=new Map(),sent=[];
  const node=()=>({dataset:{},classList:{add(){},toggle(){}},style:{},children:[],replaceChildren(){this.children=[]},appendChild(child){this.children.push(child);if(child.id)elements.set(child.id,child)},remove(){elements.delete(this.id)},querySelectorAll(){return[]}});
  const body=node();
  const context=vm.createContext({console,Date,URL,Map,Set,Promise,confirm:()=>true,
    crypto:{randomUUID:()=> '1234-test'},setTimeout:()=>1,clearTimeout(){},setInterval(){},requestAnimationFrame:fn=>fn(),
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,v)=>stored.set(key,v)},
    document:{body,head:node(),getElementById:id=>id==='genesisMessagesStyles'?{}:elements.get(id)||null,createElement:node,querySelector:()=>null,querySelectorAll:()=>[]},
    GenesisPresence:{users:()=>[{id:'202',name:'Alt'}]},addEventListener(){},
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){context.stopped=true}}]})}},RTCPeerConnection:function(){}
  });context.globalThis=context;
  vm.runInContext(source.replace('  global.GenesisMessages=Object.freeze({','  global.testMessages={state,renderConversation,handleDirectCall,onlineDot};\n  global.GenesisMessages=Object.freeze({'),context);
  const state=context.testMessages.state;
  state.identity='101';state.selected='202';state.contacts=[{id:'202',name:'Alt'}];
  state.client={channel(){return {on(){return this},subscribe(fn){fn('SUBSCRIBED')},send:async()=> 'ok',httpSend:async(event,payload)=>{sent.push({event,payload});return {success:true}}}},removeChannel:async()=>{}};
  return {context,state,elements,node,sent,stored};
}
test('reading older messages preserves scroll position; near bottom follows messages',()=>{
  const {context,state,elements,node}=setup();
  for(const id of ['gmChatHead','gmThread','gmMessageInput','gmSendButton'])elements.set(id,node());
  const thread=elements.get('gmThread');Object.assign(thread,{scrollHeight:2000,clientHeight:400,scrollTop:200,dataset:{conversation:'dm:202::'}});
  state.history['202']=[{id:'m1',text:'hello',direction:'incoming'}];
  context.testMessages.renderConversation();assert.equal(thread.scrollTop,200);
  thread.scrollTop=1580;context.testMessages.renderConversation();assert.equal(thread.scrollTop,2000);
  assert.match(elements.get('gmChatHead').innerHTML,/gm-presence-dot online/);
});
test('delete for me persists removal without broadcasting a deletion',()=>{
  const {context,state,sent,stored}=setup();state.history['202']=[{id:'m1',text:'hello'}];
  context.GenesisMessages.deleteMessage({closest:()=>({dataset:{messageId:'m1'}})});
  assert.equal(state.history['202'].length,0);assert.equal(sent.length,0);
  assert.match(stored.get('genesisMessagesHistory:101'),/"202":\[\]/);
});
test('direct calls invite one person and hangup releases microphone',async()=>{
  const {context,sent}=setup();await context.GenesisMessages.callContact();
  assert.equal(sent[0].event,'direct-call');assert.equal(sent[0].payload.to,'202');assert.equal(sent[0].payload.action,'invite');
  await context.GenesisMessages.endCall();
  assert.equal(context.stopped,true);assert.equal(sent.at(-1).payload.action,'end');
});
test('incoming call waits for acceptance before requesting a microphone',async()=>{
  const {context,elements}=setup();let requested=false;
  context.navigator.mediaDevices.getUserMedia=async()=>{requested=true;throw new Error('permission denied')};
  context.testMessages.handleDirectCall({payload:{id:'dm-invite',from:'202',to:'101',action:'invite'}});
  assert.equal(requested,false);assert.ok(elements.has('gmCallNotice'));
  await context.GenesisMessages.endCall();assert.equal(requested,false);assert.equal(elements.has('gmCallNotice'),false);
});
test('ending a call while permission is pending stops the late microphone stream',async()=>{
  const {context}=setup();let resolveMedia,stopped=false;
  context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{resolveMedia=resolve});
  const pending=context.GenesisMessages.callContact();
  await new Promise(resolve=>setImmediate(resolve));
  await context.GenesisMessages.endCall();
  resolveMedia({getTracks:()=>[{stop(){stopped=true}}]});
  await pending;assert.equal(stopped,true);
});

test('incoming ringtone plays, can be silenced, and stops on decline',async()=>{
  const {context,elements}=setup();
  let played=0,stopped=0,intervals=0,cleared=0;
  context.AudioContext=class {
    state='running';currentTime=0;destination={};
    createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){played++},stop(){stopped++},disconnect(){}}}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  };
  context.setInterval=()=>{intervals++;return 12};
  context.clearInterval=()=>{cleared++};
  context.testMessages.handleDirectCall({payload:{id:'dm-ring',from:'202',to:'101',action:'invite'}});
  assert.ok(played>=4);
  assert.equal(intervals,1);
  const silence=elements.get('gmCallNotice').children.find(child=>child.textContent==='Silence');
  assert.ok(silence);
  silence.onclick();
  assert.equal(silence.textContent,'Silenced');
  assert.ok(stopped>=played);
  assert.equal(cleared,1);
  await context.GenesisMessages.endCall();
  assert.equal(elements.has('gmCallNotice'),false);
});

test('outgoing ringback stops when the recipient answers',async()=>{
  const {context,sent}=setup();
  let played=0,stopped=0;
  context.AudioContext=class {
    state='running';currentTime=0;destination={};
    createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},start(){played++},stop(){stopped++},disconnect(){}}}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
  };
  await context.GenesisMessages.callContact();
  assert.equal(sent[0].payload.action,'invite');
  assert.ok(played>=2);
  context.testMessages.handleDirectCall({payload:{id:'dm-1234-test',from:'202',to:'101',action:'accept'}});
  assert.ok(stopped>=played);
  await context.GenesisMessages.endCall();
});
