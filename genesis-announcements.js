(() => {
  const POLL_MS = 1800;
  let lastId = null;
  let hideTimer = null;

  function backendReady(){
    const b = window.GENESIS_BACKEND || {};
    return /^https:\/\/.+\.supabase\.co$/i.test(String(b.url || "")) &&
           String(b.anonKey || "").length > 20;
  }

  function ensureBanner(){
    let banner = document.getElementById("genesisGlobalAnnouncement");

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
          width:min(760px,calc(100vw - 28px)) !important;
          box-sizing:border-box !important;
          padding:14px 20px !important;
          border:1px solid rgba(255,255,255,.20) !important;
          border-radius:18px !important;
          background:rgba(8,12,22,.92) !important;
          color:#fff !important;
          box-shadow:0 18px 60px rgba(0,0,0,.42) !important;
          backdrop-filter:blur(24px) saturate(165%) !important;
          -webkit-backdrop-filter:blur(24px) saturate(165%) !important;
          font:600 14px/1.5 Poppins,system-ui,sans-serif !important;
          text-align:center !important;
          opacity:0;
          transform:translate(-50%,-28px) scale(.98);
          transition:opacity .42s ease,transform .5s cubic-bezier(.2,.8,.2,1);
          pointer-events:none !important;
        }
        #genesisGlobalAnnouncement.show{
          opacity:1 !important;
          transform:translate(-50%,0) scale(1) !important;
        }
      `;
      document.head.appendChild(style);
    }

    if(!banner){
      banner = document.createElement("div");
      banner.id = "genesisGlobalAnnouncement";
      banner.setAttribute("role","status");
      banner.setAttribute("aria-live","polite");
      document.body.appendChild(banner);
    } else if(banner.parentElement !== document.body) {
      document.body.appendChild(banner);
    }

    return banner;
  }

  function show(message, ms){
    if(!message) return;
    const banner = ensureBanner();
    clearTimeout(hideTimer);
    banner.textContent = message;
    banner.classList.remove("show");
    void banner.offsetWidth;
    requestAnimationFrame(() => banner.classList.add("show"));

    hideTimer = setTimeout(() => {
      banner.classList.remove("show");
    }, Math.max(2000, Number(ms) || 7000));
  }

  async function rpc(name, body={}){
    const b = window.GENESIS_BACKEND;
    const response = await fetch(`${b.url}/rest/v1/rpc/${name}`, {
      method:"POST",
      headers:{
        "apikey":b.anonKey,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(body),
      cache:"no-store"
    });

    if(!response.ok){
      throw new Error(await response.text());
    }
    return response.json();
  }

  async function poll(){
    if(!backendReady()) return;

    try{
      const rows = await rpc("genesis_get_latest_announcement");
      const a = Array.isArray(rows) ? rows[0] : rows;
      if(!a || !a.id) return;

      const created = new Date(a.created_at).getTime();
      const duration = Number(a.duration_ms || 7000);
      const expires = created + duration;

      if(String(a.id) !== String(lastId)){
        lastId = a.id;

        if(Date.now() < expires){
          show(a.message, expires - Date.now());
        }
      }
    }catch(error){
      console.warn("Genesis announcement poll failed:", error);
    }
  }

  window.GenesisAnnouncements = { show, poll };

  function start(){
    ensureBanner();
    poll();
    setInterval(poll, POLL_MS);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start, {once:true});
  }else{
    start();
  }
})();
