import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const configSource=readFileSync(new URL("../supabase-config.js",import.meta.url),"utf8");
const url=configSource.match(/url:\s*"([^"]+)"/)?.[1];
const key=configSource.match(/anonKey:\s*"([^"]+)"/)?.[1];
assert.ok(url && key,"Genesis backend configuration is missing");

const announcementResponse=await fetch(
  `${url}/rest/v1/genesis_announcements?select=id,message,duration_ms,created_at&order=created_at.desc&limit=1`,
  {headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(20000)}
);
assert.equal(announcementResponse.ok,true,`announcement read returned HTTP ${announcementResponse.status}`);
assert.ok(Array.isArray(await announcementResponse.json()),"announcement read did not return an array");

const sdkUrl="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js";
const sdkResponse=await fetch(sdkUrl,{signal:AbortSignal.timeout(30000)});
assert.equal(sdkResponse.ok,true,`Supabase browser SDK returned HTTP ${sdkResponse.status}`);
const sdkSource=await sdkResponse.text();

const context={
  console,fetch,Headers,Request,Response,URL,URLSearchParams,WebSocket,AbortController,
  setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,crypto,
  localStorage:{getItem(){return null},setItem(){},removeItem(){}}
};
context.globalThis=context;
context.self=context;
context.window=context;
vm.createContext(context);
vm.runInContext(sdkSource,context,{filename:"supabase.min.js"});
assert.equal(typeof context.supabase?.createClient,"function","Supabase browser SDK did not initialize");

const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const receiver=context.supabase.createClient(url,key,clientOptions);
const sender=context.supabase.createClient(url,key,clientOptions);
const nonce=crypto.randomUUID();
const topic=`genesis-live-test-${Date.now()}-${nonce.slice(0,8)}`;

let receiveResolve;
let receiveReject;
const received=new Promise((resolve,reject)=>{receiveResolve=resolve;receiveReject=reject;});
const timeout=setTimeout(()=>receiveReject(new Error("Realtime Broadcast test timed out")),20000);
const channel=receiver
  .channel(topic)
  .on("broadcast",{event:"message"},({payload})=>receiveResolve(payload));

try{
  await new Promise((resolve,reject)=>{
    channel.subscribe(status=>{
      if(status==="SUBSCRIBED") resolve();
      if(status==="CHANNEL_ERROR" || status==="TIMED_OUT") reject(new Error(`Realtime subscription ${status}`));
    });
  });
  const outbound=sender.channel(topic);
  assert.equal(typeof outbound.httpSend,"function","Realtime HTTP Broadcast is unavailable");
  const sendResult=await outbound.httpSend("message",{nonce,text:"Genesis live messaging test"});
  assert.notEqual(sendResult?.success,false,"Realtime server rejected the message");
  const payload=await received;
  assert.equal(payload?.nonce,nonce,"Realtime delivered the wrong payload");
  await sender.removeChannel(outbound);
}finally{
  clearTimeout(timeout);
  await Promise.allSettled([receiver.removeAllChannels(),sender.removeAllChannels()]);
}

console.log(JSON.stringify({announcementRead:true,realtimeBroadcast:true,sdk:"2.116.0"},null,2));
process.exit(0);
