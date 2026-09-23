const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {createHostKey,validHostKey,findBrowser,browserArgs,normalizeControlMessage}=require('../lib.cjs');

test('host keys are long, URL-safe, and unique',()=>{
  const keys=new Set();
  for(let i=0;i<100;i++){
    const key=createHostKey();
    assert.equal(validHostKey(key),true);
    assert.match(key,/^[A-Za-z0-9_-]+$/);
    keys.add(key);
  }
  assert.equal(keys.size,100);
});

test('browser finder prefers explicit Genesis browser and detects Chrome/Edge candidates',()=>{
  const env={GENESIS_GFN_BROWSER:'C:\\Custom\\chrome.exe',PROGRAMFILES:'C:\\Program Files','PROGRAMFILES(X86)':'C:\\Program Files (x86)',LOCALAPPDATA:'C:\\Users\\User\\AppData\\Local'};
  const found=findBrowser(env,value=>value===env.GENESIS_GFN_BROWSER);
  assert.equal(found,env.GENESIS_GFN_BROWSER);
  const edge=path.join(env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe');
  assert.equal(findBrowser({...env,GENESIS_GFN_BROWSER:''},value=>value===edge),edge);
});

test('GFN browser args use a persistent profile and fullscreen kiosk',()=>{
  const args=browserArgs('C:\\Genesis\\profile','https://play.geforcenow.com/');
  assert.ok(args.some(value=>value.includes('Genesis\\profile')));
  assert.ok(args.includes('--kiosk'));
  assert.ok(args.includes('--start-fullscreen'));
  assert.equal(args.at(-1),'https://play.geforcenow.com/');
});

test('control message normalization clamps hostile or broken pointer values',()=>{
  const value=normalizeControlMessage({type:'pointer',event:'move',x:50,y:-2,movementX:9999,movementY:-9999,button:9,deltaY:99999,locked:true});
  assert.deepEqual(value,{type:'pointer',event:'move',x:1,y:0,movementX:500,movementY:-500,button:2,deltaY:2400,locked:true});
});

test('control message normalization limits keyboard data',()=>{
  const value=normalizeControlMessage({type:'key',event:'up',code:'KeyW'.repeat(30),key:'w'.repeat(50),repeat:true});
  assert.equal(value.type,'key');
  assert.equal(value.event,'up');
  assert.ok(value.code.length<=40);
  assert.ok(value.key.length<=20);
  assert.equal(value.repeat,true);
});

test('unknown control packets are rejected',()=>{
  assert.equal(normalizeControlMessage({type:'shell',command:'whoami'}),null);
  assert.equal(normalizeControlMessage(null),null);
});

test('VM pairs with Host Key and does not ask for a second Admin authentication',()=>{
  const root=path.resolve(__dirname,'../..');
  const viewer=fs.readFileSync(path.join(root,'genesis-host-vm.js'),'utf8');
  const host=fs.readFileSync(path.join(root,'genesis-host/renderer.js'),'utf8');
  const config=fs.readFileSync(path.join(root,'supabase-config.js'),'utf8');
  assert.match(viewer,/genesisVmHostKey/);
  assert.doesNotMatch(viewer,/adminToken|genesisAdminSession/);
  assert.doesNotMatch(host,/verifyAdmin|admin verification/i);
  assert.doesNotMatch(config,/genesis-admin-auth\.js/);
  assert.match(config,/Host Key/);
});

test('Host mode cannot fall back to the generic blank iframe VM',()=>{
  const root=path.resolve(__dirname,'../..');
  const config=fs.readFileSync(path.join(root,'supabase-config.js'),'utf8');
  assert.match(config,/mode:\s*"host"/);
  assert.match(config,/host-webrtc-r7/);
  assert.match(config,/installHostGuard/);
  assert.match(config,/Never let host mode fall back to the generic iframe VM/);
  assert.match(config,/genesis-host-vm\.js/);
  assert.match(config,/__hostPatched/);
  assert.match(config,/build=/);
});
