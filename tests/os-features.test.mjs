import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const os = readFileSync(new URL("../os.html",import.meta.url),"utf8");
const login = readFileSync(new URL("../index.html",import.meta.url),"utf8");
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
