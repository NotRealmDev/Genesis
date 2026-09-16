import http from "node:http";
import httpProxy from "http-proxy";
import {originAllowed, parseCookies, secureRandomId, signToken, verifyToken} from "./lib.mjs";

const PORT=Number(process.env.PORT||3000);
const SELKIES_TARGET=process.env.SELKIES_TARGET||"http://127.0.0.1:8080";
const SUPABASE_URL=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const SUPABASE_ANON_KEY=String(process.env.SUPABASE_ANON_KEY||"");
const GENESIS_ADMIN_EMAIL=String(process.env.GENESIS_ADMIN_EMAIL||"").trim().toLowerCase();
const GENESIS_ORIGIN=String(process.env.GENESIS_ORIGIN||"").trim();
const VM_PUBLIC_ORIGIN=String(process.env.VM_PUBLIC_ORIGIN||"").replace(/\/$/,"");
const SESSION_SECRET=String(process.env.SESSION_SECRET||"");
const COOKIE_NAME="genesis_gfn_session";

for(const [name,value] of Object.entries({SUPABASE_URL,SUPABASE_ANON_KEY,GENESIS_ADMIN_EMAIL,GENESIS_ORIGIN,VM_PUBLIC_ORIGIN,SESSION_SECRET})){
  if(!value) throw new Error(`Missing required environment variable: ${name}`);
}
if(SESSION_SECRET.length<32) throw new Error("SESSION_SECRET must be at least 32 characters");

const proxy=httpProxy.createProxyServer({target:SELKIES_TARGET,ws:true,xfwd:true,changeOrigin:false});
proxy.on("error",(error,req,res)=>{
  console.error("Selkies proxy error:",error?.message||error);
  if(res && !res.headersSent){
    res.writeHead(502,{"Content-Type":"text/plain; charset=utf-8"});
    res.end("Genesis GFN VM display is temporarily unavailable.");
  }
});

function sendJson(res,status,value,extra={}){
  const body=JSON.stringify(value);
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body),"Cache-Control":"no-store",...extra});
  res.end(body);
}

function corsHeaders(req){
  const origin=String(req.headers.origin||"");
  if(originAllowed(origin,GENESIS_ORIGIN)){
    return {
      "Access-Control-Allow-Origin":origin,
      "Vary":"Origin",
      "Access-Control-Allow-Headers":"Authorization, Content-Type, apikey",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Max-Age":"600"
    };
  }
  return {};
}

async function readBody(req,limit=64*1024){
  let total=0;const chunks=[];
  for await(const chunk of req){
    total+=chunk.length;
    if(total>limit) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if(!chunks.length)return{};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function supabaseUser(accessToken){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
      headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${accessToken}`},
      cache:"no-store",signal:controller.signal
    });
    if(!response.ok)return null;
    return await response.json();
  }catch{return null;}finally{clearTimeout(timeout)}
}

async function isSelkiesHealthy(){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(SELKIES_TARGET,{method:"GET",redirect:"manual",signal:controller.signal});
    return response.status>0 && response.status<500;
  }catch{return false;}finally{clearTimeout(timeout)}
}

function viewerSession(req){
  const cookies=parseCookies(req.headers.cookie||"");
  return verifyToken(cookies[COOKIE_NAME],SESSION_SECRET,"session");
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||"/",VM_PUBLIC_ORIGIN);

  if(url.pathname==="/health"){
    const display=await isSelkiesHealthy();
    return sendJson(res,display?200:503,{ok:display,service:"Genesis GFN VM",display});
  }

  if(url.pathname==="/api/session"){
    const cors=corsHeaders(req);
    if(req.method==="OPTIONS"){
      if(!originAllowed(req.headers.origin,GENESIS_ORIGIN))return sendJson(res,403,{error:"origin_not_allowed"});
      res.writeHead(204,cors);return res.end();
    }
    if(req.method!=="POST")return sendJson(res,405,{error:"method_not_allowed"},cors);
    if(!originAllowed(req.headers.origin,GENESIS_ORIGIN))return sendJson(res,403,{error:"origin_not_allowed"},cors);

    const auth=String(req.headers.authorization||"");
    const accessToken=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
    if(!accessToken)return sendJson(res,401,{error:"missing_admin_session"},cors);

    const user=await supabaseUser(accessToken);
    const email=String(user?.email||"").trim().toLowerCase();
    if(!email || email!==GENESIS_ADMIN_EMAIL)return sendJson(res,403,{error:"admin_required"},cors);

    try{await readBody(req)}catch(error){return sendJson(res,400,{error:"invalid_request",message:error.message},cors)}

    const id=secureRandomId(12);
    const expiresAt=Date.now()+120000;
    const launch=signToken({type:"launch",id,email},SESSION_SECRET,120000);
    return sendJson(res,200,{
      url:`${VM_PUBLIC_ORIGIN}/view?token=${encodeURIComponent(launch)}`,
      viewerUrl:`${VM_PUBLIC_ORIGIN}/view?token=${encodeURIComponent(launch)}`,
      sessionId:id,
      expiresAt:new Date(expiresAt).toISOString(),
      app:"GeForce NOW"
    },cors);
  }

  if(url.pathname==="/view"){
    if(req.method!=="GET")return sendJson(res,405,{error:"method_not_allowed"});
    const launch=verifyToken(url.searchParams.get("token"),SESSION_SECRET,"launch");
    if(!launch){
      res.writeHead(401,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
      return res.end("<!doctype html><title>Genesis GFN VM</title><body style='background:#05070c;color:white;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0'><div>Session link expired. Reopen VM from Genesis.</div></body>");
    }
    const session=signToken({type:"session",id:launch.id,email:launch.email},SESSION_SECRET,12*60*60*1000);
    res.writeHead(302,{
      "Location":"/",
      "Cache-Control":"no-store",
      "Set-Cookie":`${COOKIE_NAME}=${encodeURIComponent(session)}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`
    });
    return res.end();
  }

  const session=viewerSession(req);
  if(!session){
    res.writeHead(401,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
    return res.end("<!doctype html><title>Genesis GFN VM</title><body style='background:#05070c;color:white;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center'><h2>Genesis GFN VM</h2><p>Open this VM from the Genesis Admin desktop.</p></div></body>");
  }

  proxy.web(req,res,{target:SELKIES_TARGET});
});

server.on("upgrade",(req,socket,head)=>{
  const session=viewerSession(req);
  if(!session){
    try{socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n")}catch{}
    return socket.destroy();
  }
  proxy.ws(req,socket,head,{target:SELKIES_TARGET});
});

server.listen(PORT,"127.0.0.1",()=>{
  console.log(`Genesis GFN VM gateway listening on 127.0.0.1:${PORT}`);
});
