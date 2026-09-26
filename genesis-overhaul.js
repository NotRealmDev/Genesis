(function(global){
  "use strict";
  if(!/(?:^|\/)os\.html$/i.test(location.pathname) || global.GenesisOverhaul) return;

  const THEME_KEY="genesisTheme";
  const USERNAME_KEY="genesisUsername";
  const DNS_KEY="genesisDnsProvider";
  const themes={
    sunset:{name:"Sunset",accent:18,preview:"Warm glass, peach light, and a slow sunset glow."},
    chill:{name:"Chill",accent:207,preview:"A cozy winter room with a snowstorm outside the window."}
  };
  const dnsProviders={
    cloudflare:{name:"Cloudflare",endpoint:"https://cloudflare-dns.com/dns-query"},
    google:{name:"Google",endpoint:"https://dns.google/resolve"},
    quad9:{name:"Quad9",endpoint:"https://dns.quad9.net/dns-query"}
  };

  function storageGet(key,fallback){try{return localStorage.getItem(key)||fallback}catch{return fallback}}
  function storageSet(key,value){try{localStorage.setItem(key,value)}catch{}}
  function username(){
    const custom=storageGet(USERNAME_KEY,"").trim();
    if(custom) return custom.slice(0,24);
    try{
      const login=JSON.parse(localStorage.getItem("genesisLogin")||"null");
      return String(login?.user||sessionStorage.getItem("realmUser")||"Genesis User").slice(0,24);
    }catch{return "Genesis User"}
  }
  function setUsername(value){
    const clean=String(value||"").trim().replace(/[<>]/g,"").slice(0,24);
    if(!clean) return false;
    storageSet(USERNAME_KEY,clean);
    global.dispatchEvent(new CustomEvent("genesis:username",{detail:{username:clean}}));
    syncAccountUI();
    return true;
  }
  function currentTheme(){const key=storageGet(THEME_KEY,"sunset");return themes[key]?key:"sunset"}
  function applyTheme(name,preview=false){
    const key=themes[name]?name:"sunset";
    const root=document.documentElement;
    root.dataset.genesisTheme=key;
    root.style.setProperty("--accent",String(themes[key].accent));
    document.body.classList.toggle("theme-chill",key==="chill");
    document.body.classList.toggle("theme-sunset",key==="sunset");
    if(!preview) storageSet(THEME_KEY,key);
    return key;
  }
  function currentDns(){const key=storageGet(DNS_KEY,"cloudflare");return dnsProviders[key]?key:"cloudflare"}
  function setDns(name){
    const key=dnsProviders[name]?name:"cloudflare";
    storageSet(DNS_KEY,key);
    global.GENESIS_PROXY=Object.assign({},global.GENESIS_PROXY||{},{
      dnsProvider:key,
      dnsEndpoint:dnsProviders[key].endpoint
    });
    const label=document.getElementById("genesisDnsStatus");
    if(label) label.textContent=dnsProviders[key].name+" DoH";
    return key;
  }
  async function resolveHost(hostname){
    const host=String(hostname||"").trim().replace(/^https?:\/\//,"").split("/")[0].split(":")[0];
    if(!host) throw new Error("Missing hostname");
    const key=currentDns(),provider=dnsProviders[key];
    const headers={accept:"application/dns-json"};
    const join=provider.endpoint.includes("?")?"&":"?";
    const url=provider.endpoint+join+"name="+encodeURIComponent(host)+"&type=A";
    const response=await fetch(url,{headers,cache:"no-store"});
    if(!response.ok) throw new Error("DNS lookup failed with "+response.status);
    const data=await response.json();
    const answers=Array.isArray(data.Answer)?data.Answer.map(x=>x.data).filter(Boolean):[];
    return {provider:key,hostname:host,answers};
  }
  function syncAccountUI(){
    const value=username();
    ["genesisAccountLabel","genesisAccountName"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=value});
    const avatar=document.getElementById("genesisAccountAvatar");
    if(avatar) avatar.textContent=(value[0]||"G").toUpperCase();
  }
  function icon(){
    return '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"/><path d="M8 9h8M8 13h5"/><circle cx="17" cy="15.5" r="1.5"/></svg>';
  }
  function ensureStoreIcon(){
    if(document.querySelector('[data-app="store"]')) return;
    const desktop=document.getElementById("desktop");
    if(!desktop) return;
    const node=document.createElement("div");
    node.className="desktop-icon";
    node.dataset.app="store";
    node.style.left="330px";
    node.style.top="260px";
    node.innerHTML='<div class="app-icon">'+icon()+'</div><div class="app-name">Store</div>';
    desktop.appendChild(node);
    node.addEventListener("dblclick",()=>global.openApp?.("store"));
  }
  function storeHTML(){
    const selected=currentTheme();
    return '<div class="gx-store">'+
      '<div class="gx-store-head"><div><div class="heading">Store</div><div class="muted">Personalize Genesis with live animated themes.</div></div><span class="gx-store-pill">Themes</span></div>'+
      '<div class="gx-theme-grid">'+Object.entries(themes).map(([key,theme])=>
        '<button class="gx-theme-card '+(selected===key?"active":"")+'" data-theme-choice="'+key+'" onclick="GenesisOverhaul.chooseTheme(\''+key+'\')">'+
          '<div class="gx-theme-preview '+key+'"><div class="gx-preview-window"><span></span><span></span><span></span></div><div class="gx-theme-name">'+theme.name+'</div></div>'+
          '<div class="gx-theme-copy"><strong>'+theme.name+'</strong><span>'+theme.preview+'</span><b>'+(selected===key?"Installed":"Apply")+'</b></div>'+
        '</button>'
      ).join("")+'</div></div>';
  }
  function accountHTML(){
    const value=username(),dns=currentDns();
    return '<div class="section gx-account">'+
      '<div class="heading">Account Settings</div>'+
      '<div class="gx-settings-card"><label>Username</label><div class="gx-input-row"><input id="gxUsername" maxlength="24" value="'+value.replace(/"/g,"&quot;")+'" placeholder="Choose a username"><button class="os-btn" onclick="GenesisOverhaul.saveUsername()">Save</button></div><small>This name appears in Genesis Messages and your account menu.</small></div>'+
      '<div class="gx-settings-card"><label>DNS over HTTPS</label><select id="gxDnsSelect" onchange="GenesisOverhaul.saveDns(this.value)">'+Object.entries(dnsProviders).map(([key,p])=>'<option value="'+key+'" '+(dns===key?"selected":"")+'>'+p.name+'</option>').join("")+'</select><small>DNS is used for resolver checks and proxy diagnostics. Wisp remains the actual web transport.</small><div class="gx-dns-line">Status: <b id="genesisDnsStatus">'+dnsProviders[dns].name+' DoH</b></div></div>'+
      '</div>';
  }
  function chooseTheme(name){
    const applied=applyTheme(name);
    document.querySelectorAll(".gx-theme-card").forEach(card=>card.classList.toggle("active",card.dataset.themeChoice===applied));
    document.querySelectorAll(".gx-theme-copy b").forEach((b,index)=>{const card=b.closest(".gx-theme-card");b.textContent=card?.classList.contains("active")?"Installed":"Apply"});
  }
  function saveUsername(){
    const input=document.getElementById("gxUsername");
    if(setUsername(input?.value)) global.GenesisUI?.sound?.("success");
  }
  function saveDns(value){setDns(value);global.GenesisUI?.sound?.("success")}
  function patchApps(){
    if(!global.apps || !global.openApp) return false;
    global.apps.store={title:"Store",content:storeHTML};
    global.apps.accountSettings={title:"Account Settings",content:accountHTML};
    return true;
  }
  function installAccountButton(){
    const pop=document.getElementById("genesisAccountPopover");
    if(!pop || pop.querySelector(".gx-account-settings-button")) return;
    const btn=document.createElement("button");
    btn.type="button";btn.className="account-logout gx-account-settings-button";
    btn.style.cssText="margin-bottom:6px;background:rgba(255,255,255,.07);color:#fff";
    btn.textContent="Account Settings";
    btn.onclick=()=>{global.openApp?.("accountSettings");pop.classList.remove("open")};
    pop.insertBefore(btn,pop.querySelector(".account-logout"));
  }

  const style=document.createElement("style");
  style.id="genesisOverhaulStyles";
  style.textContent=`
    body.theme-sunset #os{background:radial-gradient(circle at 18% 20%,rgba(255,164,94,.34),transparent 33%),radial-gradient(circle at 78% 68%,rgba(255,84,126,.20),transparent 38%),linear-gradient(145deg,#180d18,#33192a 48%,#090711)}
    body.theme-sunset #os:before{background:rgba(255,149,77,.24)}body.theme-sunset #os:after{background:rgba(255,70,136,.18)}
    body.theme-chill #os{background:linear-gradient(180deg,rgba(7,17,31,.18),rgba(4,9,16,.42)),radial-gradient(circle at 54% 16%,rgba(179,219,255,.18),transparent 34%),linear-gradient(145deg,#07101d,#101d2c 45%,#05080d)}
    body.theme-chill #os:before{width:100%;height:100%;left:0;top:0;border-radius:0;filter:none;background-image:radial-gradient(circle,rgba(255,255,255,.86) 0 1.5px,transparent 2px),radial-gradient(circle,rgba(255,255,255,.6) 0 1px,transparent 1.6px);background-size:46px 46px,70px 70px;background-position:0 0,18px 12px;opacity:.45;animation:gxSnow 11s linear infinite}
    body.theme-chill #os:after{right:8%;bottom:-18%;width:520px;height:420px;background:rgba(107,163,219,.16)}
    @keyframes gxSnow{to{background-position:35px 210px,-25px 310px}}
    .gx-store{height:100%;padding:26px;overflow:auto;background:radial-gradient(circle at 50% 0,rgba(255,255,255,.05),transparent 35%)}.gx-store-head{display:flex;align-items:center;justify-content:space-between}.gx-store-pill{padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.07);font-size:10px;color:var(--muted)}
    .gx-theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:24px}.gx-theme-card{padding:0;border:1px solid rgba(255,255,255,.1);border-radius:24px;overflow:hidden;background:rgba(255,255,255,.045);text-align:left;cursor:pointer;color:#fff}.gx-theme-card:hover{transform:translateY(-5px) scale(1.01);box-shadow:0 24px 60px rgba(0,0,0,.28)}.gx-theme-card.active{box-shadow:0 0 0 2px hsla(var(--accent),85%,70%,.4),0 26px 70px rgba(0,0,0,.3)}
    .gx-theme-preview{height:220px;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:20px}.gx-theme-preview.sunset{background:radial-gradient(circle at 72% 24%,#ffd29a 0 4%,transparent 23%),linear-gradient(180deg,#8d537f,#e87969 56%,#28152a)}.gx-theme-preview.sunset:after{content:"";position:absolute;inset:35% -10% -15%;background:radial-gradient(ellipse at center,rgba(255,188,111,.4),transparent 55%);animation:gxSunset 5s ease-in-out infinite alternate}@keyframes gxSunset{to{transform:translateY(9px) scale(1.05)}}
    .gx-theme-preview.chill{background:linear-gradient(180deg,#152944,#263f59 55%,#081019)}.gx-theme-preview.chill:before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,white 0 1.7px,transparent 2px),radial-gradient(circle,rgba(255,255,255,.7) 0 1px,transparent 1.7px);background-size:38px 38px,57px 57px;animation:gxPreviewSnow 4s linear infinite}@keyframes gxPreviewSnow{to{background-position:30px 180px,-20px 220px}}
    .gx-theme-preview.chill:after{content:"";position:absolute;left:0;right:0;bottom:0;height:42%;background:linear-gradient(180deg,transparent,rgba(8,11,16,.85)),radial-gradient(circle at 20% 80%,rgba(255,175,93,.35),transparent 18%)}.gx-preview-window{position:absolute;left:24px;top:22px;width:52%;height:54%;border:7px solid rgba(25,19,23,.7);border-radius:12px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.16),0 14px 28px rgba(0,0,0,.22)}.gx-preview-window span{position:absolute;background:rgba(18,17,22,.72)}.gx-preview-window span:nth-child(1){left:50%;top:0;bottom:0;width:5px}.gx-preview-window span:nth-child(2){top:50%;left:0;right:0;height:5px}.gx-preview-window span:nth-child(3){left:-17px;right:-17px;bottom:-22px;height:13px;border-radius:6px}.gx-theme-name{position:relative;z-index:2;font-size:27px;font-weight:750;letter-spacing:-.04em;text-shadow:0 3px 18px rgba(0,0,0,.5)}
    .gx-theme-copy{display:grid;grid-template-columns:1fr auto;gap:6px 10px;padding:16px}.gx-theme-copy strong{font-size:14px}.gx-theme-copy span{grid-column:1/2;color:var(--muted);font-size:10px;line-height:1.5}.gx-theme-copy b{grid-column:2;grid-row:1/3;align-self:center;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-size:9px}
    .gx-account{max-width:620px;margin:auto}.gx-settings-card{padding:18px;margin-top:14px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}.gx-settings-card label{display:block;font-size:11px;font-weight:700;margin-bottom:10px}.gx-settings-card small{display:block;color:var(--muted);font-size:9px;line-height:1.5;margin-top:8px}.gx-input-row{display:grid;grid-template-columns:1fr auto;gap:8px}.gx-settings-card input,.gx-settings-card select{width:100%;height:42px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.055);color:#fff;padding:0 12px;outline:0}.gx-settings-card select option{background:#101722}.gx-dns-line{margin-top:10px;font-size:10px;color:var(--muted)}
    .window{transition:opacity .22s ease,box-shadow .24s ease,filter .22s ease}.window:not(.closing):hover{box-shadow:inset 0 1px rgba(255,255,255,.12),0 36px 110px rgba(0,0,0,.48)}.desktop-icon{transition:transform .2s cubic-bezier(.2,.85,.2,1),opacity .2s}.sidebar{transition:transform .35s cubic-bezier(.2,.85,.2,1),background .3s}.dock{transition:transform .35s cubic-bezier(.2,.85,.2,1),background .3s}
    @media(max-width:650px){.gx-theme-grid{grid-template-columns:1fr}.gx-theme-preview{height:180px}}
  `;
  document.head.appendChild(style);

  applyTheme(currentTheme());
  setDns(currentDns());
  syncAccountUI();
  const timer=setInterval(()=>{if(patchApps()){ensureStoreIcon();installAccountButton();clearInterval(timer)}},60);
  setTimeout(()=>{ensureStoreIcon();installAccountButton();syncAccountUI()},250);

  global.GenesisOverhaul=Object.freeze({themes,dnsProviders,username,setUsername,currentTheme,applyTheme,chooseTheme,storeHTML,accountHTML,saveUsername,currentDns,setDns,saveDns,resolveHost});
})(window);
