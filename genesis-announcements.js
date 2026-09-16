(() => {
  const POLL_MS = 1000;
  const DEFAULT_TOPIC = "genesis-global-announcements-v1";
  const EVENT_NAME = "announcement";
  let lastShownId = null;
  let hideTimer = null;
  let polling = false;
  let activeRpcAvailable = null;
  let realtimeClient = null;
  let realtimeChannel = null;
  let realtimeState = "connecting";
  let realtimeStart = null;

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

  function topicName(){
    const override = String(window.GENESIS_ANNOUNCEMENT_TOPIC || "").trim();
    return /^[a-z0-9][a-z0-9_-]{5,120}$/i.test(override) ? override : DEFAULT_TOPIC;
  }

  function normalizeAnnouncement(value){
    const raw = value && typeof value === "object" ? value : {};
    const id = String(raw.id == null ? "" : raw.id).trim().slice(0,120);
    const message = String(raw.message == null ? "" : raw.message).trim().slice(0,2000);
    const duration = Math.min(30000,Math.max(1000,Number(raw.duration_ms) || 7000));
    const sentAt = new Date(raw.sent_at || raw.created_at || "").getTime();
    const suppliedRemaining = Number(raw.remaining_ms);
    const remaining = Number.isFinite(suppliedRemaining)
      ? Math.min(duration,Math.max(0,suppliedRemaining))
      : Math.max(0,duration-(Number.isFinite(sentAt) ? Math.max(0,Date.now()-sentAt) : 0));
    if(!id || !message || remaining <= 0) return null;
    return {id,message,duration_ms:duration,remaining_ms:remaining,sent_at:raw.sent_at || raw.created_at || new Date().toISOString()};
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
      banner.dataset.announcementId = String(id);
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
      const error = new Error(msg || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
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
    if(activeRpcAvailable !== false){
      try{
        const rows = await rpc("genesis_get_active_announcement");
        activeRpcAvailable = true;
        return Array.isArray(rows) ? rows[0] : rows;
      }catch(rpcError){
        // The current Genesis backend does not have this optional RPC. Remember
        // that result so every client does not repeat a failed request each second.
        if(rpcError.status === 404) activeRpcAvailable = false;
        else throw rpcError;
      }
    }
    return await latestFromTable();
  }

  function receiveRealtime(packet){
    const value = packet?.payload && typeof packet.payload === "object" ? packet.payload : packet;
    if(value?.testOnly === true) return false;
    const announcement = normalizeAnnouncement(value);
    if(!announcement || String(announcement.id) === String(lastShownId)) return false;
    show(announcement.message,announcement.remaining_ms,announcement.id);
    return true;
  }

  function startRealtime(){
    if(realtimeChannel) return Promise.resolve(true);
    if(realtimeStart) return realtimeStart;
    if(!backendReady() || !window.supabase?.createClient){
      realtimeState = "offline";
      return Promise.resolve(false);
    }

    realtimeStart = new Promise(resolve => {
      realtimeClient ||= window.supabase.createClient(
        window.GENESIS_BACKEND.url,
        window.GENESIS_BACKEND.anonKey,
        {
          auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
          realtime:{params:{eventsPerSecond:12}}
        }
      );
      realtimeState = "connecting";
      let settled = false;
      const finish = value => {
        if(settled) return;
        settled = true;
        resolve(value);
      };
      realtimeChannel = realtimeClient
        .channel(topicName(),{config:{broadcast:{self:false,ack:true}}})
        .on("broadcast",{event:EVENT_NAME},receiveRealtime)
        .subscribe(status => {
          if(status === "SUBSCRIBED"){
            realtimeState = "live";
            finish(true);
          }else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT"){
            realtimeState = "error";
            finish(false);
          }else if(status === "CLOSED"){
            realtimeState = "offline";
            realtimeChannel = null;
            realtimeStart = null;
            finish(false);
          }else{
            realtimeState = "connecting";
          }
        });
      setTimeout(()=>finish(realtimeState === "live"),8000);
    });
    return realtimeStart;
  }

  async function broadcast(value){
    const announcement = normalizeAnnouncement(value);
    if(!announcement) throw new Error("Announcement is missing an ID or message");
    await startRealtime();
    if(!realtimeClient) throw new Error("Realtime announcements are unavailable");
    const outgoing = realtimeChannel || realtimeClient.channel(topicName());
    if(typeof outgoing.httpSend === "function"){
      const response = await outgoing.httpSend(EVENT_NAME,announcement);
      if(response?.success === false) throw new Error(response.error || "Announcement broadcast was rejected");
      return true;
    }
    const response = await outgoing.send({type:"broadcast",event:EVENT_NAME,payload:announcement});
    if(response !== "ok") throw new Error("Announcement broadcast returned " + response);
    return true;
  }

  function currentRole(){
    if(typeof window.genesisRole === "function") return window.genesisRole();
    try{
      const login = JSON.parse(localStorage.getItem("genesisLogin") || "null");
      return login && login.expires > Date.now() ? (login.role || "user") : "user";
    }catch{
      return "user";
    }
  }

  async function sendGlobalAnnouncement(){
    if(currentRole() !== "admin") return;
    const input = document.getElementById("announcementText");
    const status = document.getElementById("announcementStatus");
    const message = String(input?.value || "").trim().slice(0,2000);
    if(!message){
      if(status) status.textContent = "Type a message first.";
      return;
    }

    const duration = Math.min(22000,Math.max(5000,3500+(message.length*55)));
    try{
      const result = await rpc("genesis_send_announcement",{
        p_message:message,
        p_duration_ms:duration
      });
      const id = Array.isArray(result) ? result[0] : result;
      if(input) input.value = "";
      show(message,duration,id);

      let sentLive = false;
      try{
        sentLive = await broadcast({
          id,
          message,
          duration_ms:duration,
          sent_at:new Date().toISOString()
        });
      }catch(broadcastError){
        console.warn("Genesis realtime announcement broadcast failed; polling will retry:",broadcastError);
      }
      if(status){
        status.textContent = sentLive
          ? `Sent to every connected client · visible for about ${Math.ceil(duration/1000)} seconds`
          : "Sent · other clients will receive it through database sync";
      }
      setTimeout(poll,250);
    }catch(error){
      if(status) status.textContent = "Could not send announcement: " + error.message;
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

  window.GenesisAnnouncements = {
    show,
    poll,
    broadcast,
    sendGlobalAnnouncement,
    startRealtime,
    status:()=>realtimeState,
    __test:{topicName,normalizeAnnouncement,receiveRealtime}
  };
  // Replace the legacy sender after the page has defined it. Keeping the full
  // send path here ensures the database write and global broadcast stay paired.
  window.sendGenesisAnnouncement = sendGlobalAnnouncement;

  function start(){
    ensureBanner();
    startRealtime();
    poll();
    setInterval(poll, POLL_MS);
    window.addEventListener("online",()=>{ startRealtime(); poll(); });
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
