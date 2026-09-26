import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const config=readFileSync(new URL("../supabase-config.js",import.meta.url),"utf8");
const egg=readFileSync(new URL("../genesis-ransom-easter.js",import.meta.url),"utf8");

test("RANSOM Easter egg loads only on the login page",()=>{
  assert.match(config,/genesis-ransom-easter\.js/);
  assert.match(config,/index\\\.html/);
});

test("RANSOM credentials trigger the hidden sequence",()=>{
  assert.match(egg,/username===\"ransom\"&&password===\"ransom\"/);
  assert.match(egg,/stopImmediatePropagation/);
  assert.match(egg,/GenesisRansomEaster/);
});

test("Easter egg uses the requested source footage and original audio",()=>{
  assert.match(egg,/F3k-Rv9Bje8/);
  assert.match(egg,/Ih67uamFYNs/);
  assert.match(egg,/FIRST_START_SECONDS=45/);
  assert.match(egg,/TAPE_ZERO_DURATION_MS=12150/);
  assert.match(egg,/youtube-nocookie\.com\/embed/);
  assert.match(egg,/allow=\"autoplay/);
});
