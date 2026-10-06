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
  await page.waitForFunction(()=>window.GenesisGPT&&window.GenesisAppTour&&window.GenesisInstall);

  await page.evaluate(()=>openApp("gpt"));
  await page.locator('.window[data-app="gpt"]').waitFor();
  await page.locator("#genesisAppTour").waitFor();
  assert.match(await page.locator("#genesisAppTour").innerText(),/GPT/);
  await page.locator("#genesisAppTour [data-tour-close]").click();
  assert.equal(await page.locator(".gpt-frame").count(),0,"GPT still embeds a provider website");
  assert.equal(await page.locator(".gpt-config").getAttribute("hidden"),null,"GPT settings did not open for a new session");

  await page.locator(".gpt-key").fill("fixture-key");
  await page.locator(".gpt-endpoint").fill(origin+"/Genesis/__mock-ai");
  await page.locator(".gpt-model").fill("fixture-model");
  await page.locator('[data-gpt-action="save"]').click();
  await page.locator(".gpt-input").fill("hello Genesis");
  await page.locator(".gpt-composer").press("Enter");
  await page.locator(".gpt-message.assistant").filter({hasText:"Fixture response for: hello Genesis"}).waitFor();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem("genesisGPTApiKeySession")),"fixture-key");
  console.log("PASS native GPT app, session key handling, API response, no provider iframe, and first-use tour");

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
  await page.goto(base+"intro.html",{waitUntil:"load"});
  assert.equal(await page.locator(".logo-wrap").count(),1);
  assert.equal(await page.locator("#showcaseAudio").count(),0,"The cinematic showcase intro is still present");
  assert.equal(await page.locator(".stage").count(),1);
  await page.evaluate(({version})=>localStorage.setItem("genesisShowcaseSeen:introtest",version),{version});
  await page.goto(base+"os.html",{waitUntil:"load"});
  await page.waitForFunction(()=>document.querySelector("#os"));
  assert.equal(await page.locator("#genesisAppTour").count(),0);
  console.log("PASS original Genesis intro and returning-login flow");
  await introCtx.close();
}catch(error){
  if(page&&!page.isClosed())await page.screenshot({path:resolve(output,"gpt-install-showcase-failure.png")}).catch(()=>{});
  throw error;
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
