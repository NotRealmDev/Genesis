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
