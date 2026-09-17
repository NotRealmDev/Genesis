import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Actual Genesis shell/modules on a GitHub Pages-style project path. All login
// state is synthetic and local; no production password, Host Key, or GFN login.
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!pathname.startsWith('/Genesis/'))throw new Error('outside project');
    const file=resolve(root,pathname.slice('/Genesis/'.length));
    if(!file.startsWith(root+sep))throw new Error('outside fixture');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html':'text/javascript','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];

async function fixture(role='admin'){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(role=>{
    localStorage.setItem('genesisLogin',JSON.stringify({user:'Local VM test',role,expires:Date.now()+3600000}));
    localStorage.removeItem('genesisVmHostKey');
    localStorage.setItem('realmOsIcon_vm',JSON.stringify({x:99999,y:-500}));
    localStorage.setItem('genesisBrowserSession',JSON.stringify({restoreOnStartup:false}));
    window.__vmTestLoadFired=false;
    window.addEventListener('load',()=>{window.__vmTestLoadFired=true});
    document.addEventListener('DOMContentLoaded',()=>{
      const image=document.createElement('img');image.src='pending-load.png';document.body.appendChild(image);
    },{once:true});
  },role);
  // Browser/proxy/media behavior is covered by separate integration checks.
  // Isolate VM startup from those networks while retaining the actual OS code.
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    if(/\/(?:prism(?:\.api)?|libby|genesis-prism|genesis-announcements)\.js$/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
    return route.continue();
  });
  let releaseImage;
  const imageGate=new Promise(resolve=>{releaseImage=resolve});
  await context.route('**/pending-load.png',async route=>{
    await imageGate;try{await route.fulfill({status:204,body:''})}catch{}
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  return {context,page,errors,releaseImage};
}

try{
  const f=await fixture();
  let releaseHost;
  const hostGate=new Promise(resolve=>{releaseHost=resolve});
  await f.context.route('**/genesis-host-vm.js?*',async route=>{await hostGate;await route.continue()});
  await f.page.goto(origin+'/Genesis/os.html',{waitUntil:'domcontentloaded'});
  await f.page.waitForFunction(()=>!!window.GenesisVM);
  await f.page.locator('#desktop [data-app="vm"]').waitFor({state:'visible'});
  assert.equal(await f.page.locator('.window[data-app="vm"]').count(),0,'startup opened VM without user action');
  assert.equal(await f.page.evaluate(()=>window.__vmTestLoadFired),false,'the fixture did not hold window.load');
  assert.equal(f.context.pages().length,1);
  const bounds=await f.page.locator('#desktop [data-app="vm"]').boundingBox();
  assert.ok(bounds.x>=0&&bounds.x+bounds.width<=1440&&bounds.y>=0,'VM icon remained off screen');
  await f.page.locator('#desktop [data-app="vm"]').dblclick();
  await f.page.waitForFunction(()=>document.getElementById('genesisVmStatus')?.textContent.includes('Loading Genesis Host'));
  assert.equal(f.context.pages().length,1,'Host mode launched an external viewer tab');
  assert.doesNotMatch(await f.page.locator('#genesisVmCard').innerText(),/VM opened|Connected/);
  await f.page.locator('.window[data-app="vm"] .window-control.close').click();
  await f.page.locator('.window[data-app="vm"]').waitFor({state:'detached'});
  releaseHost();
  await f.page.waitForFunction(()=>window.GenesisVM?.__hostPatched);
  assert.equal(await f.page.locator('.window[data-app="vm"]').count(),0,'late module reopened a closed VM');
  assert.equal(await f.page.evaluate(()=>window.GenesisHostVM.state.peer),null);
  await f.page.locator('#desktop [data-app="vm"]').dblclick();
  await f.page.waitForFunction(()=>document.getElementById('genesisVmStatus')?.textContent==='Waiting for Host Key');
  assert.match(await f.page.locator('#genesisVmCard').innerText(),/Connect Genesis Host/);
  assert.equal(await f.page.locator('#genesisVmOverlay').isVisible(),true);
  assert.equal(await f.page.locator('#genesisVmFrame').isVisible(),false);
  await f.page.locator('.window[data-app="vm"] .window-control.close').click();
  await f.page.locator('.window[data-app="vm"]').waitFor({state:'detached'});
  await f.page.locator('#desktop [data-app="vm"]').dblclick();
  await f.page.waitForFunction(()=>document.getElementById('genesisVmStatus')?.textContent==='Waiting for Host Key');
  await f.page.evaluate(()=>window.GenesisHostLoader.retry());
  assert.equal(f.context.pages().length,1);
  assert.equal(await f.page.locator('.window[data-app="vm"]').count(),1);
  assert.deepEqual(f.errors,[]);
  results.push({role:'admin',projectPath:true,noAutomaticOpen:true,noFalseSuccess:true,pendingWindowLoad:true,lateModuleClose:true,reopen:true,offScreenIconRecovered:true});
  f.releaseImage();await f.context.close();

  const user=await fixture('user');
  await user.page.goto(origin+'/Genesis/os.html',{waitUntil:'domcontentloaded'});
  await user.page.evaluate(()=>window.GenesisHostLoader.retry());
  assert.equal(await user.page.locator('#desktop [data-app="vm"]').count(),0);
  assert.equal(await user.page.evaluate(()=>!!window.GenesisVM),false);
  assert.deepEqual(user.errors,[]);
  results.push({role:'user',adminOnlyPreserved:true});
  user.releaseImage();await user.context.close();
  console.log(JSON.stringify({realGenesisShell:true,syntheticLocalLogin:true,results},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
