import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const mime={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8",
  ".wasm":"application/wasm",
  ".png":"image/png"
};

const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    const candidate=normalize(join(root,pathname===" /"?"tests/proxy-harness.html":pathname));
    if(!candidate.startsWith(root)){res.writeHead(403);res.end();return}
    const file=await readFile(candidate);
    res.writeHead(200,{"content-type":mime[extname(candidate)]||"application/octet-stream","cache-control":"no-store"});
    if(req.method==="HEAD")res.end();else res.end(file);
  }catch{
    res.writeHead(404);res.end("not found");
  }
});
await new Promise(resolve=>server.listen(4173,"127.0.0.1",resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const logs=[];
page.on("console",message=>logs.push(message.type()+": "+message.text()));
page.on("pageerror",error=>logs.push("pageerror: "+error.message));

async function youtubeHasContent(){
  return page.waitForFunction(()=>{
    const doc=document.getElementById("target")?.contentDocument;
    if(!doc)return false;
    const selectors='a#video-title,ytd-video-renderer #video-title,yt-lockup-view-model h3,yt-lockup-view-model a[href*="/watch"]';
    return [...doc.querySelectorAll(selectors)].some(node=>(node.textContent||"").trim().length>1);
  },null,{timeout:90000});
}

async function waitForTikTokContent(){
  return page.waitForFunction(()=>{
    const frame=document.getElementById("target");
    const doc=frame?.contentDocument;
    const win=frame?.contentWindow;
    if(!doc || typeof win?.$scramjet$prop==="undefined") return false;
    const videoLinks=doc.querySelectorAll('a[href*="/video/"],[scramjet-attr-href*="/video/"]');
    const playable=[...doc.querySelectorAll("video")].some(video=>video.currentSrc||video.src);
    return videoLinks.length>=2 || playable;
  },null,{timeout:90000});
}

async function waitForGeforceContent(){
  return page.waitForFunction(()=>{
    const frame=document.getElementById("target");
    const doc=frame?.contentDocument;
    const win=frame?.contentWindow;
    if(!doc || typeof win?.$scramjet$prop==="undefined") return false;
    const text=(doc.body?.innerText||"").replace(/\s+/g," ").trim();
    return text.length>80 && /geforce\s*now|log\s*in|sign\s*in|join|games/i.test(text);
  },null,{timeout:90000});
}

async function navigateWithRepair(url,ready){
  await page.evaluate(target=>window.proxyHarness.go(target),url);
  try{
    await ready();
  }catch(firstError){
    await page.evaluate(target=>window.proxyHarness.repairAndGo(target),url);
    await ready();
  }
}

async function frameSnapshot(){
  return page.evaluate(()=>{
    const frame=document.getElementById("target");
    try{
      const win=frame?.contentWindow;
      const doc=frame?.contentDocument;
      return {
        src:frame?.getAttribute("src")||"",
        href:win?.location?.href||"",
        readyState:doc?.readyState||"",
        title:doc?.title||"",
        bodyText:(doc?.body?.innerText||"").slice(0,3000),
        html:(doc?.documentElement?.outerHTML||"").slice(0,12000),
        scripts:[...(doc?.scripts||[])].slice(0,25).map(script=>script.src||"[inline]"),
        globals:{
          scramjet:typeof win?.$scramjet,
          controller:typeof win?.$scramjetController,
          prop:typeof win?.$scramjet$prop,
          tryset:typeof win?.$scramjet$tryset,
          rewrite:typeof win?.$scramjet$rewrite
        }
      };
    }catch(error){
      return {error:error?.message||String(error),src:frame?.getAttribute("src")||""};
    }
  });
}

try{
  await page.goto("http://127.0.0.1:4173/tests/proxy-harness.html",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>window.proxyHarnessLoaded===true,null,{timeout:30000});

  const health=await page.evaluate(()=>window.proxyHarness.start());
  assert.equal(health.ok,true);
  assert.ok(health.status>=200&&health.status<500);

  await page.evaluate(()=>window.proxyHarness.go("https://example.com/"));
  await page.waitForFunction(()=>{
    const text=document.getElementById("target")?.contentDocument?.body?.innerText||"";
    return text.includes("Example Domain");
  },null,{timeout:60000});

  const exampleSnapshot=await frameSnapshot();
  assert.equal(exampleSnapshot.globals.scramjet,"object","Scramjet core was not injected into the proxied document");
  assert.notEqual(exampleSnapshot.globals.prop,"undefined","Scramjet property hooks were not installed");

  await navigateWithRepair("https://www.youtube.com/results?search_query=lofi",youtubeHasContent);
  const youtube=await frameSnapshot();
  assert.match(youtube.title,/YouTube/i);

  await navigateWithRepair("https://www.tiktok.com/explore",waitForTikTokContent);
  const tiktok=await frameSnapshot();
  assert.match(tiktok.href,/tiktok\.com/i);

  await navigateWithRepair("https://play.geforcenow.com/mall/",waitForGeforceContent);
  const geforceNow=await frameSnapshot();
  assert.match(geforceNow.href,/geforcenow\.com/i);

  const report=await page.evaluate(()=>window.proxyHarness.report());
  assert.ok(report.diagnostics.healthy);
  console.log(JSON.stringify({
    health,
    diagnostics:report.diagnostics,
    sites:{
      youtube:{title:youtube.title,bodyText:youtube.bodyText.slice(0,600)},
      tiktok:{title:tiktok.title,bodyText:tiktok.bodyText.slice(0,600)},
      geforceNow:{title:geforceNow.title,bodyText:geforceNow.bodyText.slice(0,600)}
    }
  }));
}catch(error){
  await mkdir(join(root,"test-output"),{recursive:true});
  await page.screenshot({path:join(root,"test-output","proxy-failure.png"),fullPage:true}).catch(()=>{});
  const report=await page.evaluate(()=>window.proxyHarness?.report?.()).catch(()=>null);
  const frame=await frameSnapshot().catch(()=>null);
  console.error(JSON.stringify({error:error.message,report,frame,logs:logs.slice(-160)},null,2));
  throw error;
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
