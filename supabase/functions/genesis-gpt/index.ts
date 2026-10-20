// Genesis GPT secured Supabase Edge Function.
// OPENAI_API_KEY is an Edge Function secret. Never put it in web assets or tables.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://genesisoss.lol",
  "https://www.genesisoss.lol",
  "https://notrealmdev.github.io"
]);
const allowHeaders = "authorization, apikey, content-type, x-client-info";
const maxInputChars = 20000;

function respond(body: unknown, status: number, origin: string | null) {
  const headers: Record<string,string> = {"content-type":"application/json","cache-control":"no-store"};
  if(origin && allowedOrigins.has(origin)){
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = allowHeaders;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["vary"] = "Origin";
  }
  return new Response(JSON.stringify(body),{status,headers});
}
function supabaseEnvKey(name: string, jsonName: string): string {
  const legacy = Deno.env.get(name);
  if(legacy)return legacy;
  try{return JSON.parse(Deno.env.get(jsonName)||"{}").default||""}catch{return ""}
}
function outputText(data: Record<string,unknown>): string {
  if(typeof data.output_text==="string")return data.output_text.trim();
  const output=Array.isArray(data.output)?data.output:[];
  return output.flatMap((item)=>{
    const content=item && typeof item==="object" && "content" in item ? item.content : [];
    return Array.isArray(content) ? content.filter((p)=>p && typeof p==="object" && typeof p.text==="string").map((p)=>p.text) : [];
  }).join("").trim();
}

Deno.serve(async(request)=>{
  const origin=request.headers.get("origin");
  if(origin && !allowedOrigins.has(origin))return respond({error:{message:"Origin not allowed."}},403,null);
  if(request.method==="OPTIONS")return new Response(null,{
    status:204,
    headers:{"access-control-allow-origin":origin||"null","access-control-allow-headers":allowHeaders,"access-control-allow-methods":"POST, OPTIONS","vary":"Origin"}
  });
  if(request.method!=="POST")return respond({error:{message:"Method not allowed."}},405,origin);

  const jwt=request.headers.get("authorization")?.replace(/^Bearer /i,"").trim()||"";
  if(!jwt)return respond({error:{message:"Sign in is required."}},401,origin);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const publishable=supabaseEnvKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey=supabaseEnvKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!publishable||!serviceKey||!apiKey)return respond({error:{message:"GPT service is not configured."}},503,origin);

  // Never trust client-side Genesis IDs or roles. Validate Supabase-issued JWT.
  const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await authClient.auth.getUser(jwt);
  const adminEmail=(Deno.env.get("GENESIS_GPT_ADMIN_EMAIL")||"admin@genesisos.lol").toLowerCase();
  if(authError||!user)return respond({error:{message:"Invalid or expired sign-in."}},401,origin);
  if(user.email?.toLowerCase()!==adminEmail)return respond({error:{message:"GPT access is not enabled for this account."}},403,origin);

  // Atomic database-backed rate limiting. If the quota check fails, deny access.
  const serverClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:allowed,error:quotaError}=await serverClient.rpc("genesis_gpt_consume_quota",{p_user_id:user.id});
  if(quotaError)return respond({error:{message:"GPT usage protection is unavailable."}},503,origin);
  if(allowed!==true)return respond({error:{message:"GPT request limit reached (30 per hour)."}},429,origin);

  let input:unknown;
  try{
    const raw=await request.text();
    if(raw.length>maxInputChars)return respond({error:{message:"Conversation is too long."}},413,origin);
    input=JSON.parse(raw);
  }catch{return respond({error:{message:"Invalid request JSON."}},400,origin)}
  const messages= input&&typeof input==="object"&&"messages" in input?input.messages:null;
  if(!Array.isArray(messages)||!messages.length||messages.length>12)return respond({error:{message:"Invalid conversation."}},400,origin);
  const valid=messages.every(m=>m&&typeof m==="object"&&(m.role==="user"||m.role==="assistant")&&typeof m.text==="string"&&m.text.length<=8000);
  if(!valid||messages[messages.length-1].role!=="user")return respond({error:{message:"Invalid conversation messages."}},400,origin);
  const formatted=messages.map(m=>({role:m.role,content:m.text}));

  try{
    const upstream=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"content-type":"application/json","authorization":"Bearer "+apiKey},
      body:JSON.stringify({model:Deno.env.get("GENESIS_GPT_MODEL")||"gpt-5-mini",input:formatted,store:false,max_output_tokens:1200}),
      signal:AbortSignal.timeout(30000)
    });
    if(!upstream.ok)return respond({error:{message:"OpenAI request failed (HTTP "+upstream.status+")."}},502,origin);
    const result=await upstream.json();
    const text=outputText(result);
    if(!text)return respond({error:{message:"OpenAI returned no text."}},502,origin);
    return respond({output_text:text},200,origin);
  }catch{
    return respond({error:{message:"GPT service could not complete this request."}},502,origin);
  }
});
