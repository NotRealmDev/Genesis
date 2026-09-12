(() => {
  const POLL_MS = 2500;
  let lastId = null;
  let hideTimer = null;

  function backendReady(){
    const b = window.GENESIS_BACKEND || {};
    return /^https:\/\/.+\.supabase\.co$/i.test(String(b.url || "")) &&
           String(b.anonKey || "").length > 20;
  }

  function ensureBanner(){
    let banner = document.getElementById("genesisGlobalAnnouncement");
    if(banner) return banner;

    const style = document.createElement("style");
    style.textContent = `
      #genesisGlobalAnnouncement{
        position:fixed;
        top:14px;
        left:50%;
        z-index:2147483000;
        width:min(760px,calc(100vw - 32px));
        box-sizing:border-box;
        padding:13px 18px;
        border:1px solid rgba(255,255,255,.18);
        border-radius:17px;
        background:rgba(10,14,24,.88);
        color:#fff;
        box-shadow:0 16px 50px rgba(0,0,0,.32);
        backdrop-filter:blur(22px) saturate(160%);
        -webkit-backdrop-filter:blur(22px) saturate(160%);
        font:600 13px/1.5 Poppins,system-ui,sans-serif;
        text-align:center;
        opacity:0;
        transform:translate(-50%,-24px) scale(.985);
        transition:opacity .45s ease,transform .5s cubic-bezier(.2,.8,.2,1);
        pointer-events:none;
      }
      #genesisGlobalAnnouncement.show{
        opacity:1;
        transform:translate(-50%,0) scale(1);
      }
    `;
    document.head.appendChild(style);

    banner = document.createElement("div");
    banner.id = "genesisGlobalAnnouncement";
    document.body.appendChild(banner);
    return banner;
  }

  function show(message, ms){
    const banner = ensureBanner();
    clearTimeout(hideTimer);
    banner.textContent = message;
    requestAnimationFrame(() => banner.classList.add("show"));
    hideTimer = setTimeout(() => banner.classList.remove("show"), Math.max(1200, ms || 6000));
  }

  async function poll(){
    if(!backendReady()) return;
    try{
      const b = window.GENESIS_BACKEND;
      const url = `${b.url}/rest/v1/genesis_announcements?select=id,message,duration_ms,created_at&order=created_at.desc&limit=1`;
      const response = await fetch(url, {
        headers: { "apikey": b.anonKey },
        cache: "no-store"
      });
      if(!response.ok) return;

      const rows = await response.json();
      if(!rows || !rows.length) return;

      const a = rows[0];
      const created = new Date(a.created_at).getTime();
      const duration = Number(a.duration_ms || 7000);
      const expires = created + duration;

      if(a.id !== lastId){
        lastId = a.id;
        if(Date.now() < expires){
          show(a.message, expires - Date.now());
        }
      }
    }catch(e){
      console.warn("Genesis announcement poll failed:", e);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    ensureBanner();
    poll();
    setInterval(poll, POLL_MS);
  });
})();
