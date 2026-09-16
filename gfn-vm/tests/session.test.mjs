import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {originAllowed, parseCookies, signToken, verifyToken} from "../lib.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,"../..");
const secret="test-secret-abcdefghijklmnopqrstuvwxyz-0123456789";

test("signed VM session tokens survive repeated verification and reject tampering",()=>{
  for(let i=0;i<100;i++){
    const token=signToken({type:"session",id:`s${i}`,email:"admin@example.com"},secret,60000);
    const parsed=verifyToken(token,secret,"session");
    assert.equal(parsed?.id,`s${i}`);
    assert.equal(parsed?.email,"admin@example.com");
    assert.equal(verifyToken(token+"x",secret,"session"),null);
    assert.equal(verifyToken(token,secret,"launch"),null);
  }
});

test("expired VM tokens are rejected",async()=>{
  const token=signToken({type:"launch",id:"short"},secret,1000);
  const parts=token.split(".");
  const payload=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
  payload.exp=Date.now()-1;
  const modified=Buffer.from(JSON.stringify(payload)).toString("base64url")+"."+parts[1];
  assert.equal(verifyToken(modified,secret,"launch"),null);
});

test("cookie parser handles encoded VM session cookies",()=>{
  const cookies=parseCookies("a=1; genesis_gfn_session=abc%2Edef; theme=dark");
  assert.equal(cookies.genesis_gfn_session,"abc.def");
  assert.equal(cookies.theme,"dark");
});

test("Genesis origin matching is exact",()=>{
  assert.equal(originAllowed("https://genesisos.lol","https://genesisos.lol"),true);
  assert.equal(originAllowed("https://evil.example","https://genesisos.lol"),false);
  assert.equal(originAllowed("https://genesisos.lol.evil.example","https://genesisos.lol"),false);
});

test("client is configured for Genesis Host, not Switchboard",()=>{
  const config=fs.readFileSync(path.join(repo,"supabase-config.js"),"utf8");
  assert.match(config,/provider:\s*["']Genesis Host["']/);
  assert.match(config,/mode:\s*["']host["']/);
  assert.match(config,/genesis-host-vm\.js/);
  assert.match(config,/displayMode:\s*["']embed["']/);
  assert.doesNotMatch(config,/os\.switchboard\.computer/i);
});

test("legacy cloud appliance still uses NVIDIA official GeForce NOW Flatpak",()=>{
  const install=fs.readFileSync(path.join(repo,"gfn-vm/install.sh"),"utf8");
  assert.match(install,/international\.download\.nvidia\.com\/GFNLinux\/flatpak\/geforcenow\.flatpakrepo/);
  assert.match(install,/com\.nvidia\.geforcenow/);
  assert.match(install,/Ubuntu 24\.04/);
  assert.match(install,/580\.126\.07/);
});

test("legacy cloud gateway never contains a Supabase service-role secret",()=>{
  const server=fs.readFileSync(path.join(repo,"gfn-vm/server.mjs"),"utf8");
  assert.doesNotMatch(server,/service[_-]?role/i);
  assert.match(server,/GENESIS_ADMIN_EMAIL/);
  assert.match(server,/originAllowed/);
});