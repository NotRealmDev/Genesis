import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const prismSource=readFileSync(new URL("../genesis-prism.js",import.meta.url),"utf8");
const browserTab=readFileSync(new URL("../browser-tab.html",import.meta.url),"utf8");
const os=readFileSync(new URL("../os.html",import.meta.url),"utf8");
const serviceWorker=readFileSync(new URL("../servy.js",import.meta.url),"utf8");
const prismApi=readFileSync(new URL("../prism.api.js",import.meta.url),"utf8");
const gameCatalogSource=readFileSync(new URL("../games-c-s.js",import.meta.url),"utf8");
const eaglercraft=readFileSync(new URL("../eaglercraft.html",import.meta.url),"utf8");

function loadPrismShell(){
  const store=new Map();
  const context={
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Blob,
    ArrayBuffer,
    Uint8Array,
    setTimeout,
    clearTimeout,
    performance,
    CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}},
    location:{
      href:"https://genesis.example/genesis-prism.js",
      protocol:"https:",
      host:"genesis.example",
      hostname:"genesis.example",
      pathname:"/os.html",
      origin:"https://genesis.example"
    },
    navigator:{online:true,serviceWorker:{controller:null,addEventListener(){}}},
    localStorage:{
      getItem(key){return store.has(key)?store.get(key):null},
      setItem(key,value){store.set(key,String(value))},
      removeItem(key){store.delete(key)}
    },
    document:{
      currentScript:{src:"https://genesis.example/genesis-prism.js"},
      addEventListener(){},
      querySelectorAll(){return[]}
    },
    addEventListener(){},
    dispatchEvent(){}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(prismSource,context,{filename:"genesis-prism.js"});
  return context;
}

test("Genesis uses Scramjet's native URL codec exactly",()=>{
  const context=loadPrismShell();
  const input="https://www.youtube.com/results?search_query=café & live=1#résumé";
  assert.equal(context.GenesisPrism.codec.encode(input),encodeURIComponent(input));
  assert.equal(context.GenesisPrism.codec.decode(encodeURIComponent(input)),input);
  assert.doesNotMatch(prismSource,/const KEY\s*=|TextEncoder\(\)\.encode\(value\)|btoa\(out\)/);
  assert.doesNotThrow(()=>new vm.Script("("+context.GenesisPrism.codec.encode.toString()+")"));
  assert.doesNotThrow(()=>new vm.Script("("+context.GenesisPrism.codec.decode.toString()+")"));
});

test("all ordinary addresses use the Scramjet + Wisp route",()=>{
  const context=loadPrismShell();
  for(const url of [
    "https://www.youtube.com/",
    "https://www.tiktok.com/",
    "https://play.geforcenow.com/",
    "https://example.com/"
  ]){
    const route=context.getCompatibilityRoute(url);
    assert.equal(route.kind,"proxy",url);
    assert.equal(route.transport,"wisp",url);
  }
  assert.match(context.browserSearchURL("browser test"),/^https:\/\/search\.brave\.com\/search\?q=/);
  assert.match(os,/loads every website through the same <b>Scramjet \+ Wisp<\/b> browser/);
});

test("transport keeps one Wisp route for signed media and retries safely",()=>{
  assert.match(prismSource,/new this\.Transport\(\{wisp:websocket\}\)/);
  assert.match(prismSource,/class ResilientWispTransport/);
  assert.match(prismSource,/mayReplayRequest/);
  assert.match(prismSource,/route:"same-wisp"/);
  assert.match(prismSource,/routePolicy:"stable-session"/);
  assert.match(prismSource,/midSessionFailover:false/);
  assert.match(prismSource,/youtubeMediaPartialResponses/);
  assert.match(prismSource,/youtubeMediaInvalidPartialResponses/);
  assert.match(prismSource,/YOUTUBE_MEDIA_CHUNK_BYTES\s*=\s*8 \* 1024 \* 1024/);
  assert.match(prismSource,/function normalizeYouTubeMediaRequest\(/);
  assert.match(prismSource,/function isYouTubePlaybackRequest\(/);
  assert.match(prismSource,/if\(!isYouTubePlaybackRequest\(remote\)/);
  assert.match(prismSource,/headers:setRawHeader\(headers,"Range",appliedRange\)/);
  assert.match(prismSource,/rawHeaderValue\(response\?\.headers,"content-range"\)/);
  assert.doesNotMatch(prismSource,/async switchEndpoint\(/);
  assert.doesNotMatch(prismSource,/Number\(status\)===403/);
  assert.match(prismSource,/healthCheck/);
  assert.doesNotMatch(prismSource,/connections:\s*\[/);
});

test("YouTube watch pages have an in-Genesis official player fallback",()=>{
  const context=loadPrismShell();
  const watch="https://www.youtube.com/watch?v=jNQXAC9IVRw&t=12s";
  assert.equal(context.GenesisPrism.youtubeVideoId(watch),"jNQXAC9IVRw");
  const fallbacks=Array.from(context.GenesisPrism.youtubeEmbedFallbacks(watch));
  assert.equal(fallbacks.length,2);
  assert.match(fallbacks[0],/^https:\/\/www\.youtube-nocookie\.com\/embed\/jNQXAC9IVRw\?/);
  assert.match(fallbacks[0],/[?&]start=12(?:&|$)/);
  assert.match(fallbacks[1],/^https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw\?/);
  assert.equal(context.GenesisPrism.youtubeEmbedFallback("https://www.youtube.com/results?search_query=test"),"");
  assert.match(browserTab,/id="officialFrame"/);
  assert.match(browserTab,/function scheduleYouTubeFallback\(/);
  assert.match(browserTab,/function showYouTubeFallback\(/);
  assert.doesNotMatch(browserTab,/playable:!!video&&\(video\.readyState>=2\|\|!!\(video\.currentSrc/);
  assert.match(os,/id="browserOfficialFrame"/);
  assert.match(os,/function scheduleYouTubePlayerFallback\(/);
  assert.doesNotMatch(os,/playable:!!video&&\(video\.readyState>=2\|\|!!\(video\.currentSrc/);
});

test("complete C through S game catalog is present and uniquely addressable",()=>{
  const context={};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(gameCatalogSource,context,{filename:"games-c-s.js"});
  const catalog=context.GENESIS_GAME_CATALOG;
  assert.equal(catalog.sourceCommit,"6f043306b7ae6dc9de5dd6c06b0574952cb2e88e");
  assert.equal(catalog.games.length,1338);
  const counts={};
  const ids=new Set();
  for(const game of catalog.games){
    counts[game.section]=(counts[game.section]||0)+1;
    assert.match(game.section,/^[C-S]$/);
    assert.match(game.file,/^games\/.+\.html$/i);
    assert.ok(!ids.has(game.id),"duplicate game id: "+game.id);
    ids.add(game.id);
  }
  assert.deepEqual(counts,{C:108,D:105,E:39,F:142,G:69,H:53,I:22,J:20,K:25,L:29,M:140,N:43,O:19,P:189,Q:6,R:82,S:247});
  assert.match(os,/GENESIS_GAME_CATALOG\?\.games/);
  assert.match(os,/Eaglercraft 1\.12\.2/);
  assert.match(eaglercraft,/worldsDB:"worlds"/);
  assert.match(eaglercraft,/web\/wasm\/bootstrap\.js/);
  assert.match(eaglercraft,/assets\.epw/);
  assert.match(eaglercraft,/<div id="game_frame"/);
  assert.match(eaglercraft,/Back to Genesis/);
});

test("dashboard welcome fireworks run for fifteen seconds",()=>{
  assert.match(os,/id="welcomeFireworks"/);
  assert.match(os,/function startWelcomeFireworks\(/);
  assert.match(os,/const ends=started\+15000/);
  assert.match(os,/requestAnimationFrame\(frame\)/);
  assert.match(os,/launchGenesisAboutBlank/);
});

test("dedicated Genesis tab detects dynamic placeholder stalls",()=>{
  assert.match(browserTab,/function armDynamicReadiness/);
  assert.match(browserTab,/function dynamicSiteReady/);
  assert.match(browserTab,/shell stalled · repairing data requests/);
  assert.match(browserTab,/Back to Genesis/);
  assert.match(browserTab,/history\.replaceState\(null,"",location\.pathname\+location\.search\)/);
});

test("service worker never duplicates media streams or escalates segment failures",()=>{
  assert.match(serviceWorker,/Genesis RPC timed out/);
  assert.match(serviceWorker,/function isMediaRequest\(request\)/);
  assert.match(serviceWorker,/isMediaRequest\(event\.request\)\) throw firstErr/);
  assert.match(serviceWorker,/function shouldEscalateFailure\(request\)/);
  assert.match(serviceWorker,/if\(shouldEscalateFailure\(event\.request\)\)/);
  assert.match(serviceWorker,/status:502/);
});

test("About Blank launchers retain Genesis controls and media permissions",()=>{
  for(const source of [browserTab,os]){
    assert.match(source,/window\.open\("about:blank","_blank"\)/);
    assert.match(source,/fullscreen; autoplay; encrypted-media; picture-in-picture/);
  }
  assert.match(browserTab,/Back to Genesis/);
  assert.match(browserTab,/id="aboutBlank"/);
  assert.match(os,/id="browserAboutBlank"/);
});

test("browser sessions persist cookies, origin storage, and the last open page",()=>{
  assert.match(prismApi,/indexedDB\.open\('__scramjet_controller'/);
  assert.match(prismApi,/async persistCookies\(\)/);
  assert.match(prismSource,/async persistSession\(\)/);
  assert.match(prismSource,/sessionPersistence:"indexeddb-cookies-and-origin-storage"/);
  assert.match(browserTab,/genesisBrowserLastTarget/);
  assert.match(browserTab,/function syncTarget\(\)/);
  assert.match(os,/genesisBrowserStateV2/);
  assert.match(os,/restoreOnStartup:savedBrowserState\.open/);
  assert.match(os,/if\(browserState\.restoreOnStartup\)setTimeout\(\(\)=>openApp\("browser"\),80\)/);
});

test("browser HTML inline scripts compile",()=>{
  for(const [name,html] of [["browser-tab.html",browserTab],["os.html",os]]){
    const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length>0,name+" has inline scripts");
    for(const [,attributes,code] of scripts){
      if(/\bsrc\s*=/i.test(attributes) || /application\/(?:ld\+)?json/i.test(attributes)) continue;
      assert.doesNotThrow(()=>new vm.Script(code,{filename:name}),name+" contains invalid inline JavaScript");
    }
  }
});


test("frame recovery clears an old encoded route before rebuilding",()=>{
  assert.match(prismSource,/async resetFrameElement\(element\)/);
  assert.match(prismSource,/element\.src="about:blank"/);
  assert.match(prismSource,/await this\.resetFrameElement\(element\);[\s\S]*?await this\.recover\(reason,options\)/);
});


test("default transport has the current official-demo Wisp plus failover",()=>{
  assert.match(prismSource,/DEFAULT_WISP_URLS\s*=\s*\[[\s\S]*?"wss:\/\/anura\.pro\/"[\s\S]*?"wss:\/\/wisp\.mercurywork\.shop\/"/);
});
