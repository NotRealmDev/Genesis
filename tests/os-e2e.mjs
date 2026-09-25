import assert from "node:assert/strict";
import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,normalize,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const mime={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8",
  ".wasm":"application/wasm",
  ".png":"image/png",
  ".mp3":"audio/mpeg"
};

const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    const candidate=normalize(join(root,pathname==="/"?"os.html":pathname));
    if(!candidate.startsWith(root)){res.writeHead(403);res.end();return}
    const file=await readFile(candidate);
    res.writeHead(200,{"content-type":mime[extname(candidate)]||"application/octet-stream","cache-control":"no-store"});
    if(req.method==="HEAD")res.end();else res.end(file);
  }catch{
    res.writeHead(404);res.end("not found");
  }
});
await new Promise(resolve=>server.listen(4174,"127.0.0.1",resolve));

const browser=await chromium.launch({
  headless:process.env.GENESIS_TEST_HEADFUL!=="1",
  args:["--autoplay-policy=no-user-gesture-required","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]
});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const announcementTopic=`genesis-announcements-e2e-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
const logs=[];
page.on("console",message=>logs.push(message.type()+": "+message.text()));
page.on("pageerror",error=>logs.push("pageerror: "+error.message));

try{
  await page.addInitScript(topic=>{
    window.GENESIS_ANNOUNCEMENT_TOPIC=topic;
    localStorage.setItem("genesisLogin",JSON.stringify({user:"Jameson",role:"user",expires:Date.now()+3600000}));
    localStorage.setItem("genesisDisplayId","527");
    localStorage.setItem("genesisDeviceToken",crypto.randomUUID());
    localStorage.removeItem("genesisMessagesTutorialComplete");
  },announcementTopic);
  await page.goto("http://127.0.0.1:4174/os.html",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>typeof window.GenesisMessages?.start==="function",null,{timeout:30000});

  const receiver=await browser.newPage({viewport:{width:1200,height:760}});
  receiver.on("console",message=>logs.push("receiver "+message.type()+": "+message.text()));
  receiver.on("pageerror",error=>logs.push("receiver pageerror: "+error.message));
  await receiver.addInitScript(topic=>{
    window.GENESIS_ANNOUNCEMENT_TOPIC=topic;
    localStorage.setItem("genesisLogin",JSON.stringify({user:"Jameson",role:"user",expires:Date.now()+3600000}));
    localStorage.setItem("genesisDisplayId","528");
    localStorage.setItem("genesisDeviceToken",crypto.randomUUID());
  },announcementTopic);
  await receiver.goto("http://127.0.0.1:4174/os.html",{waitUntil:"domcontentloaded",timeout:30000});
  await Promise.all([
    page.waitForFunction(()=>window.GenesisAnnouncements?.status?.()==="live",null,{timeout:30000}),
    receiver.waitForFunction(()=>window.GenesisAnnouncements?.status?.()==="live",null,{timeout:30000})
  ]);
  const announcement={
    id:`e2e-${Date.now()}`,
    message:"Cross-client Genesis announcement",
    duration_ms:8000,
    sent_at:new Date().toISOString()
  };
  await page.evaluate(value=>window.GenesisAnnouncements.broadcast(value),announcement);
  await receiver.waitForFunction(value=>{
    const banner=document.getElementById("genesisGlobalAnnouncement");
    return banner?.dataset.announcementId===value.id && banner.classList.contains("show") && banner.textContent===value.message;
  },announcement,{timeout:15000});
  await receiver.close();

  await page.evaluate(()=>openApp("messages"));
  await page.waitForSelector('.window[data-app="messages"] #genesisMessagesApp',{state:"visible",timeout:15000});

  const windowAnimation=await page.evaluate(()=>
    getComputedStyle(document.querySelector('.window[data-app="messages"]')).animationName
  );
  assert.equal(windowAnimation,"gmWindowOpen","Messages did not use its opening animation");

  await page.waitForSelector("#gmTutorial.show",{state:"visible",timeout:5000});
  const firstLine=await page.locator("#gmTutorialLine path").getAttribute("d");
  assert.match(firstLine||"",/^M /,"tutorial did not draw its guide line");
  await page.click("#gmTutorialNext");
  await page.waitForTimeout(500);
  const secondLine=await page.locator("#gmTutorialLine path").getAttribute("d");
  assert.notEqual(secondLine,firstLine,"tutorial guide line did not move to the next control");
  await page.evaluate(()=>GenesisMessages.finishTutorial());

  const myId=await page.evaluate(()=>localStorage.getItem("genesisDisplayId"));
  const contactId=myId==="999"?"998":"999";
  await page.click("#gmAddContactButton");
  await page.fill("#gmContactId",contactId);
  await page.click("#gmAddPanel button");
  await page.waitForFunction(id=>document.querySelector("#gmChatHead")?.textContent.includes("ID "+id),contactId,{timeout:5000});
  await page.route("**/realtime/v1/api/broadcast/**",route=>route.fulfill({
    status:200,
    contentType:"application/json",
    body:JSON.stringify({success:true})
  }));
  await page.fill("#gmMessageInput","Saved draft check");
  await page.click("#gmSendButton");
  await page.waitForFunction(()=>document.querySelector("#gmThread")?.textContent.includes("Saved draft check"),null,{timeout:5000});

  await page.click('.window[data-app="messages"] .window-control.close');
  await page.waitForSelector('.window[data-app="messages"]',{state:"detached",timeout:5000});
  await page.evaluate(()=>openApp("messages"));
  await page.waitForFunction(id=>document.querySelector("#gmChatHead")?.textContent.includes("ID "+id),contactId,{timeout:5000});
  assert.match(await page.locator("#gmContactList").innerText(),new RegExp(contactId),"saved contact did not survive reopening");
  assert.match(await page.locator("#gmThread").innerText(),/Saved draft check/,"saved message did not survive reopening");

  await page.evaluate(()=>{
    const replies=["Study Hub",""];
    window.prompt=()=>replies.shift()??"";
    GenesisMessages.createServerPrompt();
  });
  await page.waitForFunction(()=>document.querySelector("#gmNavTitle")?.textContent==="Study Hub",null,{timeout:5000});
  assert.match(await page.locator("#gmContactList").innerText(),/general/,"new server did not create #general");

  await page.evaluate(()=>GenesisMessages.openServerSettings());
  await page.waitForSelector("#gmServerModal:not([hidden])",{state:"visible",timeout:5000});
  await page.fill("#gmServerName","Study Lounge");
  await page.fill("#gmServerDescription","Homework, games, and voice chat");
  await page.fill("#gmServerIcon","✨");
  await page.selectOption("#gmServerAccent","cyan");
  await page.click("#gmServerModal .primary");
  await page.waitForFunction(()=>document.querySelector("#gmNavTitle")?.textContent==="Study Lounge",null,{timeout:5000});
  assert.match(await page.locator("#gmIdentity").innerText(),/Homework, games, and voice chat/,"server description was not rendered");

  await page.evaluate(()=>{
    window.prompt=()=>"Lounge";
    GenesisMessages.createVoiceChannelPrompt();
  });
  await page.waitForFunction(()=>document.querySelector("#gmChatHead")?.textContent.includes("lounge"),null,{timeout:5000});
  assert.match(await page.locator("#gmContactList").innerText(),/lounge/,"voice channel was not rendered");
  await page.click(".gm-join-voice");
  await page.waitForFunction(()=>!document.querySelector("#gmVoiceDock")?.hidden,null,{timeout:15000});
  assert.match(await page.locator("#gmThread").innerText(),/Connected|Waiting for someone else to join/,"voice channel did not connect");
  await page.click("#gmVoiceDock .danger");
  await page.waitForFunction(()=>document.querySelector("#gmVoiceDock")?.hidden===true,null,{timeout:10000});

  await page.evaluate(()=>{
    window.prompt=()=>"hangout";
    GenesisMessages.createChannelPrompt();
  });
  await page.waitForFunction(()=>document.querySelector("#gmChatHead")?.textContent.includes("hangout"),null,{timeout:5000});
  await page.fill("#gmMessageInput","Server hello");
  await page.click("#gmSendButton");
  await page.waitForFunction(()=>document.querySelector("#gmThread")?.textContent.includes("Server hello"),null,{timeout:5000});
  assert.match(await page.locator("#gmContactList").innerText(),/hangout/,"new text channel was not rendered");

  await page.evaluate(()=>openGame("ugs-survivalracev2"));
  await page.waitForFunction(()=>{
    const frame=document.getElementById("gameFrame");
    try{
      return frame?.contentDocument?.title==="Survival Race" &&
        frame.contentDocument.querySelector('base[href*="survival%20race%20v2"]') &&
        frame.contentDocument.querySelector("#unity-canvas") &&
        typeof frame.contentWindow.createUnityInstance==="function";
    }catch{return false}
  },null,{timeout:120000});

  await page.waitForFunction(()=>{
    const frame=document.getElementById("gameFrame");
    try{
      const merged=frame?.contentWindow?.mergedFiles?.["yandexBrotli.wasm.unityweb"];
      return merged instanceof frame.contentWindow.ArrayBuffer && merged.byteLength>20000000;
    }catch{return false}
  },null,{timeout:300000});

  const fatalGameLog=logs.find(line=>/Part missing|Failed to merge|Merge failed for yandexBrotli|createUnityInstance.*(?:reject|error)/i.test(line));
  assert.equal(fatalGameLog,undefined,fatalGameLog||"Survival Race logged a fatal loading error");

  console.log(JSON.stringify({
    announcements:{crossClientRealtime:true},
    messages:{animated:true,tutorialLine:true,savedContact:contactId},
    survivalRace:{document:true,unityLoader:true,mergedWasm:true},
    relevantLogs:logs.filter(line=>/FileMerger|Survival Race|Messages/i.test(line)).slice(-40)
  },null,2));
}catch(error){
  console.error(JSON.stringify({error:error.message,logs:logs.slice(-120)},null,2));
  throw error;
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
