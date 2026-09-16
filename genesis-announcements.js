(() => {
  const POLL_MS = 1000;
  let lastShownId = null;
  let hideTimer = null;
  let polling = false;

  function backendReady(){
    const b = window.GENESIS_BACKEND || {};
    return /^https:\/\/.+\.supabase\.co$/i.test(String(b.url || "")) &&
           String(b.anonKey || "").length > 20;
  }

  function ensureBanner(){
    if(!document.getElementById("genesisGlobalAnnouncementStyle")){
      const style = document.createElement("style");
      style.id = "genesisGlobalAnnouncementStyle";
      style.textContent = `
        #genesisGlobalAnnouncement{
          position:fixed !important;
          top:12px !important;
          left:50% !important;
          right:auto !important;
          bottom:auto !important;
          z-index:2147483647 !important;
          width:min(780px,calc(100vw - 28px)) !important;
          box-sizing:border-box !important;
          padding:15px 20px !important;
          border:1px solid rgba(255,255,255,.22) !important;
          border-radius:18px !important;
          background:rgba(7,11,20,.94) !important;
          color:white !important;
          box-shadow:0 18px 60px rgba(0,0,0,.44) !important;
          backdrop-filter:blur(24px) saturate(170%) !important;
          -webkit-backdrop-filter:blur(24px) saturate(170%) !important;
          font:600 14px/1.55 Poppins,system-ui,sans-serif !important;
          text-align:center !important;
          opacity:0;
          transform:translate(-50%,-30px) scale(.98);
          transition:
            opacity .42s ease,
            transform .5s cubic-bezier(.2,.8,.2,1);
          pointer-events:none !important;
        }
        #genesisGlobalAnnouncement.show{
          opacity:1 !important;
          transform:translate(-50%,0) scale(1) !important;
        }
      `;
      document.head.appendChild(style);
    }

    let banner = document.getElementById("genesisGlobalAnnouncement");
    if(!banner){
      banner = document.createElement("div");
      banner.id = "genesisGlobalAnnouncement";
      banner.setAttribute("role","status");
      banner.setAttribute("aria-live","polite");
      document.body.appendChild(banner);
    }else if(banner.parentElement !== document.body){
      document.body.appendChild(banner);
    }
    return banner;
  }

  function show(message, ms, id){
    if(!message) return;
    const banner = ensureBanner();

    clearTimeout(hideTimer);
    banner.textContent = message;
    banner.classList.remove("show");
    void banner.offsetWidth;

    requestAnimationFrame(() => banner.classList.add("show"));

    if(id !== undefined && id !== null){
      lastShownId = String(id);
    }

    hideTimer = setTimeout(() => {
      banner.classList.remove("show");
    }, Math.max(1000, Number(ms) || 7000));
  }

  async function rpc(name, body={}){
    const b = window.GENESIS_BACKEND;
    const response = await fetch(`${b.url}/rest/v1/rpc/${name}`, {
      method:"POST",
      headers:{
        "apikey":b.anonKey,
        "Authorization":`Bearer ${b.anonKey}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(body),
      cache:"no-store"
    });

    if(!response.ok){
      const msg = await response.text();
      throw new Error(msg || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async function latestFromTable(){
    const b = window.GENESIS_BACKEND;
    const query = "genesis_announcements?select=id,message,duration_ms,created_at&order=created_at.desc&limit=1";
    const response = await fetch(`${b.url}/rest/v1/${query}`, {
      headers:{
        "apikey":b.anonKey,
        "Authorization":`Bearer ${b.anonKey}`,
        "Accept":"application/json"
      },
      cache:"no-store"
    });
    if(!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    const rows = await response.json();
    const latest = Array.isArray(rows) ? rows[0] : rows;
    if(!latest) return null;
    const created = new Date(latest.created_at).getTime();
    const duration = Number(latest.duration_ms) || 0;
    if(!Number.isFinite(created) || duration <= 0) return null;
    return {
      id:latest.id,
      message:latest.message,
      remaining_ms:Math.max(0,duration-Math.max(0,Date.now()-created))
    };
  }

  async function activeAnnouncement(){
    try{
      const rows = await rpc("genesis_get_active_announcement");
      return Array.isArray(rows) ? rows[0] : rows;
    }catch(rpcError){
      // Older Genesis backends have the announcement table and sender RPC,
      // but not the newer active-announcement RPC. Reading the newest row
      // directly keeps announcements working without another SQL migration.
      try{
        return await latestFromTable();
      }catch(tableError){
        tableError.cause = rpcError;
        throw tableError;
      }
    }
  }

  async function poll(){
    if(!backendReady() || polling) return;
    polling = true;

    try{
      const a = await activeAnnouncement();

      if(!a || !a.id || Number(a.remaining_ms) <= 0) return;

      if(String(a.id) !== String(lastShownId)){
        show(a.message, Number(a.remaining_ms), a.id);
      }
    }catch(error){
      console.warn("Genesis global announcement poll failed:", error);
    }finally{
      polling = false;
    }
  }

  // Lets the Admin show the message immediately on the sending browser.
  window.GenesisAnnouncements = { show, poll };

  function start(){
    ensureBanner();
    poll();
    setInterval(poll, POLL_MS);
    window.addEventListener("online",poll);
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState === "visible") poll();
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start, {once:true});
  }else{
    start();
  }
})();
