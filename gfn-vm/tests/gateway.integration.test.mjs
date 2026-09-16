import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayPath=path.resolve(here,"../server.mjs");
const secret="integration-secret-abcdefghijklmnopqrstuvwxyz-0123456789";

function listen(server){
  return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve(server.address().port)));
}
function close(server){return new Promise(resolve=>server.close(()=>resolve()));}
function waitForLine(child,needle,timeout=8000){
  return new Promise((resolve,reject)=>{
    let text="";
    const timer=setTimeout(()=>reject(new Error(`Timed out waiting for ${needle}; output=${text}`)),timeout);
    const onData=chunk=>{
      text+=String(chunk);
      if(text.includes(needle)){
        clearTimeout(timer);
        child.stdout.off("data",onData);
        resolve(text);
      }
    };
    child.stdout.on("data",onData);
    child.stderr.on("data",chunk=>{text+=String(chunk)});
  });
}

test("gateway authenticates Genesis admin, exchanges a short-lived link, and proxies Selkies",async()=>{
  const supabase=http.createServer((req,res)=>{
    if(req.url==="/auth/v1/user" && req.headers.authorization==="Bearer good-token"){
      res.writeHead(200,{"Content-Type":"application/json"});
      return res.end(JSON.stringify({email:"admin@example.com"}));
    }
    res.writeHead(401,{"Content-Type":"application/json"});res.end("{}");
  });
  const selkies=http.createServer((req,res)=>{
    res.writeHead(200,{"Content-Type":"text/plain"});
    res.end("SELKIES_OK");
  });
  const supabasePort=await listen(supabase);
  const selkiesPort=await listen(selkies);

  const probe=http.createServer();
  const gatewayPort=await listen(probe);await close(probe);
  const publicOrigin=`http://127.0.0.1:${gatewayPort}`;
  const child=spawn(process.execPath,[gatewayPath],{
    env:{...process.env,
      PORT:String(gatewayPort),
      SELKIES_TARGET:`http://127.0.0.1:${selkiesPort}`,
      SUPABASE_URL:`http://127.0.0.1:${supabasePort}`,
      SUPABASE_ANON_KEY:"anon-test-key",
      GENESIS_ADMIN_EMAIL:"admin@example.com",
      GENESIS_ORIGIN:"https://genesisos.lol",
      VM_PUBLIC_ORIGIN:publicOrigin,
      SESSION_SECRET:secret
    },stdio:["ignore","pipe","pipe"]
  });

  try{
    await waitForLine(child,"gateway listening");

    const badOrigin=await fetch(`${publicOrigin}/api/session`,{method:"POST",headers:{Origin:"https://evil.example",Authorization:"Bearer good-token","Content-Type":"application/json"},body:"{}"});
    assert.equal(badOrigin.status,403);

    const badUser=await fetch(`${publicOrigin}/api/session`,{method:"POST",headers:{Origin:"https://genesisos.lol",Authorization:"Bearer bad-token","Content-Type":"application/json"},body:"{}"});
    assert.equal(badUser.status,403);

    const session=await fetch(`${publicOrigin}/api/session`,{method:"POST",headers:{Origin:"https://genesisos.lol",Authorization:"Bearer good-token","Content-Type":"application/json"},body:JSON.stringify({app:"Genesis VM"})});
    assert.equal(session.status,200);
    assert.equal(session.headers.get("access-control-allow-origin"),"https://genesisos.lol");
    const data=await session.json();
    assert.match(data.viewerUrl,/\/view\?token=/);
    assert.equal(data.app,"GeForce NOW");

    const viewUrl=new URL(data.viewerUrl);
    viewUrl.host=`127.0.0.1:${gatewayPort}`;
    viewUrl.protocol="http:";
    const exchange=await fetch(viewUrl,{redirect:"manual"});
    assert.equal(exchange.status,302);
    assert.equal(exchange.headers.get("location"),"/");
    const cookie=exchange.headers.get("set-cookie");
    assert.match(cookie,/genesis_gfn_session=/);

    const cookiePair=cookie.split(";",1)[0];
    const proxied=await fetch(`${publicOrigin}/`,{headers:{Cookie:cookiePair}});
    assert.equal(proxied.status,200);
    assert.equal(await proxied.text(),"SELKIES_OK");

    // Exercise the authenticated proxy repeatedly to catch state/cookie flakiness.
    for(let i=0;i<20;i++){
      const response=await fetch(`${publicOrigin}/repeat-${i}`,{headers:{Cookie:cookiePair}});
      assert.equal(response.status,200);
      assert.equal(await response.text(),"SELKIES_OK");
    }
  }finally{
    child.kill("SIGTERM");
    await Promise.all([close(supabase),close(selkies)]);
  }
});
