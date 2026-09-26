import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const config=readFileSync(new URL("../supabase-config.js",import.meta.url),"utf8");
const egg=readFileSync(new URL("../genesis-ransom-easter.js",import.meta.url),"utf8");

test("RANSOM Easter egg loads on login and OS",()=>{
  assert.match(config,/genesis-ransom-easter\.js\?build=ransom-event-r2/);
  assert.match(config,/const isLogin=/);
  assert.match(config,/const isOS=/);
  assert.match(config,/isLogin\|\|isOS/);
});

test("RANSOM credentials trigger Tape Zero before entering the OS",()=>{
  assert.match(egg,/username===\"ransom\"&&password===\"ransom\"/);
  assert.match(egg,/TAPE_ZERO_VIDEO_ID=\"Ih67uamFYNs\"/);
  assert.match(egg,/INTRO_DURATION_MS=12150/);
  assert.match(egg,/enterRansomOS/);
  assert.match(egg,/os\.html\?ransomEvent=1/);
  assert.match(egg,/stopImmediatePropagation/);
});

test("RANSOM OS event locks apps and runs a one-minute 500 coin hunt",()=>{
  assert.match(egg,/GAME_DURATION_MS=60000/);
  assert.match(egg,/COIN_VALUE=100/);
  assert.match(egg,/TARGET_COINS=500/);
  assert.match(egg,/ransom-lock-symbol/);
  assert.match(egg,/ransom-chaos-window/);
  assert.match(egg,/ransom-coin/);
  assert.match(egg,/genesis-ransom-event-running/);
  assert.match(egg,/YOUR FILES/);
  assert.match(egg,/COLLECT 500 COINS BEFORE TIME EXPIRES/);
});

test("RANSOM event preserves the requested source audio and failure jumpscare audio",()=>{
  assert.match(egg,/RECREATED_VIDEO_ID=\"F3k-Rv9Bje8\"/);
  assert.match(egg,/startEventAudio/);
  assert.match(egg,/JUMP_AUDIO_DATA=\"data:audio\/mpeg;base64,/);
  assert.match(egg,/ransom-jumpscare/);
  assert.match(egg,/ransomJumpAudio/);
});

test("RANSOM success shows thank-you screen, logs out, and unlocks Glitch Shop",()=>{
  assert.match(egg,/THANK YOU!/);
  assert.match(egg,/genesisGlitchUnlocked/);
  assert.match(egg,/forceLogout/);
  assert.match(egg,/openGlitchShop/);
  assert.match(egg,/Glitch Shop/);
  assert.match(egg,/RANSOM \/\/ REDSHIFT/);
  assert.match(egg,/genesis-glitch-theme/);
  assert.match(egg,/APPLY GLITCH THEME/);
  assert.match(egg,/RESTORE NORMAL/);
});

test("RANSOM event remains a UI simulation rather than file-system behavior",()=>{
  assert.doesNotMatch(egg,/FileSystemHandle|showDirectoryPicker|showSaveFilePicker|indexedDB\.deleteDatabase/);
  assert.doesNotMatch(egg,/crypto\.subtle\.encrypt|rmSync|unlinkSync|writeFileSync/);
});
