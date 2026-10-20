import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../genesis-presence.js',import.meta.url),'utf8');

test('two browsers see each other, duplicate tabs deduplicate, disconnect removes users',async()=>{
  const rooms=[];
  const sync=()=>rooms.forEach(r=>r.sync?.());
  function browser(id,name){
    const timers=[],events={},elements=new Map();
    const document={getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',replaceChildren(){},appendChild(){}});return elements.get(id)},createElement(){return {}}};
    const context=vm.createContext({document,console,GENESIS_BACKEND:{url:'test',anonKey:'public'},
      genesisRegisteredDevice:{display_id:id,active:true},
      localStorage:{getItem:key=>key==='genesisLogin'?JSON.stringify({user:name,expires:Date.now()+60000}):null},
      setInterval:fn=>timers.push(fn),addEventListener:(event,fn)=>events[event]=fn,
      supabase:{createClient(){return {
        channel(){const r={on(type,filter,fn){this.sync=fn;return this},subscribe(fn){this.status=fn;fn('SUBSCRIBED');sync()},
          async track(payload){this.payload=payload;sync();return 'ok'},async untrack(){delete this.payload;sync()},
          presenceState(){return Object.fromEntries(rooms.filter(r=>r.payload).map((r,i)=>[i,[r.payload]]))}};rooms.push(r);return r},
        removeChannel(r){rooms.splice(rooms.indexOf(r),1);sync()}
      }}}
    });context.window=context;vm.runInContext(source,context);return {context,events,elements,timers};
  }
  const admin=browser(101,'Admin');const alt=browser(202,'Alt');const tab=browser(202,'Alt');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(admin.context.GenesisPresence.users().length,2);
  assert.equal(admin.context.GenesisPresence.users()[1].name,'Alt');
  assert.deepEqual(Object.keys(rooms[0].payload).sort(),['display_id','name','signed_in']);
  alt.events.pagehide();assert.equal(admin.context.GenesisPresence.users().length,2);
  tab.events.pagehide();assert.equal(admin.context.GenesisPresence.users().length,1);
  rooms[0].status('CHANNEL_ERROR');
  assert.equal(admin.context.GenesisPresence.users().length,0);
  assert.match(admin.elements.get('genesisLiveStatus').textContent,/unavailable/);
  rooms[0].status('SUBSCRIBED');sync();
  assert.equal(admin.context.GenesisPresence.users().length,1);
  admin.context.genesisRegisteredDevice.active=false;
  await new Promise(resolve=>setImmediate(resolve));admin.timers[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(admin.context.GenesisPresence.users().length,0);
});
