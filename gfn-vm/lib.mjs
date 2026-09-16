import crypto from "node:crypto";

const encoder = new TextEncoder();

export function base64url(value){
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

export function hmac(value, secret){
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function signToken(payload, secret, ttlMs=120000){
  if(!secret || String(secret).length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const now = Date.now();
  const body = {
    ...payload,
    iat: now,
    exp: now + Math.max(1000, Number(ttlMs) || 120000)
  };
  const encoded = base64url(body);
  return `${encoded}.${hmac(encoded, secret)}`;
}

export function verifyToken(token, secret, expectedType=""){
  try{
    const [encoded, supplied] = String(token||"").split(".");
    if(!encoded || !supplied) return null;
    const expected = hmac(encoded, secret);
    const a = encoder.encode(supplied);
    const b = encoder.encode(expected);
    if(a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
    const payload = JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));
    if(!payload || typeof payload !== "object") return null;
    if(!Number.isFinite(payload.exp) || Date.now() >= payload.exp) return null;
    if(expectedType && payload.type !== expectedType) return null;
    return payload;
  }catch{return null;}
}

export function parseCookies(header=""){
  const out={};
  for(const part of String(header||"").split(";")){
    const index=part.indexOf("=");
    if(index<1) continue;
    const key=part.slice(0,index).trim();
    const value=part.slice(index+1).trim();
    if(!key) continue;
    try{out[key]=decodeURIComponent(value)}catch{out[key]=value}
  }
  return out;
}

export function normalizeOrigin(value){
  try{
    const url=new URL(String(value||"").trim());
    if(url.protocol!=="https:" && url.protocol!=="http:") return "";
    return url.origin;
  }catch{return "";}
}

export function originAllowed(origin, allowedOrigin){
  const a=normalizeOrigin(origin), b=normalizeOrigin(allowedOrigin);
  return !!(a && b && a===b);
}

export function secureRandomId(bytes=18){
  return crypto.randomBytes(bytes).toString("base64url");
}
