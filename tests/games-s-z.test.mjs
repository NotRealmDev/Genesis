import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const catalogSource=readFileSync(new URL("../games-s-z.js",import.meta.url),"utf8");
const osSource=readFileSync(new URL("../os.html",import.meta.url),"utf8");
const context={};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(catalogSource,context,{filename:"games-s-z.js"});
const catalog=context.GENESIS_GAME_CATALOG_T_Z;

test("T-Z game shard mirrors the Google Doc catalog",()=>{
  assert.equal(catalog.games.length,126);
  assert.deepEqual([...new Set(catalog.games.map(game=>game.section))],["T","U","V","W","X","Y","Z"]);
  assert.equal(new Set(catalog.games.map(game=>game.id)).size,catalog.games.length);
  assert.equal(new Set(catalog.games.map(game=>game.file)).size,catalog.games.length);
  assert.equal(catalog.sourceRepository,"seanstonator-lang/UGS-Web-Hub");
  assert.match(catalog.sourceCommit,/^[0-9a-f]{40}$/);
  assert.equal(catalog.fallbackFiles.length,18);
  assert.deepEqual(
    catalog.games.filter(game=>game.fallback).map(game=>game.file),
    catalog.fallbackFiles
  );
  for(const game of catalog.games){
    assert.match(game.id,/^ugs-doc-/);
    assert.match(game.file,/^[^/]+\.html$/);
    assert.match(game.section,/^[T-Z]$/);
    assert.equal(typeof game.fallback,"boolean");
  }
});

test("Games app wires S-Z entries and a playable local fallback",()=>{
  assert.match(osSource,/games-s-z\.js/);
  assert.match(osSource,/GENESIS_GAME_CATALOG_T_Z\?\.games/);
  assert.match(osSource,/if\(entry && entry\.src\)/);
  assert.match(osSource,/Online version unavailable · starting Genesis Mini version/);
  assert.match(osSource,/function launchGenesisMiniFallback\(game, frame, loader\)/);
  assert.match(osSource,/\/gh\/bubbls\/UGS-Assets/);
});
