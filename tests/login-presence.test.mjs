import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../genesis-auth.js',import.meta.url),'utf8');
function store(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}}
function setup({identity='user-1',account='user-1',active=true,networkError=false,adminAllowed=false,role='user'}={}){
  const localStorage=store(),sessionStorage=store(),calls=[];
  let displayName='Account';
  const context=vm.createContext({localStorage,sessionStorage,Date,Promise,Error,Object,Array,JSON,AbortSignal,crypto:{randomUUID:()=> 'abcdefab-cdef-4000-8000-000000000000'},
    location:{pathname:'/index.html'},GENESIS_BACKEND:{url:'https://test.supabase.co',anonKey:'publishable',adminEmail:'owner@example.test'},setInterval(){},
    fetch:async(url,options)=>{
      calls.push({url,options});if(networkError)throw Error('Network unavailable');
      let data;
      if(url.endsWith('/genesis_resolve_login'))data=({admin:'admin',lk:'lk',kl:'kl',kb:'kb'})[JSON.parse(options.body).p_username.toLowerCase()]||null;
      else if(url.endsWith('/genesis_set_username')){displayName=JSON.parse(options.body).p_username;data=displayName}
      else if(url.includes('grant_type=password'))data={access_token:'server-token',refresh_token:'refresh',expires_in:3600};
      else if(url.endsWith('/auth/v1/user'))data={id:identity,email:'account@example.test',user_metadata:{display_name:displayName}};
      else if(url.endsWith('/genesis_session_access'))data=[{user_id:account,display_id:527,active,role}];
      else if(url.endsWith('/genesis_security_guard'))data=adminAllowed;
      else data={};
      return {ok:!options.body?.includes('bad-current'),json:async()=>data};
    }});context.window=context;vm.runInContext(source,context);return {context,localStorage,sessionStorage,calls};
}
test('forged local login/admin flags do not create an authenticated session',async()=>{
  const {context,localStorage,sessionStorage,calls}=setup();
  localStorage.setItem('genesisLogin',JSON.stringify({role:'admin',expires:Date.now()+100000}));
  sessionStorage.setItem('realmAuth','1');
  await assert.rejects(context.GenesisAuth.verify(),/Sign in/);
  assert.equal(context.GenesisAuth.user,null);assert.equal(calls.length,0);
});
test('password goes only to Auth and is not retained in browser storage',async()=>{
  const {context,localStorage,sessionStorage,calls}=setup();
  const user=await context.GenesisAuth.signIn('account@example.test','test-only-password');
  assert.equal(user.role,'user');assert.equal(user.displayId,'527');
  assert.equal(calls.filter(c=>c.options.body?.includes('test-only-password')).length,1);
  assert.ok(calls[0].url.includes('/auth/v1/token?grant_type=password'));
  for(const key of ['genesisLogin','genesisVerifiedSessionV1']){
    assert.doesNotMatch(localStorage.getItem(key)||'',/test-only-password/);
    assert.doesNotMatch(sessionStorage.getItem(key)||'',/test-only-password/);
  }
});
test('the existing Admin username maps to its server account without a client password check',async()=>{
  const {context,calls}=setup();
  context.GENESIS_BACKEND.adminEmail='owner@example.test';
  await context.GenesisAuth.signIn(' Admin ','test-only-password');
  assert.equal(JSON.parse(calls.find(c=>c.url.includes('grant_type=password')).options.body).email,'owner@example.test');
});
test('LK, KL and KB resolve through the server; removed High Skys cannot log in',async()=>{
  for(const name of ['LK','KL','KB']){
    const {context,calls}=setup();
    await context.GenesisAuth.signIn(' '+name+' ','fixture-only-password');
    const request=JSON.parse(calls.find(c=>c.url.includes('grant_type=password')).options.body);
    assert.equal(request.email,name.toLowerCase()+'@accounts.genesisoss.lol');
    assert.equal(request.password,'fixture-only-password');
    assert.equal(context.GenesisAuth.user.role,'user');
  }
  const {context,calls}=setup();
  await assert.rejects(context.GenesisAuth.signIn('High Skys','fixture-only-password'),/Incorrect/);
  assert.equal(calls.length,1);
});

test('visitor ID is stable and does not replace the verified account ID',()=>{
  const {context,localStorage,calls}=setup();localStorage.setItem('genesisDisplayId','527');
  assert.equal(context.GenesisAuth.visitorId(),context.GenesisAuth.visitorId());
  assert.equal(localStorage.getItem('genesisDisplayId'),'527');assert.equal(calls.length,0);
});
test('username and password changes retain the account ID and never store passwords',async()=>{
  const {context,localStorage,sessionStorage,calls}=setup();
  await context.GenesisAuth.signIn('LK','fixture-old-password');
  await context.GenesisAuth.changeUsername('New Name');
  assert.equal(context.GenesisAuth.user.name,'New Name');assert.equal(context.GenesisAuth.user.displayId,'527');
  await assert.rejects(context.GenesisAuth.changePassword('bad-current','fixture-new-password'),/current password/);
  assert.ok(calls.every(c=>c.options.method!=='PUT'));
  await context.GenesisAuth.changePassword('fixture-old-password','fixture-new-password');
  assert.equal(calls.find(c=>c.options.method==='PUT').url,'https://test.supabase.co/auth/v1/user');
  assert.equal(context.GenesisAuth.user.displayId,'527');
  for(const storage of [localStorage,sessionStorage])for(const key of ['genesisLogin','genesisVerifiedSessionV1'])assert.doesNotMatch(storage.getItem(key)||'',/fixture-(old|new)-password/);
});
test('a concurrent-session conflict clears the login and asks for reauthentication',async()=>{
  const {context,sessionStorage}=setup({role:'conflict'});
  await assert.rejects(context.GenesisAuth.signIn('LK','fixture-only-password'),/Both were signed out/);
  assert.equal(context.GenesisAuth.user,null);assert.equal(sessionStorage.getItem('genesisVerifiedSessionV1'),null);
});
test('missing approval, mismatched identity and network failure all deny sign-in',async()=>{
  for(const options of [{active:false},{account:'someone-else'},{networkError:true}]){
    const {context}=setup(options);
    await assert.rejects(context.GenesisAuth.signIn('account@example.test','test-only-password'));
    assert.equal(context.GenesisAuth.user,null);
  }
});
test('failed sign-in never reports tampering or requests account suspension',async()=>{
  const {context,calls}=setup({active:false});
  await assert.rejects(context.GenesisAuth.signIn('account@example.test','test-only-password'));
  assert.ok(calls.every(c=>!c.url.includes('genesis_security_guard')));
});
test('admin guard denial clears the local verified session',async()=>{
  const {context,sessionStorage,calls}=setup();
  await context.GenesisAuth.signIn('account@example.test','test-only-password');
  await assert.rejects(context.GenesisAuth.adminToken(),/suspended/);
  assert.equal(sessionStorage.getItem('genesisVerifiedSessionV1'),null);
  assert.ok(calls.some(c=>c.url.includes('genesis_security_guard')));
});
test('entrypoint scripts parse and the login no longer ships password verifiers',()=>{
  for(const path of ['index.html','os.html','intro.html','browser-tab.html']){
    const html=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.match(html,/genesis-auth.js/);
    for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
      if(/type=["'](?:application\/ld\+json|importmap|module)/.test(m[1]))continue;
      new vm.Script(m[2],{filename:path});
    }
    if(path==='index.html')assert.doesNotMatch(html,/passwordHash|const accounts|genesisSha256|password ===/);
  }
});
