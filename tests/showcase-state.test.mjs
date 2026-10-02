import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../genesis-intro-state.js',import.meta.url),'utf8');
function fixture({localFails=false}={}){
  const local=new Map(),session=new Map();
  const storage=(map,fail=false)=>({getItem:key=>{if(fail)throw Error('storage blocked');return map.get(key)||null;},setItem:(key,value)=>{if(fail)throw Error('storage blocked');map.set(key,value);}});
  const context={localStorage:storage(local,localFails),sessionStorage:storage(session)};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {api:context.GenesisIntroState,local,session};
}
test('showcase appears once per account and again when the release changes',()=>{
  const {api,local,session}=fixture();
  assert.equal(api.destination({user:'Realm'}),'intro.html');
  api.complete({user:'Realm'});
  assert.equal(api.destination({user:'REALM'}),'os.html');
  assert.equal(api.destination({user:'Another user'}),'intro.html');
  for(const key of local.keys())local.set(key,'previous-release');
  session.clear();
  assert.equal(api.destination({user:'Realm'}),'intro.html');
});
test('session fallback prevents a redirect loop when persistent writes fail',()=>{
  const {api}=fixture({localFails:true});
  assert.equal(api.shouldShow({user:'Realm'}),true);
  api.complete({user:'Realm'});
  assert.equal(api.shouldShow({user:'Realm'}),false);
});
test('manifest identity, launch, scope, and icons resolve inside a Pages subdirectory',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  const base='https://example.com/Genesis/manifest.webmanifest';
  assert.equal(new URL(manifest.id,base).pathname,'/Genesis/');
  assert.equal(new URL(manifest.start_url,base).pathname,'/Genesis/index.html');
  assert.equal(new URL(manifest.scope,base).pathname,'/Genesis/');
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){
    const png=readFileSync(new URL('../'+icon.src,import.meta.url));
    const [width,height]=icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16),width);
    assert.equal(png.readUInt32BE(20),height);
  }
});
