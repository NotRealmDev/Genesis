import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const {chromium}=await import(process.env.GENESIS_PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!path.startsWith(root+'/')){res.writeHead(403).end();return}
  try{const bytes=await readFile(path);res.setHeader('Content-Type',extname(path)==='.html'?'text/html':extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(bytes)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext();
  const authRequests=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin)return route.continue();
    if(!url.hostname.endsWith('.supabase.co'))return route.abort();
    let body={};
    if(url.pathname==='/auth/v1/token'){
      authRequests.push(request.postDataJSON());
      body={access_token:'fixture-token',refresh_token:'fixture-refresh',expires_in:3600};
    }else if(url.pathname==='/auth/v1/user')body={id:'fixture-user',email:'owner@example.test'};
    else if(/genesis_session_access/.test(url.pathname))body=[{user_id:'fixture-user',display_id:527,active:true,role:'admin'}];
    else if(/genesis_(register|check)_device/.test(url.pathname))body=[{display_id:527,active:true}];
    else if(/genesis_security_guard/.test(url.pathname))body=true;
    else body=[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();
  await page.goto(origin+'/index.html');
  await page.locator('#username').fill('Admin');
  await page.locator('#password').fill('fixture-password');
  await page.locator('#loginButton').click();
  await page.waitForURL('**/intro.html');
  assert.equal(authRequests[0].email,'realmgames7@gmail.com');
  await page.goto(origin+'/os.html');
  await page.waitForFunction(()=>window.GenesisAuth?.user?.role==='admin');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).visibility),'visible');
  assert.equal(await page.evaluate(()=>window.GenesisAuth.user.name),'Admin');
  await page.evaluate(()=>openApp('deactivateOS'));
  await page.locator('#genesisDeviceList').waitFor({state:'visible'});
  assert.equal(await page.locator('#genesisAuthLock').count(),0);
  await context.close();

  const forged=await browser.newContext();
  await forged.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await forged.addInitScript(()=>{
    localStorage.setItem('genesisLogin',JSON.stringify({user:'Admin',role:'admin',expires:Date.now()+3600000}));
    sessionStorage.setItem('realmAuth','1');sessionStorage.setItem('genesisRole','admin');
  });
  const fake=await forged.newPage();await fake.goto(origin+'/os.html');
  await fake.locator('#genesisAuthLock').waitFor({state:'visible'});
  assert.equal(await fake.evaluate(()=>window.GenesisAuth.user),null);
  await forged.close();
  console.log('PASS: normal Admin sign-in reaches DeactivateOS; forged browser flags are locked out.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
