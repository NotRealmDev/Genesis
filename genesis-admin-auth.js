(function(global){
  "use strict";

  const SESSION_KEY="genesisAdminSession";
  const DEFAULT_ADMIN_EMAIL="admin@genesisos.lol";
  let promptPromise=null;
  let loginBusy=false;

  function backend(){
    const value=global.GENESIS_BACKEND||{};
    if(!/^https:\/\/.+\.supabase\.co$/i.test(String(value.url||"")))return null;
    if(String(value.anonKey||"").length<20)return null;
    return value;
  }

  function adminEmail(){
    return String(backend()?.adminEmail||DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  }

  function readSession(){
    try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch{return null}
  }

  function saveSession(data){
    const session={
      access_token:String(data?.access_token||""),
      refresh_token:String(data?.refresh_token||""),
      expires_at:Date.now()+((Number(data?.expires_in)||3600)*1000)
    };
    if(!session.access_token||!session.refresh_token)throw new Error("Admin authentication did not return a complete session.");
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    return session.access_token;
  }

  async function authRequest(grantType,body){
    const config=backend();
    if(!config)throw new Error("Genesis admin authentication is not configured.");
    const response=await fetch(`${config.url}/auth/v1/token?grant_type=${encodeURIComponent(grantType)}`,{
      method:"POST",
      headers:{"apikey":config.anonKey,"Content-Type":"application/json"},
      body:JSON.stringify(body||{}),
      cache:"no-store"
    });
    let data={};
    try{data=await response.json()}catch{}
    if(!response.ok||!data?.access_token){
      throw new Error(data?.error_description||data?.msg||data?.message||"Admin authentication failed.");
    }
    return data;
  }

  async function passwordSignIn(password){
    const value=String(password||"");
    if(!value)throw new Error("Enter the Genesis Admin password.");
    const data=await authRequest("password",{email:adminEmail(),password:value});
    return saveSession(data);
  }

  async function refreshSession(){
    const session=readSession();
    if(!session?.refresh_token)return "";
    try{
      const data=await authRequest("refresh_token",{refresh_token:session.refresh_token});
      return saveSession(data);
    }catch{
      localStorage.removeItem(SESSION_KEY);
      return "";
    }
  }

  async function getSessionToken(options={}){
    const interactive=options.interactive!==false;
    const session=readSession();
    if(session?.access_token&&Number(session.expires_at)>Date.now()+60000)return session.access_token;
    const refreshed=await refreshSession();
    if(refreshed)return refreshed;
    if(!interactive)throw new Error("Genesis Admin authentication is required.");
    const password=await requestPassword(options.message||"Confirm your Genesis Admin password to connect to Genesis Host.");
    if(!password)throw new Error("Genesis Admin authentication was cancelled.");
    return passwordSignIn(password);
  }

  function requestPassword(message){
    if(promptPromise)return promptPromise;
    promptPromise=new Promise(resolve=>{
      const previous=document.getElementById("genesisAdminAuthOverlay");
      previous?.remove();
      const overlay=document.createElement("div");
      overlay.id="genesisAdminAuthOverlay";
      overlay.style.cssText="position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(2,5,11,.76);backdrop-filter:blur(14px);font-family:Inter,Poppins,system-ui,sans-serif;color:#fff";
      overlay.innerHTML=`<div style="width:min(410px,92vw);padding:28px;border-radius:24px;border:1px solid rgba(255,255,255,.13);background:linear-gradient(145deg,rgba(24,31,47,.97),rgba(8,12,22,.96));box-shadow:0 28px 90px rgba(0,0,0,.5)"><div style="font-size:24px;font-weight:720;letter-spacing:-.03em;margin-bottom:8px">Admin authentication</div><div style="font-size:12px;line-height:1.6;color:rgba(255,255,255,.6);margin-bottom:18px">${escapeHTML(message)}</div><input id="genesisAdminAuthPassword" type="password" autocomplete="current-password" placeholder="Admin password" style="width:100%;height:46px;padding:0 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);outline:0;background:rgba(255,255,255,.065);color:#fff;font:inherit"><div id="genesisAdminAuthError" style="min-height:18px;margin-top:8px;font-size:10px;color:#ffb7bd"></div><div style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px"><button id="genesisAdminAuthCancel" type="button" style="height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);color:#fff;cursor:pointer">Cancel</button><button id="genesisAdminAuthSubmit" type="button" style="height:38px;padding:0 15px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#fff;color:#111827;font-weight:700;cursor:pointer">Authenticate</button></div></div>`;
      document.body.appendChild(overlay);
      const input=overlay.querySelector("#genesisAdminAuthPassword");
      const submit=overlay.querySelector("#genesisAdminAuthSubmit");
      const cancel=overlay.querySelector("#genesisAdminAuthCancel");
      const finish=value=>{overlay.remove();promptPromise=null;resolve(value)};
      submit.addEventListener("click",()=>finish(input.value));
      cancel.addEventListener("click",()=>finish(""));
      input.addEventListener("keydown",event=>{
        if(event.key==="Enter"){event.preventDefault();finish(input.value)}
        else if(event.key==="Escape"){event.preventDefault();finish("")}
      });
      setTimeout(()=>input.focus(),40);
    });
    return promptPromise;
  }

  function escapeHTML(value){
    return String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function localRole(){
    try{
      const login=JSON.parse(localStorage.getItem("genesisLogin")||"null");
      if(login&&Number(login.expires)>Date.now())return String(login.role||"user").toLowerCase();
    }catch{}
    return String(sessionStorage.getItem("genesisRole")||"user").toLowerCase();
  }

  function showLoginError(message="Incorrect username or password."){
    const error=document.getElementById("errorMessage");
    const card=document.getElementById("loginCard");
    if(error){error.textContent=message;error.classList.add("show")}
    if(card){card.classList.remove("shake");void card.offsetWidth;card.classList.add("shake")}
    const password=document.getElementById("password");
    if(password){password.value="";password.focus()}
  }

  async function secureIndexAdminLogin(){
    if(loginBusy)return;
    const username=document.getElementById("username");
    const password=document.getElementById("password");
    const button=document.getElementById("loginButton");
    if(String(username?.value||"").trim().toLowerCase()!=="admin")return false;
    loginBusy=true;
    if(button){button.disabled=true;button.textContent="Authenticating…"}
    try{
      if(typeof global.genesisCanAttemptLogin==="function"){
        const allowed=await global.genesisCanAttemptLogin();
        if(!allowed)return true;
      }
      await passwordSignIn(password?.value||"");
      const expires=Date.now()+(12*60*60*1000);
      localStorage.setItem("genesisLogin",JSON.stringify({user:"Admin",role:"admin",expires}));
      sessionStorage.setItem("realmAuth","1");
      sessionStorage.setItem("realmUser","Admin");
      sessionStorage.setItem("genesisRole","admin");
      location.href="intro.html";
    }catch(error){
      console.warn("Genesis Admin sign-in failed:",error);
      localStorage.removeItem(SESSION_KEY);
      showLoginError("Admin authentication failed. Check the Admin password.");
    }finally{
      loginBusy=false;
      if(button){button.disabled=false;button.textContent="Login"}
    }
    return true;
  }

  function installIndexGuard(){
    const username=document.getElementById("username");
    const password=document.getElementById("password");
    const button=document.getElementById("loginButton");
    if(!username||!password||!button||button.dataset.secureAdminGuard==="1")return;
    button.dataset.secureAdminGuard="1";
    document.addEventListener("click",event=>{
      if(event.target!==button)return;
      if(String(username.value||"").trim().toLowerCase()!=="admin")return;
      event.preventDefault();event.stopImmediatePropagation();secureIndexAdminLogin();
    },true);
    document.addEventListener("keydown",event=>{
      if(event.target!==password||event.key!=="Enter")return;
      if(String(username.value||"").trim().toLowerCase()!=="admin")return;
      event.preventDefault();event.stopImmediatePropagation();secureIndexAdminLogin();
    },true);
  }

  function installSessionBridge(){
    if(localRole()!=="admin")return;
    global.genesisAdminSession=()=>getSessionToken({interactive:true});
  }

  function install(){
    const path=location.pathname.toLowerCase();
    if(path.endsWith("/os.html")||path==="/os.html")installSessionBridge();
    else installIndexGuard();
  }

  global.GenesisAdminAuth={getSessionToken,passwordSignIn,refreshSession,requestPassword,install};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(window);
