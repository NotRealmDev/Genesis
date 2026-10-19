import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../genesis-gpt.js",import.meta.url),"utf8");

test("GPT awaits owner setup without credentials or network requests",()=>{
  const storage=new Map();
  const context={
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    window:null,
    fetch:async()=>{throw Error("not called by the markup test")}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"genesis-gpt.js"});
  const markup=context.GenesisGPT.html();
  assert.match(markup,/class="gpt-app"/);
  assert.match(markup,/Setup pending/);
  assert.match(markup,/textarea[^>]*disabled/);
  assert.doesNotMatch(markup,/type="password"|API settings|save-shared/);
  assert.doesNotMatch(markup,/iframe|chatgpt\.com|claude\.ai|gemini\.google/);
  storage.set("genesisGPTApiKeySession","obsolete-fixture-key");
  const form={};
  const win={isConnected:true,querySelector:()=>form};
  context.GenesisGPT.init(win);
  assert.equal(storage.has("genesisGPTApiKeySession"),false);
  let prevented=false;
  form.onsubmit({preventDefault(){prevented=true}});
  assert.equal(prevented,true);
  context.GenesisGPT.close(win);
});
