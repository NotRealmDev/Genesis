import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../genesis-gpt.js",import.meta.url),"utf8");

test("GPT is a native API surface instead of a website frame",()=>{
  const storage=new Map();
  const context={
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    window:null,
    fetch:async()=>{throw Error("not called by the markup test")}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"genesis-gpt.js"});
  const markup=context.GenesisGPT.html();
  assert.match(markup,/class="gpt-app"/);
  assert.match(markup,/ChatGPT API/);
  assert.match(markup,/class="gpt-key"/);
  assert.doesNotMatch(markup,/iframe|chatgpt\.com|claude\.ai|gemini\.google/);
});
