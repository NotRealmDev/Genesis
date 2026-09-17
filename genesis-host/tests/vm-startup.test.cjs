const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../../genesis-vm.js'),'utf8');

function harness({role='admin',expired=false,saved,config={}}={}){
  const nodes=new Map(),icons=[],calls={tabs:0,apps:0,retries:0},events=new Map();
  function node(id=''){
    return {id,style:{},dataset:{},innerHTML:'',textContent:'',offsetWidth:82,offsetHeight:90,
      classList:{hidden:false,add(){this.hidden=true},remove(){this.hidden=false}},
      setAttribute(){},removeAttribute(name){delete this[name]},addEventListener(){},
      querySelector(){return null},appendChild(child){if(child.id)nodes.set(child.id,child);else icons.push(child)}};
  }
  const desktop=node('desktop');desktop.clientWidth=800;desktop.clientHeight=500;
  desktop.querySelector=()=>icons[0]||null;nodes.set('desktop',desktop);
  for(const id of ['genesisVmRoot','genesisVmFrame','genesisVmOverlay','genesisVmCard','genesisVmStatus','genesisVmReconnect'])nodes.set(id,node(id));
  const context={console,URL,Date,Math,Number,JSON,Promise,queueMicrotask,apps:{},openWindows:{},
    location:{href:'https://example.com/Genesis/os.html'},
    GENESIS_VM:{mode:'host',displayMode:'tab',viewerUrl:'https://example.com/desktop',...config},
    localStorage:{getItem(key){return key==='genesisLogin'?JSON.stringify({role,expires:Date.now()+(expired?-60000:3600000)}):key==='realmOsIcon_vm'?saved:null},setItem(){}},
    sessionStorage:{getItem:()=> 'admin'},
    document:{getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>icons,createElement:()=>node(),head:{appendChild(child){nodes.set(child.id,child)}}},
    addEventListener:(name,fn)=>events.set(name,fn),setTimeout(){return 1},clearTimeout(){},
    open(){calls.tabs++;return {closed:false,location:{replace(){}},focus(){}}},
    openApp(){calls.apps++},GenesisHostLoader:{retry(){calls.retries++}}
  };
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {context,nodes,icons,calls,events};
}

test('installing the VM app never opens a window or viewer tab automatically',()=>{
  const h=harness();
  assert.equal(h.icons.length,1);assert.ok(h.context.apps.vm);
  assert.equal(h.calls.apps,0);assert.equal(h.calls.tabs,0);assert.equal(h.calls.retries,0);
});

test('Host mode ignores stale external-tab settings before the Host patch arrives',async()=>{
  const h=harness();h.context.GenesisVM.launch();await h.context.GenesisVM.connect();
  assert.equal(h.calls.tabs,0);assert.equal(h.nodes.get('genesisVmFrame').src,undefined);
  assert.equal(h.nodes.get('genesisVmFrame').style.display,'none');
  assert.match(h.nodes.get('genesisVmStatus').textContent,/Loading Genesis Host/);
  assert.doesNotMatch(h.nodes.get('genesisVmCard').innerHTML,/VM opened|Connected/);
  assert.equal(h.nodes.get('genesisVmOverlay').classList.hidden,false);
});

test('missing config still defaults to Host mode rather than an optimistic tab connection',()=>{
  const h=harness();delete h.context.GENESIS_VM;
  h.context.GenesisVM.launch();assert.equal(h.calls.tabs,0);
  assert.match(h.nodes.get('genesisVmStatus').textContent,/Loading Genesis Host/);
});

test('base VM delegates to the Host module if it arrives before the patch',async()=>{
  const h=harness();let connects=0;
  h.context.GenesisHostVM={connect(force){assert.equal(force,true);connects++}};
  await h.context.GenesisVM.connect(true);
  assert.equal(connects,1);assert.equal(h.calls.tabs,0);
});

test('a missing loader shows a visible error rather than a blank success screen',async()=>{
  const h=harness();delete h.context.GenesisHostLoader;
  await h.context.GenesisVM.connect();
  assert.match(h.nodes.get('genesisVmCard').innerHTML,/Host module is missing/);
  assert.equal(h.nodes.get('genesisVmOverlay').classList.hidden,false);
});

test('expired and non-Admin sessions cannot install or launch VM',()=>{
  for(const options of [{role:'user'},{expired:true}]){
    const h=harness(options);h.context.GenesisVM.launch();
    assert.equal(h.icons.length,0);assert.equal(h.context.apps.vm,undefined);
    assert.equal(h.calls.tabs,0);assert.equal(h.calls.apps,0);
  }
});

test('off-screen saved icon positions are brought back onto the desktop',()=>{
  const h=harness({saved:JSON.stringify({x:9000,y:-500})});
  assert.equal(h.icons[0].style.left,'718px');assert.equal(h.icons[0].style.top,'0px');
  h.nodes.get('desktop').clientWidth=400;h.events.get('resize')();
  assert.equal(h.icons[0].style.left,'318px');
});

test('external viewer navigation is not presented as a verified connection',async()=>{
  const h=harness({config:{mode:'viewer'}});
  h.context.GenesisVM.launch();
  for(let i=0;i<20;i++)await Promise.resolve();
  assert.equal(h.calls.tabs,1);
  assert.match(h.nodes.get('genesisVmStatus').textContent,/connection unverified/);
  assert.doesNotMatch(h.nodes.get('genesisVmStatus').textContent,/Connected/);
});
