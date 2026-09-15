import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const catalogSource=readFileSync(new URL("../games-c-s.js",import.meta.url),"utf8");
const context={};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(catalogSource,context,{filename:"games-c-s.js"});

const {sourceCommit,games}=context.GENESIS_GAME_CATALOG;
const catalogRepository="seanstonator-lang/UGS-Web-Hub";
const eaglerRepository="JessePinkman27/eaglercraft-1.12.2";
const eaglerCommit="d9e759ec21fdb807742201b11de8835e34ccd48a";
const requestHeaders={
  Accept:"application/vnd.github+json",
  "User-Agent":"Genesis-catalog-integrity-test",
  "X-GitHub-Api-Version":"2022-11-28"
};

async function responseOrThrow(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
  if(!response.ok && response.status!==206){
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

async function readPrefix(url,minimumBytes=32){
  const response=await responseOrThrow(url,{headers:{Range:"bytes=0-4095"}});
  const reader=response.body?.getReader();
  if(!reader)throw new Error(`${url} returned no response body`);
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
await Promise.all([...samples.values()].map(async game=>{
  const url=`https://cdn.jsdelivr.net/gh/${catalogRepository}@${sourceCommit}/${game.file}`;
  const prefix=await readPrefix(url,64);
  const text=new TextDecoder().decode(prefix);
  assert.match(text,/<(?:!doctype|html|head|script|style)\b/i,`${game.name} did not return an HTML document`);
}));

await Promise.all(["bootstrap.js","assets.epw"].map(file=>
  readPrefix(`https://cdn.statically.io/gh/${eaglerRepository}/${eaglerCommit}/web/wasm/${file}`,64)
));

console.log(JSON.stringify({
  verifiedCatalogFiles:games.length,
  deliveredCatalogSamples:samples.size,
  verifiedEaglerRuntimeAssets:2,
  sourceCommit
},null,2));
