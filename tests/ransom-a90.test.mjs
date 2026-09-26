import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const config=readFileSync(new URL("../supabase-config.js",import.meta.url),"utf8");
const patch=readFileSync(new URL("../genesis-ransom-a90.js",import.meta.url),"utf8");
const data=readFileSync(new URL("../assets/ransom/a90-jumps.b64",import.meta.url),"utf8").trim();

test("A-90 override loads before the RANSOM event",()=>{
  assert.match(config,/genesis-ransom-a90\.js\?build=a90-r1/);
  assert.match(config,/onload/);
  assert.match(config,/genesis-ransom-easter\.js\?build=ransom-event-r5/);
  assert.ok(config.indexOf("genesis-ransom-a90.js")<config.indexOf("genesis-ransom-easter.js"));
});

test("failure jumpscare is the supplied muted A-90 clip",()=>{
  assert.match(patch,/ransom-jumpscare-video/);
  assert.match(patch,/assets\\/ransom\\/jumpscare\\.mp4/);
  assert.match(patch,/assets\/ransom\/a90-jumps\.b64/);
  assert.match(patch,/this\.muted=true/);
  assert.match(patch,/data:video\/mp4;base64/);
  assert.ok(data.length>16_000,"A-90 video payload should be present");
  assert.match(data,/^AAAAIGZ0eXB/);
});
