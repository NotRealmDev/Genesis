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

const browser=await chromium.launch({
  headless:process.env.GENESIS_TEST_HEADFUL!=="1",
  args:["--autoplay-policy=no-user-gesture-required"]
});
const page=await browser.newPage();
const logs=[];
let liveStage="browser startup";
function markStage(message){
  liveStage=message;
  console.log("[proxy-e2e] "+message);
}
const watchdog=setTimeout(async()=>{
  console.error("[proxy-e2e] hard timeout during "+liveStage);
  await mkdir(join(root,"test-output"),{recursive:true}).catch(()=>{});
  await Promise.race([
    page.screenshot({path:join(root,"test-output","proxy-timeout.png"),fullPage:true}).catch(()=>{}),
    new Promise(resolve=>setTimeout(resolve,5000))
  ]);
  process.exit(1);
},6*60*1000);
page.on("console",message=>logs.push(message.type()+": "+message.text()));
page.on("pageerror",error=>logs.push("pageerror: "+error.message));

async function youtubeHasContent(){
  return page.waitForFunction(()=>{
    const doc=document.getElementById("target")?.contentDocument;
    if(!doc)return false;
    const selectors='a#video-title,ytd-video-renderer #video-title,yt-lockup-view-model h3,yt-lockup-view-model a[href*="/watch"]';
    return [...doc.querySelectorAll(selectors)].some(node=>(node.textContent||"").trim().length>1);
  },null,{timeout:60000});
}

async function acceptYouTubeConsent(){
  const direct=page.frames().find(candidate=>/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\//i.test(candidate.url()));
  if(direct){
    await direct.evaluate(()=>{
      const buttons=[...document.querySelectorAll("button,tp-yt-paper-button,input[type=submit]")];
      const accept=buttons.find(button=>/accept all|i agree|agree|continue/i.test((button.innerText||button.value||button.textContent||"").trim()));
      accept?.click();
    }).catch(()=>{});
    return;
  }
  await page.evaluate(()=>{
    const doc=document.getElementById("target")?.contentDocument;
    if(!doc)return;
    const buttons=[...doc.querySelectorAll("button,tp-yt-paper-button,input[type=submit]")];
    const accept=buttons.find(button=>/accept all|i agree|agree|continue/i.test((button.innerText||button.value||button.textContent||"").trim()));
    accept?.click();
  });
}

async function youtubeVideoSnapshot(){
  const direct=page.frames().find(candidate=>/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\//i.test(candidate.url()));
  if(direct){
    return direct.evaluate(()=>{
      const video=document.querySelector("video");
      if(!video)return null;
      const buffered=[];
      for(let index=0;index<video.buffered.length;index++)buffered.push([video.buffered.start(index),video.buffered.end(index)]);
      return{
        currentTime:video.currentTime,
        duration:Number.isFinite(video.duration)?video.duration:null,
        readyState:video.readyState,
        networkState:video.networkState,
        paused:video.paused,
        ended:video.ended,
        currentSrc:video.currentSrc||video.src||"",
        buffered,
        error:video.error?{code:video.error.code,message:video.error.message||""}:null
      };
    }).catch(()=>null);
  }
  return page.evaluate(()=>{
    const doc=document.getElementById("target")?.contentDocument;
    const video=doc?.querySelector("video");
    if(!video)return null;
    const buffered=[];
    for(let index=0;index<video.buffered.length;index++){
      buffered.push([video.buffered.start(index),video.buffered.end(index)]);
    }
    return {
      currentTime:video.currentTime,
      duration:Number.isFinite(video.duration)?video.duration:null,
      readyState:video.readyState,
      networkState:video.networkState,
      paused:video.paused,
      ended:video.ended,
      currentSrc:video.currentSrc||video.src||"",
      buffered,
      error:video.error?{code:video.error.code,message:video.error.message||""}:null
    };
  });
}

async function nudgeYouTubePlayback(){
  const direct=page.frames().find(candidate=>/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\//i.test(candidate.url()));
  if(direct){
    return direct.evaluate(async()=>{
      const video=document.querySelector("video");
      if(!video)return null;
      video.muted=true;
      video.volume=0;
      video.playsInline=true;
      let playError="";
      try{await Promise.race([video.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("video.play() timed out")),10000))])}
      catch(error){playError=error?.message||String(error)}
      return{initialTime:video.currentTime,playError};
    }).catch(()=>null);
  }
  return page.evaluate(async()=>{
    const doc=document.getElementById("target")?.contentDocument;
    const video=doc?.querySelector("video");
    if(!video)return null;
    video.muted=true;
    video.volume=0;
    video.playsInline=true;
    let playError="";
    try{await Promise.race([video.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("video.play() timed out")),10000))])}
    catch(error){playError=error?.message||String(error)}
    return{initialTime:video.currentTime,playError};
  });
}

async function waitForYouTubePlayback(timeoutMs=90000){
  await acceptYouTubeConsent();
  const deadline=Date.now()+timeoutMs;
  let started=null;
  while(Date.now()<deadline&&!started){
    await acceptYouTubeConsent();
    started=await nudgeYouTubePlayback();
    if(!started)await new Promise(resolve=>setTimeout(resolve,750));
  }
  if(!started)throw new Error("YouTube did not create a video element");
  while(Date.now()<deadline){
    const snapshot=await youtubeVideoSnapshot();
    if(snapshot?.error)throw new Error("YouTube reported media error "+snapshot.error.code+": "+snapshot.error.message);
    if(snapshot?.readyState>=2&&snapshot.currentTime>=started.initialTime+1)break;
    await nudgeYouTubePlayback();
    await new Promise(resolve=>setTimeout(resolve,750));
  }

  const snapshot=await youtubeVideoSnapshot();
  assert.ok(snapshot,"YouTube video element disappeared");
  assert.equal(snapshot.error,null,"YouTube reported a media error");
  assert.ok(snapshot.readyState>=2,"YouTube never buffered playable media");
  assert.ok(snapshot.currentTime>=started.initialTime+1,"YouTube video clock did not advance");
  return {...snapshot,initialTime:started.initialTime,playError:started.playError};
}

async function youtubeChallengeDetected(){
  const direct=page.frames().find(candidate=>/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\//i.test(candidate.url()));
  if(direct){
    return direct.evaluate(()=>/sign in to confirm you(?:'|’)?re not a bot|confirm you(?:'|’)?re not a bot|unusual traffic/i.test(document.body?.innerText||"")).catch(()=>false);
  }
  return page.evaluate(()=>{
    try{
      const text=document.getElementById("target")?.contentDocument?.body?.innerText||"";
      return /sign in to confirm you(?:'|’)?re not a bot|confirm you(?:'|’)?re not a bot|unusual traffic/i.test(text);
    }catch{return false}
  });
}

async function directYouTubeDiagnostics(){
  const direct=page.frames().find(candidate=>/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\//i.test(candidate.url()));
  if(!direct)return null;
  return direct.evaluate(()=>{
    let playerResponse=null;
    for(const candidate of [
      globalThis.ytInitialPlayerResponse,
      globalThis.ytplayer?.config?.args?.player_response
    ]){
      try{
        const parsed=typeof candidate==="string"?JSON.parse(candidate):candidate;
        if(parsed?.playabilityStatus){
          playerResponse={
            status:parsed.playabilityStatus.status||"",
            reason:parsed.playabilityStatus.reason||"",
            subreason:parsed.playabilityStatus.errorScreen?.playerErrorMessageRenderer?.subreason?.runs?.map(run=>run.text).join("")||""
          };
          break;
        }
      }catch{}
    }
    return{
      url:location.href,
      title:document.title,
      bodyText:(document.body?.innerText||"").replace(/\s+/g," ").trim().slice(0,1200),
      playerResponse
    };
  }).catch(error=>({url:direct.url(),error:error?.message||String(error)}));
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
  },null,{timeout:60000});
}

async function waitForGeforceContent(){
  return page.waitForFunction(()=>{
    const frame=document.getElementById("target");
    const doc=frame?.contentDocument;
    const win=frame?.contentWindow;
    if(!doc || typeof win?.$scramjet$prop==="undefined") return false;
    const text=(doc.body?.innerText||"").replace(/\s+/g," ").trim();
    return text.length>80 && /geforce\s*now|log\s*in|sign\s*in|join|games/i.test(text);
  },null,{timeout:60000});
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
  markStage("starting harness");
  await page.goto("http://127.0.0.1:4173/tests/proxy-harness.html",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>window.proxyHarnessLoaded===true,null,{timeout:30000});

  const health=await page.evaluate(()=>window.proxyHarness.start());
  assert.equal(health.ok,true);
  assert.ok(health.status>=200&&health.status<500);

  markStage("checking example.com through Scramjet");
  await page.evaluate(()=>window.proxyHarness.go("https://example.com/"));
  await page.waitForFunction(()=>{
    const text=document.getElementById("target")?.contentDocument?.body?.innerText||"";
    return text.includes("Example Domain");
  },null,{timeout:60000});

  const exampleSnapshot=await frameSnapshot();
  assert.equal(exampleSnapshot.globals.scramjet,"object","Scramjet core was not injected into the proxied document");
  assert.notEqual(exampleSnapshot.globals.prop,"undefined","Scramjet property hooks were not installed");

  markStage("checking YouTube results");
  await navigateWithRepair("https://www.youtube.com/results?search_query=lofi",youtubeHasContent);
  const youtube=await frameSnapshot();
  assert.match(youtube.title,/YouTube/i);

  // YouTube's own IFrame API documentation uses this public video as its
  // reference embed, making it a stable target for a player-health test.
  const watchUrl="https://www.youtube.com/watch?v=M7lc1UVf-VE";
  markStage("checking real YouTube media progress");
  let youtubePlayback=null;
  let youtubePlaybackMode="official-youtube-nocookie";
  let youtubeChallenge=false;
  let proxyPlaybackError="";
  const fallbacks=await page.evaluate(target=>window.GenesisPrism.youtubeEmbedFallbacks(target),watchUrl);
  let fallbackError=null;
  for(let index=0;index<fallbacks.length;index++){
    try{
      await page.evaluate(({target,index})=>window.proxyHarness.openYouTubeFallback(target,index),{target:watchUrl,index});
      youtubePlayback=await waitForYouTubePlayback(45000);
      youtubePlaybackMode=index===0?"official-youtube-nocookie":"official-youtube";
      fallbackError=null;
      break;
    }catch(error){
      fallbackError=error;
      youtubeChallenge=await youtubeChallengeDetected();
      if(youtubeChallenge)break;
    }
  }
  if(!youtubePlayback&&!youtubeChallenge)throw fallbackError||new Error("No YouTube player fallback loaded");
  if(youtubePlayback){
    assert.ok(youtubePlayback.currentTime>=1,"YouTube video did not make playback progress");
    assert.equal(youtubePlayback.error,null,"YouTube playback ended with a media error");
  }else{
    const challenge=await directYouTubeDiagnostics();
    assert.match(challenge?.bodyText||"",/confirm you(?:'|’)?re not a bot|unusual traffic/i,"YouTube player failed without a recognized automation challenge");
    console.log("[proxy-e2e] YouTube player loaded; cloud runner received YouTube's sign-in challenge");
  }
  const youtubeReport=await page.evaluate(()=>window.proxyHarness.report());
  const mediaStats=youtubeReport.diagnostics.requests;
  assert.equal(mediaStats.midSessionFailover,false,"YouTube changed Wisp routes during playback");
  if(youtubePlaybackMode==="scramjet"){
    assert.ok(mediaStats.youtubeMediaRequests>0,"No YouTube media requests reached the transport");
    assert.ok(mediaStats.youtubeMediaResponses>0,"No YouTube media response reached the player");
  }else{
    assert.match(page.frames().find(candidate=>/youtube(?:-nocookie)?\.com\/embed\//i.test(candidate.url()))?.url()||"",/youtube(?:-nocookie)?\.com\/embed\/M7lc1UVf-VE/i);
  }
  assert.equal(mediaStats.youtubeMediaInvalidPartialResponses,0,"A 206 media response was missing Content-Range");

  markStage("checking TikTok content");
  if(youtubePlaybackMode==="scramjet"){
    await navigateWithRepair("https://www.tiktok.com/explore",waitForTikTokContent);
  }else{
    await page.evaluate(target=>window.proxyHarness.repairAndGo(target),"https://www.tiktok.com/explore");
    await waitForTikTokContent();
  }
  const tiktok=await frameSnapshot();
  assert.match(tiktok.href,/tiktok\.com/i);

  markStage("checking GeForce NOW shell");
  await navigateWithRepair("https://play.geforcenow.com/mall/",waitForGeforceContent);
  const geforceNow=await frameSnapshot();
  assert.match(geforceNow.href,/geforcenow\.com/i);

  const report=await page.evaluate(()=>window.proxyHarness.report());
  assert.ok(report.diagnostics.healthy);
  markStage("all live checks passed");
  console.log(JSON.stringify({
    health,
    diagnostics:report.diagnostics,
    sites:{
      youtube:{title:youtube.title,bodyText:youtube.bodyText.slice(0,600),playback:youtubePlayback,playbackMode:youtubePlaybackMode,youtubeChallenge,proxyPlaybackError,mediaStats},
      tiktok:{title:tiktok.title,bodyText:tiktok.bodyText.slice(0,600)},
      geforceNow:{title:geforceNow.title,bodyText:geforceNow.bodyText.slice(0,600)}
    }
  }));
}catch(error){
  await mkdir(join(root,"test-output"),{recursive:true});
  await page.screenshot({path:join(root,"test-output","proxy-failure.png"),fullPage:true}).catch(()=>{});
  const report=await page.evaluate(()=>window.proxyHarness?.report?.()).catch(()=>null);
  const frame=await frameSnapshot().catch(()=>null);
  const video=await youtubeVideoSnapshot().catch(()=>null);
  const directYouTube=await directYouTubeDiagnostics().catch(()=>null);
  console.error(JSON.stringify({error:error.message,report,frame,video,directYouTube,logs:logs.slice(-160)},null,2));
  throw error;
}finally{
  clearTimeout(watchdog);
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
