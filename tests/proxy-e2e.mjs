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

  await page.evaluate(()=>window.proxyHarness.go("https://www.youtube.com/results?search_query=lofi"));
  try{
    await youtubeHasContent();
  }catch(firstError){
    await page.evaluate(()=>window.proxyHarness.repairAndGo("https://www.youtube.com/results?search_query=lofi"));
    await youtubeHasContent();
  }

  const report=await page.evaluate(()=>window.proxyHarness.report());
  assert.ok(report.diagnostics.healthy);
  console.log(JSON.stringify({health,diagnostics:report.diagnostics}));
}catch(error){
  await mkdir(join(root,"test-output"),{recursive:true});
  await page.screenshot({path:join(root,"test-output","proxy-failure.png"),fullPage:true}).catch(()=>{});
  const report=await page.evaluate(()=>window.proxyHarness?.report?.()).catch(()=>null);
  console.error(JSON.stringify({error:error.message,report,logs:logs.slice(-80)},null,2));
  throw error;
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
