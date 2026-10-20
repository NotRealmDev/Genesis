import assert from "node:assert/strict";
import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,extname,sep} from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const output=resolve(root,"test-output");
await mkdir(output,{recursive:true});
const introState=await readFile(resolve(root,"genesis-intro-state.js"),"utf8");
const version=introState.match(/const version="([^"]+)"/)[1];
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml",".wasm":"application/wasm",".mp3":"audio/mpeg"};

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,"http://localhost");
    if(url.pathname==="/Genesis/__mock-ai"){
      if(req.method!=="POST"){
        res.writeHead(200,{"content-type":"application/json"});
        res.end(JSON.stringify({ok:true}));
        return;
      }
      let body="";
      for await(const chunk of req)body+=chunk;
      const parsed=JSON.parse(body||"{}");
      const text=parsed.messages?.at(-1)?.content||parsed.input?.at(-1)?.content||"";
      res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({choices:[{message:{role:"assistant",content:`Fixture response for: ${text}`}}]}));
      return;
    }
    const path=url.pathname.replace(/^\/Genesis\//,"");
    const file=resolve(root,decodeURIComponent(path)||"index.html");
    if(!file.startsWith(root.endsWith(sep)?root:root+sep))throw Error("Invalid path");
    const data=await readFile(file);
    res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream","content-length":data.length,"cache-control":"no-store"});
    res.end(data);
  }catch{
    res.writeHead(404);res.end("Not found");
  }
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const origin="http://127.0.0.1:"+server.address().port;
const base=origin+"/Genesis/";
const browser=await chromium.launch({headless:true,...(process.env.GENESIS_CHROME_PATH?{executablePath:process.env.GENESIS_CHROME_PATH}:{})});
let page;

async function context({seen=true,user="NativeGPTTest"}={}){
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    return route.abort();
  });
  await ctx.routeWebSocket(/.*/,socket=>socket.close());
  await ctx.addInitScript(({seen,version,user})=>{
    localStorage.setItem("genesisLogin",JSON.stringify({user,role:"user",expires:Date.now()+3600000}));
    if(seen)localStorage.setItem("genesisShowcaseSeen:"+user.toLowerCase(),version);
    localStorage.setItem("genesisMusicVolume","0");
  },{seen,version,user});
  return ctx;
}

try{
  const ctx=await context();
  page=await ctx.newPage();
  await page.goto(base+"os.html",{waitUntil:"load"});
  await page.waitForFunction(()=>window.GenesisAppTour && window.GenesisInstall);
  assert.equal(await page.locator('[data-app="gpt"]').count(),0);
  assert.equal(await page.locator('[data-dock-app="gpt"]').count(),0);
  assert.equal(await page.locator('script[src*="genesis-gpt.js"]').count(),0);
  console.log("PASS GPT hidden from the desktop and dock");

  await page.evaluate(()=>openApp("games"));
  await page.locator('#genesisAppTour').waitFor();
  await page.locator("#genesisAppTour [data-tour-close]").click();
  await page.evaluate(()=>openGame("ugs-doc-cltacostand"));
  await page.waitForFunction(()=>document.getElementById("gameFrame")?.src.startsWith("blob:"),null,{timeout:15000});
  await page.frameLocator("#gameFrame").locator("h1").waitFor();
  assert.match(await page.frameLocator("#gameFrame").locator("h1").innerText(),/Taco Stand/);
  console.log("PASS failed remote game falls back to a playable Genesis Mini version");

  await page.evaluate(async()=>{await GenesisInstall.registerWorker();await navigator.serviceWorker.ready;});
  const registrations=await page.evaluate(async()=>Array.from(await navigator.serviceWorker.getRegistrations(),registration=>({scope:registration.scope,url:registration.active?.scriptURL})));
  assert.equal(registrations.length,1);
  assert.equal(registrations[0].scope,base);
  assert.equal(registrations[0].url,base+"servy.js");
  const cdp=await ctx.newCDPSession(page);
  const manifest=await cdp.send("Page.getAppManifest");
  assert.deepEqual(manifest.errors,[]);
  console.log("PASS one shared service worker and installable manifest");
  await ctx.close();

  const introCtx=await context({seen:false,user:"IntroTest"});
  page=await introCtx.newPage();
  await page.goto(base+"intro-update.html",{waitUntil:"load"});
  assert.equal(await page.locator(".stage").count(),1);
  assert.equal(await page.locator('[data-scene="messages"]').count(),1);
  assert.equal(await page.locator('[data-scene="themes"]').count(),1);
  assert.equal(await page.locator(".logo-wrap").count(),1);
  assert.equal(await page.locator(".icon").getAttribute("src"),"assets/icons/genesis-fall.png");
  assert.equal(await page.locator(".os-only").getAttribute("src"),"assets/icons/genesis-fall-os.png");
  await page.locator("#skipIntro").click();
  await page.waitForURL(base+"os.html");
  assert.equal(await page.evaluate(()=>localStorage.getItem("genesisShowcaseSeen:introtest")),version);
  await page.goto(base+"os.html",{waitUntil:"load"});
  await page.waitForFunction(()=>document.querySelector("#os"));
  assert.equal(await page.locator("#genesisAppTour").count(),0);
  assert.equal(new URL(page.url()).pathname,"/Genesis/os.html");
  await page.goto(base+"intro.html",{waitUntil:"load"});
  assert.equal(await page.locator(".black-fade").count(),1);
  assert.equal(await page.locator("#skipIntro").count(),0);
  await page.keyboard.press("Escape");
  await page.waitForURL(base+"os.html");
  await page.goto(base+"intro-update.html",{waitUntil:"load"});
  await page.waitForURL(base+"intro.html");
  await page.keyboard.press("Escape");
  await page.waitForURL(base+"os.html");
  console.log("PASS one-time upgrade showcase and original intro on future sign-ins");
  await introCtx.close();
}catch(error){
  if(page&&!page.isClosed())await page.screenshot({path:resolve(output,"gpt-install-showcase-failure.png")}).catch(()=>{});
  throw error;
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
