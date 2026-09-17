import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+pathname);
    if(!file.startsWith(root+sep))throw new Error('outside fixture');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html':'text/javascript','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/genesis-host/tests/webrtc.fixture.html`);
  await page.waitForFunction(()=>!document.getElementById('start').disabled);
  await page.click('#start');
  await page.waitForFunction(()=>document.getElementById('status').textContent==='PASS run 1',null,{timeout:45000});
  const first=JSON.parse(await page.locator('#result').innerText());
  assert.ok(first.framesDecoded>=3);assert.equal(first.width,640);
  assert.equal(first.audioTracks,1);assert.equal(first.sourceAssignments,1,'track delivery reset the media source');
  assert.ok(first.earlyHostIce>0,'fixture did not exercise ICE before the Host answer');
  assert.ok(first.earlyViewerIce>0,'fixture did not exercise ICE before the viewer offer');
  await page.frameLocator('#viewer').locator('#genesisVmStream').press('w');
  await page.waitForFunction(()=>document.getElementById('control').textContent.includes('KeyW'));
  await page.click('#reconnect');
  await page.waitForFunction(()=>document.getElementById('status').textContent==='PASS run 2',null,{timeout:45000});
  const second=JSON.parse(await page.locator('#result').innerText());
  assert.equal(second.audioTracks,1);assert.equal(second.sourceAssignments,2,'reconnect assigned more than one source per attempt');
  await page.click('#stop');
  await page.waitForFunction(()=>document.getElementById('viewer').contentWindow.GenesisHostVM.state.peer===null);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({syntheticCapture:true,realWebRTC:true,first,second,keyboardRoundTrip:true,cleanDisconnect:true},null,2));
}catch(error){console.error(await page.locator('body').innerText());console.error(errors);throw error}
finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
