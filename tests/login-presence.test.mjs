import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const loginHTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const osHTML = readFileSync(new URL('../os.html', import.meta.url), 'utf8');
const loginScript = [...loginHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).join('\n');
const storage = () => {
  const data = new Map();
  return {getItem:key=>data.get(key) ?? null, setItem:(key,value)=>data.set(key,String(value)), removeItem:key=>data.delete(key)};
};
async function harness(active=true){
  const elements = new Map();
  const intervals = [];
  const calls = [];
  const document = {getElementById(id){
    if(!elements.has(id)) elements.set(id, {value:'', textContent:'', innerHTML:'',
      classList:{add(){},remove(){}}, focus(){}, addEventListener(event,handler){this[event]=handler}});
    return elements.get(id);
  }};
  const context = vm.createContext({document, localStorage:storage(), sessionStorage:storage(),
    crypto:{randomUUID:()=> 'device-token'}, console, location:{href:'',replace(url){this.href=url}},
    setInterval(fn){intervals.push(fn)},
    GENESIS_BACKEND:{url:'https://test.supabase.co',anonKey:'test-publishable-key-long-enough'},
    async fetch(url,options){
      calls.push({url,body:JSON.parse(options.body)});
      return {ok:true,json:async()=>[{display_id:527,active,last_seen:new Date().toISOString()}]};
    }});
  context.window=context;
  vm.runInContext(loginScript,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {context,document,intervals,calls};
}

test('all inline login and OS scripts parse',()=>{
  for(const [name,html] of [['login',loginHTML],['OS',osHTML]]){
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
      if(/type=["'](?:application\/ld\+json|importmap)/.test(match[1])) continue;
      new vm.Script(match[2],{filename:name});
    }
  }
});

test('login registers an ID, renews presence and accepts a valid account',async()=>{
  const {context,document,calls}=await harness();
  assert.equal(document.getElementById('genesisVisitorId').textContent,'ID 527');
  assert.equal(context.localStorage.getItem('genesisDisplayId'),'527');
  await context.genesisHeartbeatDevice();
  assert.equal(calls.filter(c=>c.url.endsWith('/genesis_register_device')).length,2);
  assert.ok(calls.every(c=>c.body.p_token==='device-token'));
  document.getElementById('username').value='High Skys';
  document.getElementById('password').value='Goon';
  await document.getElementById('loginButton').click();
  assert.equal(context.sessionStorage.getItem('realmAuth'),'1');
  assert.equal(context.location.href,'intro.html');
});

test('deactivated IDs still cannot log in',async()=>{
  const {context,document}=await harness(false);
  document.getElementById('username').value='High Skys';
  document.getElementById('password').value='Goon';
  await document.getElementById('loginButton').click();
  assert.equal(context.localStorage.getItem('genesisDeviceBlocked'),'1');
  assert.equal(context.sessionStorage.getItem('realmAuth'),null);
  assert.equal(context.location.href,'');
});

test('history failure preserves online IDs; device failure clears stale counts',async()=>{
  const elements=new Map();
  let failDevices=false;
  const context=vm.createContext({
    Date, genesisRole:()=> 'admin',localStorage:storage(),escapeHTML:String,
    document:{getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}},
    async genesisPublicGet(path){
      if(path.startsWith('genesis_admin_actions')||failDevices)throw new Error('Unavailable');
      return [{display_id:527,active:true,last_seen:new Date().toISOString()}];
    }
  });
  context.window=context;
  vm.runInContext(osHTML.slice(osHTML.indexOf('const GENESIS_DEVICE_ONLINE_WINDOW_MS='),osHTML.indexOf('async function heartbeatGenesisDevice')),context);
  vm.runInContext(osHTML.slice(osHTML.indexOf('async function refreshDeactivateOS()'),osHTML.indexOf('function setupGenesisAdminUI()')),context);
  await context.refreshDeactivateOS();
  assert.equal(elements.get('genesisOnlineIds').textContent,'ID 527');
  assert.match(elements.get('genesisDeviceList').innerHTML,/Online now/);
  assert.match(elements.get('genesisActionHistory').innerHTML,/Could not load history/);
  failDevices=true;
  await context.refreshDeactivateOS();
  assert.equal(elements.get('genesisOnlineIds').textContent,'Unavailable');
  assert.match(elements.get('genesisDeviceList').innerHTML,/Could not load IDs/);
});
