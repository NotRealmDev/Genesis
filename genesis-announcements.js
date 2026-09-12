(() => {
  const POLL_MS = 1000;
  let lastShownId = null;
  let hideTimer = null;

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

  async function poll(){
    if(!backendReady()) return;

    try{
      const rows = await rpc("genesis_get_active_announcement");
      const a = Array.isArray(rows) ? rows[0] : rows;

      if(!a || !a.id || Number(a.remaining_ms) <= 0) return;

      if(String(a.id) !== String(lastShownId)){
        show(a.message, Number(a.remaining_ms), a.id);
      }
    }catch(error){
      console.warn("Genesis global announcement poll failed:", error);
    }
  }

  // Lets the Admin show the message immediately on the sending browser.
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
