import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../genesis-announcements.js",import.meta.url),"utf8");

test("announcements use one shared live channel for every client",()=>{
  assert.match(source,/genesis-global-announcements-v1/);
  assert.match(source,/\.on\("broadcast",\{event:EVENT_NAME\},receiveRealtime\)/);
  assert.match(source,/outgoing\.httpSend\(EVENT_NAME,announcement\)/);
});

test("the shared sender pairs durable storage with realtime delivery",()=>{
  assert.match(source,/rpc\("genesis_send_announcement"/);
  assert.match(source,/sentLive = await broadcast\(/);
  assert.match(source,/window\.sendGenesisAnnouncement = sendGlobalAnnouncement/);
  assert.match(source,/setTimeout\(poll,250\)/);
});
