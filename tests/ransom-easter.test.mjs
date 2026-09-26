import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=path=>readFileSync(join(root,path),"utf8");
const config=read("supabase-config.js");
const egg=read("genesis-ransom-easter.js");
const ui=read("genesis-ui-polish.js");
const overhaul=read("genesis-overhaul.js");

function memoryStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    snapshot:()=>Object.fromEntries(values)
  };
}

function loadRansom({username="ransom",password="ransom",session={}}={}){
  const listeners=[];
  const doc={
    readyState:"complete",
    documentElement:{classList:{add(){},remove(){}}},
    head:{appendChild(){}},
    createElement:()=>({textContent:""}),
    addEventListener:(...args)=>listeners.push(args),
    getElementById:id=>id==="username"?{value:username}:id==="password"?{value:password}:null
  };
  const scope={
    document:doc,window:null,globalThis:null,location:{pathname:"/index.html",search:"",href:"https://genesis.example/index.html"},
    localStorage:memoryStorage(),sessionStorage:memoryStorage(session),URL,URLSearchParams,
    setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,console
  };
  scope.window=scope;scope.globalThis=scope;
  vm.runInNewContext(egg,scope,{filename:"genesis-ransom-easter.js"});
  return {api:scope.GenesisRansomEaster,scope,listeners};
}

function loadUi({authenticated=false,ransomEvent=false,ransomSession=false,user="alice"}={}){
  const session=memoryStorage(authenticated?{"realmAuth":"1",...(ransomSession?{"genesisRansomSession":"1"}:{})}:{});
  const local=memoryStorage(authenticated?{"genesisLogin":JSON.stringify({user,role:"user",expires:Date.now()+60_000})}:{});
  const handlers=new Map();
  const classNames=new Set();
  const audio={paused:true,playCount:0,pauseCount:0,loop:false,preload:"",async play(){this.playCount++;this.paused=false},pause(){this.pauseCount++;this.paused=true}};
  const location={pathname:"/os.html",search:ransomEvent?"?ransomEvent=1":""};
  const document={
    documentElement:{classList:{contains:name=>classNames.has(name),add:name=>classNames.add(name),remove:name=>classNames.delete(name)}},
    head:{appendChild(){}},
    addEventListener:(name,fn)=>{const list=handlers.get(name)||[];list.push(fn);handlers.set(name,list)},
    removeEventListener:(name,fn)=>handlers.set(name,(handlers.get(name)||[]).filter(item=>item!==fn)),
    createElement:()=>({textContent:""}),
    getElementById:id=>id==="genesisRansomOSEvent"?null:null,
    querySelector:()=>null
  };
  const scope={
    window:null,globalThis:null,document,location,URLSearchParams,Date,Math,performance:{now:()=>1},
    sessionStorage:session,localStorage:local,genesisGetMusicAudio:()=>audio,console
  };
  scope.window=scope;scope.globalThis=scope;
  vm.runInNewContext(ui,scope,{filename:"genesis-ui-polish.js"});
  return {ui:scope.GenesisUI,scope,session,local,audio,handlers,classNames,location};
}

function loadOverhaul({unlocked=false}={}){
  const bodyClasses=new Set();
  const local=memoryStorage();
  const session=memoryStorage(unlocked?{"genesisRansomGlitchUnlocked":"1"}:{});
  const doc={
    documentElement:{dataset:{},style:{setProperty(){}}},
    body:{classList:{toggle:(name,on)=>on?bodyClasses.add(name):bodyClasses.delete(name)}},
    head:{appendChild(){}},
    createElement:()=>({textContent:""}),
    getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null
  };
  const scope={window:null,globalThis:null,document:doc,location:{pathname:"/os.html"},localStorage:local,sessionStorage:session,URLSearchParams,CustomEvent:class{},setInterval:()=>1,clearInterval(){},setTimeout:()=>1};
  scope.window=scope;scope.globalThis=scope;
  vm.runInNewContext(overhaul,scope,{filename:"genesis-overhaul.js"});
  return {api:scope.GenesisOverhaul,scope,local,session,bodyClasses};
}

test("RANSOM and UI scripts load on the intended pages with refreshed cache keys",()=>{
  assert.match(config,/genesis-ransom-easter\.js\?build=ransom-event-r3/);
  assert.match(config,/const isLogin=/);
  assert.match(config,/const isOS=/);
  assert.match(config,/isLogin\|\|isOS/);
  assert.match(config,/genesis-ui-polish\.js\?build=ui-polish-r2/);
});

test("RANSOM credentials open the safe local Tape Zero intro",()=>{
  const {api}=loadRansom();
  assert.equal(api.credentialsMatch(),true);
  assert.match(egg,/SAFE GAME SIMULATION/);
  assert.match(egg,/does not read, change, or encrypt your files/);
  assert.match(egg,/TAPE ZERO/);
  assert.match(egg,/location\.replace\(next\.pathname\+next\.search\+next\.hash\)/);
  assert.match(egg,/stopImmediatePropagation/);
  assert.doesNotMatch(egg,/youtube\.com|youtu\.be|fetch\s*\(/i);
});

test("a normal login clears the RANSOM music-suppression marker",()=>{
  const {scope,listeners}=loadRansom({username:"alice",password:"safe-pass",session:{genesisRansomSession:"1"}});
  const click=listeners.find(([name])=>name==="click")?.[1];
  assert.equal(typeof click,"function");
  click({target:{closest:selector=>selector==="#loginButton"?{}:null}});
  assert.equal(scope.sessionStorage.getItem("genesisRansomSession"),null);
});

test("RANSOM uses the local assets and the exact 63-second five-coin hunt",()=>{
  const {api}=loadRansom();
  const {ASSETS,GAME_DURATION_MS,COIN_VALUE,COIN_COUNT,TARGET_COINS,RESULT_DISPLAY_MS}=api.__test;
  assert.equal(GAME_DURATION_MS,63_000);
  assert.equal(COIN_VALUE,100);
  assert.equal(COIN_COUNT,5);
  assert.equal(TARGET_COINS,500);
  assert.ok(RESULT_DISPLAY_MS>=4_000,"Thank You audio gets time to play before logout");
  assert.equal(Object.keys(ASSETS).length,13);
  for(const asset of Object.values(ASSETS))assert.ok(existsSync(join(root,asset)),`missing local asset ${asset}`);
  assert.equal(api.__test.formatTime(63_000),"01:03");
  assert.equal(api.__test.formatTime(1),"00:01");
  assert.match(egg,/assets\/ransom\/encrypted\.mp3/);
  assert.match(egg,/assets\/ransom\/coins\.mp3/);
  assert.match(egg,/assets\/ransom\/thank-you\.mp3/);
  assert.match(egg,/assets\/ransom\/jumpscare\.mp4/);
});

test("RANSOM session keeps the original OS menu track paused until a normal login",async()=>{
  const env=loadUi({authenticated:false});
  await env.ui.startMusic();
  assert.equal(env.audio.playCount,0);

  env.session.setItem("realmAuth","1");
  env.local.setItem("genesisLogin",JSON.stringify({user:"alice",expires:Date.now()+60_000}));
  assert.equal(await env.ui.startMusic(),true);
  assert.equal(env.audio.playCount,1);
  const pausesBeforeRansom=env.audio.pauseCount;
  env.session.setItem("genesisRansomSession","1");
  assert.equal(await env.ui.startMusic(),false);
  assert.equal(env.audio.paused,true);
  assert.equal(env.audio.pauseCount,pausesBeforeRansom+1);
  env.session.removeItem("genesisRansomSession");
  assert.equal(await env.ui.startMusic(),true);
  assert.equal(env.audio.playCount,2);

  const account=loadUi({authenticated:true,user:"RANSOM"});
  assert.equal(await account.ui.startMusic(),true);

  const ransom=loadUi({authenticated:true,ransomEvent:true,user:"RANSOM"});
  await ransom.ui.startMusic();
  assert.equal(ransom.audio.playCount,0);
  ransom.location.search="";
  ransom.session.setItem("genesisRansomSession","1");
  assert.equal(await ransom.ui.startMusic(),false);
  assert.equal(ransom.audio.playCount,0);

  ransom.session.removeItem("genesisRansomSession");
  ransom.local.setItem("genesisLogin",JSON.stringify({user:"alice",expires:Date.now()+60_000}));
  assert.equal(await ransom.ui.startMusic(),true);
  assert.equal(ransom.audio.playCount,1);
});

test("RANSOM theme track remains independent from the paused OS menu track",()=>{
  const {api}=loadRansom();
  assert.equal(api.__test.ASSETS.encrypted,"assets/ransom/encrypted.mp3");
  assert.match(egg,/state\.music=createAudio\("encrypted",true,0\.66\)/);
  assert.match(ui,/genesisGetMusicAudio\(\)\.pause\(\)/);
  assert.match(ui,/canPlayMenuMusic/);
});

test("Glitch is a session-unlocked Store tab; normal themes remain available",()=>{
  const locked=loadOverhaul();
  assert.match(locked.api.storeHTML(),/Normal/);
  assert.match(locked.api.storeHTML(),/Glitch/);
  locked.api.chooseStoreTab("glitch");
  assert.match(locked.api.storeHTML(),/Complete the RANSOM coin hunt to unlock this theme/);
  assert.doesNotMatch(locked.api.storeHTML(),/data-theme-choice="glitch"/);
  assert.equal(locked.api.chooseTheme("glitch"),"sunset");

  const unlocked=loadOverhaul({unlocked:true});
  unlocked.api.chooseStoreTab("glitch");
  assert.match(unlocked.api.storeHTML(),/data-theme-choice="glitch"/);
  assert.equal(unlocked.api.chooseTheme("glitch"),"glitch");
  assert.equal(unlocked.api.currentTheme(),"glitch");
  assert.notEqual(unlocked.local.getItem("genesisTheme"),"glitch");
  assert.equal(unlocked.session.getItem("genesisRansomGlitchTheme"),"1");
  assert.match(unlocked.api.storeHTML(),/UNLOCKED/);
});

test("RANSOM has safe stop paths and no file-system or encryption behavior",()=>{
  assert.match(egg,/Escape/);
  assert.match(egg,/data-ransom-stop/);
  assert.match(egg,/function stopEvent\(\)/);
  assert.doesNotMatch(egg,/FileSystemHandle|showDirectoryPicker|showSaveFilePicker|indexedDB\.deleteDatabase/);
  assert.doesNotMatch(egg,/crypto\.subtle\.encrypt|rmSync|unlinkSync|writeFileSync|XMLHttpRequest|fetch\s*\(/i);
});
