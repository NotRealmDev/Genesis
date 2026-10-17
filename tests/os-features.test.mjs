import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import vm from "node:vm";

const os = readFileSync(new URL("../os.html",import.meta.url),"utf8");
const login = readFileSync(new URL("../index.html",import.meta.url),"utf8");
const intro = readFileSync(new URL("../intro.html",import.meta.url),"utf8");
const messages = readFileSync(new URL("../genesis-messages.js",import.meta.url),"utf8");
const announcements = readFileSync(new URL("../genesis-announcements.js",import.meta.url),"utf8");

test("Messages exposes safe ID and topic helpers",()=>{
  const context={
    globalThis:null,
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    sessionStorage:{getItem(){return null}},
    crypto:{randomUUID(){return "test-id"}}
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(messages,context,{filename:"genesis-messages.js"});
  const helpers=context.GenesisMessages.__test;
  assert.equal(helpers.normalizeId("ID 527"),"527");
  assert.equal(helpers.normalizeId("52"),"");
  assert.equal(helpers.normalizeId("5279"),"527");
  assert.equal(helpers.topicFor("527"),"genesis-inbox-527");
  assert.equal(helpers.escapeHTML("<hello>"),"&lt;hello&gt;");
});

test("Messages app is connected to the desktop, dock, and window lifecycle",()=>{
  assert.match(os,/data-app="messages"/);
  assert.match(os,/data-dock-app="messages"/);
  assert.match(os,/GenesisMessages\?\.init/);
  assert.match(os,/GenesisMessages\?\.onWindowClose/);
  assert.match(os,/@supabase\/supabase-js@2\.116\.0/);
  assert.match(messages,/\.on\("broadcast",\{event:"message"\},handleIncoming\)/);
  assert.match(messages,/genesisMessagesTutorialComplete/);
});

test("Jameson can use the requested password through a stored hash",()=>{
  assert.match(login,/"Jameson"\s*:\s*\{/);
  assert.match(login,/bca8816842fa75ec3b69627aba1ff01ecc5d6c56e2070cf700d04f0c2b30b905/);
  assert.match(login,/await genesisSha256\(password\) === account\.passwordHash/);
  assert.doesNotMatch(login,/password:\s*"GoonFishing"/);
});

test("game HTML keeps an existing asset base",()=>{
  const start=os.indexOf("function addGameBaseTag");
  const end=os.indexOf("\n\nasync function fetchGameHTMLAsBlob",start);
  assert.ok(start>=0 && end>start,"addGameBaseTag function was not found");
  const context={URL,result:null};
  vm.createContext(context);
  vm.runInContext(`${os.slice(start,end)}\nresult={\n`+
    `existing:addGameBaseTag('<html><head><base href="https://assets.example/game/"></head></html>','https://source.example/game.html'),\n`+
    `injected:addGameBaseTag('<html><head></head></html>','https://source.example/folder/game.html')\n};`,context);
  assert.match(context.result.existing,/^<html><head><base href="https:\/\/assets\.example\/game\/">/);
  assert.doesNotMatch(context.result.existing,/source\.example/);
  assert.match(context.result.injected,/<base href="https:\/\/source\.example\/folder\/">/);
});

test("Games tab exposes the storefront showcase while retaining the full catalog",()=>{
  assert.match(os,/Continue Playing/);
  assert.match(os,/Games We Recommend/);
  assert.match(os,/Quick Play Arcade/);
  assert.match(os,/id="gamesShell"/);
  assert.match(os,/function showcaseGames/);
  assert.match(os,/function gameRibbonCard/);
  assert.match(os,/function gameFeaturedCard/);
  assert.match(os,/function openGame\(gameId\)/);
  assert.match(os,/function filterGames\(q\)/);
  assert.match(os,/function gameFolderOptions\(\)/);
  assert.match(os,/id="gamesFolderRail"/);
  assert.match(os,/function selectGameFolder\(folder\)/);
  assert.match(os,/function toggleGameFavorite\(event,id\)/);
  assert.doesNotMatch(os,/GENESIS CLOUD/);
  assert.match(os,/launchGenesisMiniFallback/);
});

test("DeactivateOS clearly lists active and deactivated Genesis IDs",()=>{
  assert.match(os,/id="genesisActiveIds"/);
  assert.match(os,/id="genesisInactiveIds"/);
  assert.match(os,/genesis_devices\?select=display_id,active,last_seen/);
  assert.match(os,/const activeText = active\.map/);
  assert.match(os,/const inactiveText = inactive\.map/);
  assert.match(os,/Deactivated — this ID cannot log in/);
});

test("Genesis branding keeps the requested fall Falcon through login, OS, and install",()=>{
  const install=readFileSync(new URL("../genesis-install.js",import.meta.url),"utf8");
  const installCss=readFileSync(new URL("../genesis-install.css",import.meta.url),"utf8");
  assert.match(login,/<link rel="icon" type="image\/png" href="assets\/icons\/genesis-fall\.png">/);
  assert.match(os,/<link rel="icon" type="image\/png" href="assets\/icons\/genesis-fall\.png">/);
  assert.match(install,/assets\/icons\/genesis-fall\.png/);
  assert.match(installCss,/\.genesis-install-symbol img/);
  assert.match(os,/class="watermark"[^>]*>OS<\/div>/);
  assert.match(os,/class="about-logo"><img src="assets\/icons\/genesis-fall\.png"/);
  assert.match(os,/class="logo"><img src="assets\/icons\/genesis-fall\.png"/);
  assert.doesNotMatch(os,/genesis\.svg/);
});

test("desktop folders persist app placement without expanding the dock",()=>{
  assert.match(os,/id="newFolderButton"/);
  assert.match(os,/id="desktopContextMenu"/);
  assert.match(os,/DESKTOP_FOLDERS_KEY="genesisDesktopFoldersV1"/);
  assert.match(os,/function createDesktopFolder\(/);
  assert.match(os,/function moveAppToFolder\(/);
  assert.match(os,/function openDesktopFolder\(/);
  assert.match(os,/function moveFolderAppsToDesktop\(/);
  assert.match(os,/Drag desktop apps here to keep them together/);
  assert.doesNotMatch(os,/data-dock-app="(?:genify|genflix)"/);
});

test("Genify and Genflix are desktop-only original app surfaces",()=>{
  assert.match(os,/data-app="genify"/);
  assert.match(os,/data-app="genflix"/);
  assert.match(os,/genify:\{title:"Genify",content:genifyHTML\}/);
  assert.match(os,/genflix:\{title:"Genflix",content:genflixHTML\}/);
  assert.match(os,/function genifyHTML\(/);
  assert.match(os,/function initGenify\(/);
  assert.match(os,/function genflixHTML\(/);
  assert.match(os,/function initGenflix\(/);
  assert.match(os,/Who is using this account\?/);
  assert.match(os,/GenyBoi/);
  assert.match(os,/Genesis presents/);
  assert.match(os,/genify-mark/);
  assert.doesNotMatch(os,/spotify\.com|netflix\.com/i);
});

test("Genesis intro uses the requested Falcon artwork and exact OS letterform",()=>{
  const favicon=readFileSync(new URL("../favicon.png",import.meta.url));
  const fall=readFileSync(new URL("../assets/icons/genesis-fall.png",import.meta.url));
  const fallOS=readFileSync(new URL("../assets/icons/genesis-fall-os.png",import.meta.url));
  assert.equal(
    createHash("sha256").update(favicon).digest("hex"),
    "4e882d83705ef81f98270f9d4506353056cd8ee29892d5f8594e492252294713",
    "the original Falcon logo file changed"
  );
  assert.equal(
    createHash("sha256").update(fall).digest("hex"),
    "d4e43029a3cba34002faa95e3ce2b4b3970e36dbc79f380ac629c127d71d0a0c",
    "the requested seasonal Falcon artwork changed"
  );
  assert.equal(
    createHash("sha256").update(fallOS).digest("hex"),
    "b4d1bba1060743b657a7186a263d379340bfcf962ec0ef39e29921ae10e72bac",
    "the extracted OS letterform changed"
  );
  assert.match(intro,/class="icon" src="assets\/icons\/genesis-fall\.png"/);
  assert.match(intro,/seasonal Falcon artwork/);
  assert.match(intro,/class="os-only" src="assets\/icons\/genesis-fall-os\.png"/);
  assert.doesNotMatch(intro,/assets\/icons\/genesis-192\.png/);
  assert.doesNotMatch(intro,/data:image\/png;base64/);
  assert.doesNotMatch(intro,/genesis-intro-state/);
  assert.match(intro,/location\.replace\("os\.html"\)/);
  assert.match(intro,/setTimeout\(finishIntro,9600\)/);
});

test("announcements can read directly when the optional RPC is absent",()=>{
  assert.match(announcements,/genesis_get_active_announcement/);
  assert.match(announcements,/genesis_announcements\?select=id,message,duration_ms,created_at/);
  assert.match(announcements,/return await latestFromTable\(\)/);
  assert.match(os,/Announcements/);
});

test("retired VM and Test apps are not loaded and About OS reports 1.232",()=>{
  const config=readFileSync(new URL("../supabase-config.js",import.meta.url),"utf8");
  assert.doesNotMatch(config,/genesis-vm\.js|genesis-test\.js|loadGenesisAdminVm|loadAdminTest/);
  assert.doesNotMatch(os,/data-app="(?:vm|test)"/i);
  assert.match(os,/Version 1\.232 · Glass Desktop Environment/);
  assert.match(os,/<span>OS<\/span><span>1\.232<\/span>/);
});


test("Genesis overhaul exposes Store themes account username and DNS settings",()=>{
  const overhaul = readFileSync(new URL("../genesis-overhaul.js",import.meta.url),"utf8");
  assert.match(os,/data-dock-app="store"/);
  assert.match(os,/genesis-overhaul\.js/);
  assert.match(overhaul,/Sunset/);
  assert.match(overhaul,/Chill/);
  assert.match(overhaul,/Halloween/);
  assert.match(overhaul,/theme-halloween/);
  assert.match(overhaul,/genesisUsername/);
  assert.match(overhaul,/cloudflare-dns\.com/);
  assert.match(overhaul,/dns\.google/);
  assert.match(overhaul,/quad9\.net/);
  assert.match(overhaul,/Wisp remains the actual web transport/);
});

test("Messages has Discord-style servers channels media and readable notifications",()=>{
  assert.match(messages,/createServerPrompt/);
  assert.match(messages,/createChannelPrompt/);
  assert.match(messages,/inviteToServerPrompt/);
  assert.match(messages,/server-message/);
  assert.match(messages,/server-sync/);
  assert.match(messages,/gmServerRail/);
  assert.match(messages,/gmImagePicker/);
  assert.match(messages,/sendGifPrompt/);
  assert.match(messages,/messagePreview/);
  assert.match(messages,/showMessageNotification/);
  assert.match(messages,/sender\+" · "\+context/);
});

test("Messages supports voice channels and customizable server metadata",()=>{
  assert.match(messages,/createVoiceChannelPrompt/);
  assert.match(messages,/joinVoice/);
  assert.match(messages,/leaveVoice/);
  assert.match(messages,/toggleVoiceMute/);
  assert.match(messages,/RTCPeerConnection/);
  assert.match(messages,/getUserMedia/);
  assert.match(messages,/voice-signal/);
  assert.match(messages,/openServerSettings/);
  assert.match(messages,/gmServerDescription/);
  assert.match(messages,/gmServerAccent/);

  const context={
    globalThis:null,
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    sessionStorage:{getItem(){return null}},
    crypto:{randomUUID(){return "test-id"}}
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(messages,context,{filename:"genesis-messages.js"});
  const helpers=context.GenesisMessages.__test;
  assert.equal(helpers.voiceTopic("s-demo","voice-lounge"),"genesis-voice-s-demo-voice-lounge");
  const normalized=helpers.normalizeServer({
    id:"s-demo",name:"Study Hub",owner:"527",members:["527"],
    description:"Homework and games",icon:"✨",accent:"cyan",
    channels:[{id:"general",name:"general",type:"text"},{id:"voice-lounge",name:"lounge",type:"voice"}]
  });
  assert.equal(normalized.description,"Homework and games");
  assert.equal(normalized.icon,"✨");
  assert.equal(normalized.accent,"cyan");
  assert.equal(normalized.channels[1].type,"voice");
});

test("Messages notification previews preserve actual message text",()=>{
  const context={
    globalThis:null,
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    sessionStorage:{getItem(){return null}},
    crypto:{randomUUID(){return "test-id"}}
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(messages,context,{filename:"genesis-messages.js"});
  const helpers=context.GenesisMessages.__test;
  assert.equal(helpers.messagePreview("hey are you joining?"),"hey are you joining?");
  assert.equal(helpers.messagePreview("",{type:"image",url:"https://example.com/a.png"}),"sent an image");
  assert.equal(helpers.channelSlug(" General Chat! "),"general-chat");
});

test("first-use app tours are wired with the original Genesis intro",()=>{
  const tour=readFileSync(new URL("../genesis-app-tour.js",import.meta.url),"utf8");
  const intro=readFileSync(new URL("../intro.html",import.meta.url),"utf8");
  assert.match(os,/genesis-app-tour\.js/);
  assert.match(os,/GenesisAppTour\?\.show\(appId\)/);
  assert.match(tour,/genesisAppTourSeen:/);
  assert.match(tour,/QUICK TOUR/);
  assert.match(intro,/class="stage"/);
  assert.match(intro,/Genesis OS startup/);
  assert.match(intro,/class="logo-wrap"/);
  assert.doesNotMatch(intro,/intro-card|Skip intro/);
  assert.doesNotMatch(intro,/showcaseAudio/);
});
