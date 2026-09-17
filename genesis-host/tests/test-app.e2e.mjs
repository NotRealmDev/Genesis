import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const server=createServer(async(req,res)=>{
  try{const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/Genesis/'))throw Error();const file=resolve(root,path.slice(9));if(!file.startsWith(root+sep))throw Error();const bytes=await readFile(file);res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html':'text/javascript'});res.end(bytes)}catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const peers=new Map();const errors=[];
async function fixture(role='admin'){
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(/\/(?:prism(?:\.api)?|libby|genesis-prism|genesis-announcements)\.js$/.test(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});return route.continue();
  });
  await context.addInitScript(role=>{
    localStorage.setItem('genesisLogin',JSON.stringify({user:'Synthetic Test fixture',role,expires:Date.now()+3600000}));localStorage.setItem('genesisBrowserStateV2',JSON.stringify({open:false}));
    window.supabase={createClient:()=>({channel(name){const channel={on(type,filter,callback){window.__receiver=callback;return channel},subscribe(callback){window.__register(name).then(()=>callback('SUBSCRIBED'));return channel},async send(packet){await window.__broadcast(name,packet.payload);return 'ok'}};return channel},async removeChannel(){await window.__register('')}})};
    navigator.mediaDevices.getDisplayMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const draw=canvas.getContext('2d');let x=0;
      window.__animation=setInterval(()=>{draw.fillStyle=`hsl(${x++%360} 80% 40%)`;draw.fillRect(0,0,1280,720);draw.fillStyle='white';draw.fillRect(x%1000,200,100,100)},1000/60);
      window.__capture=canvas.captureStream(60);return window.__capture;
    };
  },role);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('__register',name=>{peers.set(page,name)});
  await page.exposeFunction('__broadcast',async(name,payload)=>{
    for(const [other,topic] of peers)if(other!==page&&topic===name&&!other.isClosed())await other.evaluate(payload=>window.__receiver?.({payload}),payload);
  });
  await page.goto(origin+'/Genesis/os.html',{waitUntil:'domcontentloaded'});return page;
}
try{
  const pc=await fixture();const viewer=await fixture();const user=await fixture('user');
  await pc.waitForFunction(()=>!!window.GenesisTest);await viewer.waitForFunction(()=>!!window.GenesisTest);
  assert.equal(await pc.locator('.window[data-app="test"]').count(),0);
  assert.equal(await user.locator('[data-app="test"]').count(),0);
  await pc.evaluate(()=>openApp('test'));await viewer.evaluate(()=>openApp('test'));
  await pc.click('#genesisTestShare');await pc.waitForFunction(()=>document.getElementById('genesisTestKey').textContent.length===64);
  const key=await pc.locator('#genesisTestKey').innerText();await viewer.fill('#genesisTestInput',key);await viewer.click('#genesisTestConnect');
  await viewer.waitForFunction(()=>{const v=document.getElementById('genesisTestVideo');return v?.videoWidth===1280&&v.currentTime>0.1},null,{timeout:25000});
  await viewer.waitForFunction(()=>document.getElementById('genesisTestStatus').textContent.includes('decoded FPS'),null,{timeout:10000});
  console.log('Synthetic WebRTC:',await viewer.locator('#genesisTestStatus').innerText());
  await viewer.click('#genesisTestFull');await viewer.waitForFunction(()=>document.fullscreenElement?.id==='genesisTestRoot');await viewer.evaluate(()=>document.exitFullscreen());
  await viewer.click('#genesisTestStop');assert.equal(await viewer.evaluate(()=>GenesisTest.state.peer),null);
  await viewer.fill('#genesisTestInput',key);await viewer.click('#genesisTestConnect');
  await viewer.waitForFunction(()=>document.getElementById('genesisTestVideo').currentTime>0.1&&GenesisTest.state.peer?.connectionState==='connected',null,{timeout:25000});
  await pc.locator('.window[data-app="test"] .window-control.close').click();
  await pc.waitForFunction(()=>GenesisTest.state.stream===null&&window.__capture.getTracks().every(track=>track.readyState==='ended'));
  assert.deepEqual(errors,[]);console.log('PASS: admin-only actual Genesis Test app, synthetic decoded video, FPS, fullscreen, reconnect, capture cleanup. Real Windows capture/60 FPS not verified.');
}finally{await browser.close();server.close()}
