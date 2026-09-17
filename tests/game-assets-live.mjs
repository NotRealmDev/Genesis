import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const catalogSource=readFileSync(new URL("../games-c-s.js",import.meta.url),"utf8");
const context={URL};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(catalogSource,context,{filename:"games-c-s.js"});

const {sourceCommit,games,installRuntimeFixes}=context.GENESIS_GAME_CATALOG;
const catalogRepository="seanstonator-lang/UGS-Web-Hub";
const eaglerRepository="JessePinkman27/eaglercraft-1.12.2";
const eaglerCommit="d9e759ec21fdb807742201b11de8835e34ccd48a";
const requestHeaders={
  Accept:"application/vnd.github+json",
  "User-Agent":"Genesis-catalog-integrity-test",
  "X-GitHub-Api-Version":"2022-11-28"
};

const amazingSpiderUrl="https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/amazing-strange-rope-police-vice-spider/index.html";
context.location={href:"https://notrealmdev.github.io/Genesis/os.html"};
context.shouldConvertGameSourceToHTML=()=>false;
context.addGameBaseTag=html=>html;
assert.equal(installRuntimeFixes(),true,"Amazing Spider runtime fix did not install");
assert.equal(context.shouldConvertGameSourceToHTML(amazingSpiderUrl),true,"Amazing Spider HTML was not routed through the executable Blob converter");
const enhancedSpiderHTML=context.addGameBaseTag("<html><head><title>old elderly unity game</title></head><body></body></html>",amazingSpiderUrl);
assert.match(enhancedSpiderHTML,/<title>Amazing Strange Rope Police<\/title>/);
assert.match(enhancedSpiderHTML,/id="loading-text"/);

async function responseOrThrow(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(75000)});
  if(!response.ok && response.status!==206){
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

async function readPrefix(url,minimumBytes=32){
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
    try{
      // Some large jsDelivr Brotli assets answer a range request with HTTP 206
      // but an empty body. The second attempt streams a normal GET and cancels
      // after the prefix, matching how the game loader actually downloads it.
      const options=attempt===1?{headers:{Range:"bytes=0-4095"}}:{};
      const response=await responseOrThrow(url,options);
      const reader=response.body?.getReader();
      if(!reader)throw new Error("response had no body");
      let size=0;
      const chunks=[];
      while(size<4096){
        const {done,value}=await reader.read();
        if(done)break;
        chunks.push(value);
        size+=value.byteLength;
      }
      await reader.cancel().catch(()=>{});
      assert.ok(size>=minimumBytes,`${url} returned only ${size} bytes`);
      const joined=new Uint8Array(size);
      let offset=0;
      for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
      return joined;
    }catch(error){
      lastError=error;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,800));
    }
  }
  throw new Error(`${url} failed twice: ${lastError?.message||String(lastError)}`,{cause:lastError});
}

async function mapWithConcurrency(values,limit,task){
  const queue=Array.from(values);
  const workers=Array.from({length:Math.min(limit,queue.length)},async()=>{
    while(queue.length){
      const value=queue.shift();
      await task(value);
    }
  });
  await Promise.all(workers);
}

const treeResponse=await responseOrThrow(
  `https://api.github.com/repos/${catalogRepository}/git/trees/${sourceCommit}?recursive=1`,
  {headers:requestHeaders}
);
const tree=await treeResponse.json();
assert.equal(tree.truncated,false,"The upstream Git tree was truncated");
const upstreamFiles=new Set(tree.tree.filter(entry=>entry.type==="blob").map(entry=>entry.path));
const missing=Array.from(games).filter(game=>!upstreamFiles.has(game.file)).map(game=>game.file);
assert.equal(missing.length,0,`Catalog files missing at the pinned commit: ${missing.join(", ")}`);

const samples=new Map();
for(const game of games)if(!samples.has(game.section))samples.set(game.section,game);
await mapWithConcurrency(samples.values(),4,async game=>{
  const url=`https://cdn.jsdelivr.net/gh/${catalogRepository}@${sourceCommit}/${game.file}`;
  console.log(`Checking ${game.section}: ${game.name}`);
  const prefix=await readPrefix(url,64);
  const text=new TextDecoder().decode(prefix);
  assert.match(text,/<(?:!doctype|html|head|script|style)\b/i,`${game.name} did not return an HTML document`);
});

const survivalRace=games.find(game=>game.id==="ugs-survivalracev2");
assert.ok(survivalRace,"Survival Race v2 is missing from the catalog");
const survivalDocumentUrl=`https://cdn.jsdelivr.net/gh/${catalogRepository}@${sourceCommit}/${survivalRace.file}`;
const survivalDocument=new TextDecoder().decode(await readPrefix(survivalDocumentUrl,256));
assert.match(
  survivalDocument,
  /<base href="https:\/\/cdn\.jsdelivr\.net\/gh\/bubbls\/UGS-Assets@main\/survival%20race%20v2\/">/i,
  "Survival Race does not point to its Unity asset directory"
);

const survivalAssetBase="https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/survival%20race%20v2/";
await mapWithConcurrency([
  "merge.js",
  "Build/yandexBrotli.loader.js",
  "Build/yandexBrotli.data.unityweb",
  "Build/yandexBrotli.framework.js.unityweb",
  "Build/yandexBrotli.wasm.unityweb.part1",
  "Build/yandexBrotli.wasm.unityweb.part2"
],3,async file=>{
  const url=file==="merge.js"
    ? "https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/merge.js"
    : survivalAssetBase+file;
  await readPrefix(url,64);
});

const amazingSpiderBase="https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/amazing-strange-rope-police-vice-spider/";
const amazingSpiderDocument=new TextDecoder().decode(await readPrefix(amazingSpiderBase+"index.html",512));
assert.match(amazingSpiderDocument,/mergeFiles\(/,"Amazing Spider does not merge its split Unity runtime");
assert.match(amazingSpiderDocument,/Build\/spider\.data\.unityweb/,"Amazing Spider data parts are not configured");
await mapWithConcurrency([
  "Build/UnityLoader-v3.js",
  "Build/spider.json",
  "Build/spider.asm.code.unityweb.part1",
  "Build/spider.asm.code.unityweb.part2",
  "Build/spider.asm.memory.unityweb.part1",
  "Build/spider.asm.framework.unityweb.part1",
  "Build/spider.data.unityweb.part1",
  "Build/spider.data.unityweb.part2",
  "Build/spider.data.unityweb.part3",
  "Build/spider.data.unityweb.part4"
],3,file=>readPrefix(amazingSpiderBase+file,64));

await Promise.all(["bootstrap.js","assets.epw"].map(file=>
  readPrefix(`https://cdn.statically.io/gh/${eaglerRepository}/${eaglerCommit}/web/wasm/${file}`,64)
));

console.log(JSON.stringify({
  verifiedCatalogFiles:games.length,
  deliveredCatalogSamples:samples.size,
  verifiedSurvivalRaceAssets:6,
  verifiedAmazingSpiderAssets:10,
  verifiedEaglerRuntimeAssets:2,
  sourceCommit
},null,2));
