import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'test-output');
await mkdir(output,{recursive:true});
const version=(await readFile(resolve(root,'genesis-intro-state.js'),'utf8')).match(/const version="([^"]+)"/)[1];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/Genesis/__mock-ai'){
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><title>Test AI page</title><body style="background:#132033;color:white;font:20px system-ui;padding:30px">Local proxy fixture</body>');return;
    }
    const path=url.pathname.replace(/^\/Genesis\//,'');
    const file=resolve(root,decodeURIComponent(path)||'index.html');
    if(!file.startsWith(root.endsWith(sep)?root:root+sep))throw Error('Invalid path');
    const data=await readFile(file);
    const type=mime[extname(file)]||'application/octet-stream';
    const range=req.headers.range;
    if(range && extname(file)==='.mp3'){
      const match=/bytes=(\d*)-(\d*)/.exec(range);
      const start=match?.[1]?Number(match[1]):0;
      const requestedEnd=match?.[2]?Number(match[2]):data.length-1;
      const end=Math.min(requestedEnd,data.length-1);
      if(start<=end){
        const chunk=data.subarray(start,end+1);
        res.writeHead(206,{'content-type':type,'content-length':chunk.length,'content-range':`bytes ${start}-${end}/${data.length}`,'accept-ranges':'bytes','cache-control':'no-store'});
        res.end(chunk);
        return;
      }
    }
    const headers={'content-type':type,'content-length':data.length,'cache-control':'no-store'};
    if(extname(file)==='.mp3')headers['accept-ranges']='bytes';
    res.writeHead(200,headers);
    res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const base=origin+'/Genesis/';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(process.env.GENESIS_CHROME_PATH?{executablePath:process.env.GENESIS_CHROME_PATH}:{})});
let page;
const errors=[];
async function context({seen=true,viewport={width:1440,height:900},user='ShowcaseTest'}={}){
  const ctx=await browser.newContext({viewport});
  // Keep all account, messaging, and AI traffic inside the fixture. This test
  // never writes to the real backend or claims to test a provider's replies.
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    if(url.pathname.includes('/rest/v1/rpc/'))return route.fulfill({contentType:'application/json',body:JSON.stringify([{display_id:527,active:true}])});
    return route.abort();
  });
  await ctx.routeWebSocket(/.*/,socket=>socket.close());
  await ctx.addInitScript(({seen,version,user})=>{
    if(!localStorage.getItem('genesisLogin'))localStorage.setItem('genesisLogin',JSON.stringify({user,role:'user',expires:Date.now()+3600000}));
    if(seen)localStorage.setItem('genesisShowcaseSeen:'+user.toLowerCase(),version);
    localStorage.setItem('genesisMusicVolume','0');
  },{seen,version,user});
  return ctx;
}
async function seek(target,time,scene){
  await target.evaluate(time=>{const audio=document.getElementById('showcaseAudio');audio.pause();audio.currentTime=time;},time);
  await target.waitForFunction(scene=>document.body.dataset.scene===scene,scene);
  await target.waitForTimeout(1100); // Allow the designed scene transition to settle.
}
try{
  const ctx=await context();
  page=await ctx.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'os.html',{waitUntil:'load'});
  await page.waitForFunction(()=>window.GenesisGPT && window.GenesisInstall);
  await page.evaluate(()=>{
    window.__aiCalls=[];window.__aiDelay=0;window.__failAI=false;window.__holdFrames=false;window.__frameResolvers=[];
    window.ensureGenesisPrismRuntime=async()=>{
      if(window.__failAI)throw Error('Test transport unavailable');
      return {createFrame:async element=>{
        const delay=window.__aiDelay;
        if(window.__holdFrames)await new Promise(done=>window.__frameResolvers.push(done));
        if(delay)await new Promise(done=>setTimeout(done,delay));
        return {go(url){window.__aiCalls.push(url);element.src='__mock-ai?url='+encodeURIComponent(url);},reload(){window.__aiCalls.push('reload');element.src+='&reload=1';}};
      }};
    };
    openApp('browser');
  });
  const browserTarget=await page.locator('#browserAddress').inputValue();
  await page.locator('[data-dock-app="gpt"]').click();
  await page.locator('.gpt-overlay[hidden]').waitFor({state:'attached'});
  assert.equal(await page.locator('.gpt-frame').getAttribute('title'),'ChatGPT');
  await page.selectOption('.gpt-provider','claude');
  await page.locator('.gpt-overlay[hidden]').waitFor({state:'attached'});
  assert.equal(await page.locator('#browserAddress').inputValue(),browserTarget,'GPT changed Browser navigation');
  assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1)),'https://claude.ai/');
  await page.locator('[data-gpt-action="reload"]').click();
  assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1)),'reload');
  await page.locator('[data-gpt-action="new"]').click();
  await page.waitForFunction(()=>window.__aiCalls.at(-1)==='https://claude.ai/');
  await page.evaluate(()=>{window.__holdFrames=true;});
  await page.selectOption('.gpt-provider','gemini');
  await page.selectOption('.gpt-provider','duck');
  await page.waitForFunction(()=>window.__frameResolvers.length===2);
  await page.evaluate(()=>{window.__holdFrames=false;window.__frameResolvers.splice(0).forEach(done=>done());});
  await page.locator('.gpt-overlay[hidden]').waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>window.__aiCalls.includes('https://gemini.google.com/app')),false,'A stale frame navigated after a service switch');
  assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1)),'https://duck.ai/');
  await page.locator('.window[data-app="gpt"] .close').click();
  await page.locator('.window[data-app="gpt"]').waitFor({state:'detached'});
  await page.evaluate(()=>{window.__aiDelay=0;window.__failAI=true;openApp('gpt');});
  await page.locator('.gpt-retry:not([hidden])').waitFor();
  assert.match(await page.locator('.gpt-detail').innerText(),/Test transport unavailable/);
  await page.evaluate(()=>{window.__failAI=false;});
  await page.locator('.gpt-retry').click();
  await page.locator('.gpt-overlay[hidden]').waitFor({state:'attached'});
  assert.equal(await page.locator('.gpt-provider').inputValue(),'duck','AI preference was not retained');
  await page.evaluate(()=>{window.__holdFrames=true;});
  const callCount=await page.evaluate(()=>window.__aiCalls.length);
  await page.selectOption('.gpt-provider','chatgpt');
  await page.waitForFunction(()=>window.__frameResolvers.length===1);
  await page.locator('.window[data-app="gpt"] .close').click();
  await page.evaluate(()=>{window.__holdFrames=false;window.__frameResolvers.splice(0).forEach(done=>done());});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>window.__aiCalls.length),callCount,'Closing GPT did not cancel a pending navigation');
  console.log('PASS GPT services, retry, remembered preference, isolation, and async close/switch races');

  await page.evaluate(async()=>{await GenesisInstall.registerWorker();await navigator.serviceWorker.ready;});
  const registrations=await page.evaluate(async()=>Array.from(await navigator.serviceWorker.getRegistrations(),r=>({scope:r.scope,url:r.active?.scriptURL})));
  assert.equal(registrations.length,1);
  assert.equal(registrations[0].scope,base);
  assert.equal(registrations[0].url,base+'servy.js');
  const cdp=await ctx.newCDPSession(page);
  const appManifest=await cdp.send('Page.getAppManifest');
  assert.deepEqual(appManifest.errors,[]);
  const installability=await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors,[]);
  // Use synthetic browser events to test acceptance/dismissal without
  // actually installing software on the test machine.
  await page.evaluate(()=>{
    window.__promptCalls=0;
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{window.__promptCalls++;return Promise.resolve({outcome:'dismissed'});};
    dispatchEvent(event);
  });
  await page.locator('.dock [data-genesis-install]').click();
  await page.waitForFunction(()=>window.__promptCalls===1);
  assert.equal(await page.locator('.dock [data-genesis-install]').isVisible(),true);
  await page.locator('.dock [data-genesis-install]').click();
  await page.locator('.genesis-install-dialog[open]').waitFor();
  await page.locator('.genesis-install-close').click();
  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{window.__promptCalls++;return new Promise(resolve=>{window.__finishInstall=resolve;});};
    dispatchEvent(event);
    document.querySelector('.dock [data-genesis-install]').click();
    document.querySelector('.dock [data-genesis-install]').click();
  });
  assert.equal(await page.evaluate(()=>window.__promptCalls),2,'Install prompted more than once');
  await page.evaluate(()=>window.__finishInstall({outcome:'accepted'}));
  await page.locator('.dock [data-genesis-install]').waitFor({state:'hidden'});
  console.log('PASS valid installable manifest, one shared service worker, dismissal, one-shot prompt, and acceptance');

  // Confirm offline launches show the public notice instead of a broken page.
  await page.waitForFunction(async()=>!!(await caches.match(new URL('offline.html',location.href))));
  await ctx.setOffline(true);
  await page.goto(base+'index.html');
  assert.match(await page.locator('h1').innerText(),/offline/);
  await ctx.setOffline(false);
  await ctx.close();

  const first=await context({seen:false});
  page=await first.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'os.html');
  await page.waitForURL('**/intro.html');
  await page.waitForFunction(()=>{const audio=document.getElementById('showcaseAudio');return audio && audio.currentTime>0 && Number.isFinite(audio.duration) && audio.duration>0;});
  const actualDuration=await page.evaluate(()=>document.getElementById('showcaseAudio').duration);
  assert.ok(Math.abs(actualDuration-33.410563)<.2,'Intro did not load the supplied music');
  await seek(page,1.5,'arrival');
  await page.screenshot({path:resolve(output,'intro-arrival.png')});
  await seek(page,5,'browser');
  await page.screenshot({path:resolve(output,'intro-browser.png')});
  await seek(page,9,'games');
  await seek(page,13.5,'gpt');
  await page.screenshot({path:resolve(output,'intro-gpt.png')});
  await seek(page,17.8,'messages');
  await page.screenshot({path:resolve(output,'intro-messages.png')});
  await seek(page,21.8,'themes');
  await page.screenshot({path:resolve(output,'intro-themes.png')});
  await seek(page,26,'everyday');
  await page.screenshot({path:resolve(output,'intro-everyday.png')});
  await seek(page,30,'finale');
  await page.screenshot({path:resolve(output,'intro-finale.png')});
  const pausedAt=await page.evaluate(()=>document.getElementById('showcaseAudio').currentTime);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.getElementById('showcaseAudio').currentTime),pausedAt);
  assert.equal(await page.evaluate(()=>GenesisIntroState.shouldShow(JSON.parse(localStorage.getItem('genesisLogin')))),true,'Intro marked complete prematurely');
  await page.evaluate(()=>{const audio=document.getElementById('showcaseAudio');audio.currentTime=audio.duration-.3;audio.play();});
  await page.waitForURL('**/os.html');
  assert.equal(await page.evaluate(()=>GenesisIntroState.shouldShow(JSON.parse(localStorage.getItem('genesisLogin')))),false);
  await page.reload();
  assert.match(page.url(),/os\.html$/,'The intro repeated after completion');
  await page.evaluate(()=>{localStorage.setItem('genesisShowcaseSeen:showcasetest','older-update');sessionStorage.removeItem('genesisShowcaseSeen:showcasetest');});
  await page.reload();
  await page.waitForURL('**/intro.html');
  await page.locator('#showcaseSkip').click();
  await page.waitForURL('**/os.html');
  console.log('PASS soundtrack duration, all eight scenes, pause synchronization, completion, returning login, and update replay');
  await first.close();

  const mobile=await context({seen:false,viewport:{width:390,height:844}});
  page=await mobile.newPage();
  await page.goto(base+'intro.html');
  await page.waitForFunction(()=>document.getElementById('showcaseAudio').currentTime>0);
  await seek(page,13.5,'gpt');
  await page.screenshot({path:resolve(output,'intro-mobile-gpt.png')});
  await seek(page,21.8,'themes');
  await page.screenshot({path:resolve(output,'intro-mobile-themes.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mobile.close();

  const blocked=await context({seen:false});
  await blocked.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Autoplay requires interaction','NotAllowedError'));};});
  page=await blocked.newPage();
  await page.goto(base+'intro.html');
  await page.locator('#showcaseStart:not([hidden])').waitFor();
  await page.locator('#showcaseSilent').click();
  await page.waitForFunction(()=>Number(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'))>0);
  await page.locator('#showcaseSkip').click();
  await page.waitForURL('**/os.html');
  await blocked.close();
  assert.deepEqual(errors,[],'Unexpected page errors');
  console.log('PASS mobile layout, autoplay-blocked fallback, silent playback, skip, and clean page execution');
}catch(error){
  if(page && !page.isClosed())await page.screenshot({path:resolve(output,'gpt-install-showcase-failure.png')}).catch(()=>{});
  console.error('PAGE ERRORS',errors);
  throw error;
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
