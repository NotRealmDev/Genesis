(function(global){
  "use strict";
  const seenKey=id=>"genesisAppTourSeen:"+String(id||"").toLowerCase();
  const tours={
    browser:{title:"Browser",copy:"Browse through Genesis Prism with Wisp failover. Search uses Brave, while site pages stay inside Genesis."},
    games:{title:"Games",copy:"Search the full catalog, open a game, reload it, enter fullscreen, or return to the library. Failed remote games get a Genesis fallback instead of a blank window."},
    gpt:{title:"GPT",copy:"Choose an AI workspace, start a fresh chat, retry a connection, and keep GPT separate from your Browser session."},
    messages:{title:"Messages",copy:"Add friends by Genesis ID, create servers, use text and voice channels, send images, and search for GIFs from the composer."},
    store:{title:"Store",copy:"Preview and apply animated Genesis themes. Your choice is saved on this device."},
    settings:{title:"Settings",copy:"Tune the glass desktop, reset icon positions, and open account or appearance controls."},
    files:{title:"Files",copy:"Keep your Genesis folders organized in one desktop workspace."},
    music:{title:"Music",copy:"Control your Genesis soundtrack and playback preferences."},
    accountSettings:{title:"Account Settings",copy:"Choose your Genesis username and manage your DNS preference."}
  };
  function already(id){try{return localStorage.getItem(seenKey(id))==="1"}catch{return false}}
  function remember(id){try{localStorage.setItem(seenKey(id),"1")}catch{}}
  function show(id){
    const tour=tours[id];
    if(!tour||id==="messages"||already(id)||document.getElementById("genesisAppTour"))return;
    remember(id);
    const root=document.createElement("div");root.id="genesisAppTour";root.className="genesis-tour-backdrop";
    root.innerHTML=`<section class="genesis-tour-card" role="dialog" aria-modal="true" aria-labelledby="genesisTourTitle"><div class="genesis-tour-kicker">GENESIS / QUICK TOUR</div><h2 id="genesisTourTitle">${tour.title}</h2><p>${tour.copy}</p><div class="genesis-tour-actions"><button type="button" class="os-btn" data-tour-close>Got it</button></div></section>`;
    document.body.appendChild(root);
    root.querySelector("[data-tour-close]")?.addEventListener("click",()=>root.remove());
    root.addEventListener("click",event=>{if(event.target===root)root.remove()});
    setTimeout(()=>root.querySelector("[data-tour-close]")?.focus(),0);
  }
  const style=document.createElement("style");style.textContent=`
    .genesis-tour-backdrop{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:20px;background:rgba(2,5,12,.48);backdrop-filter:blur(12px);animation:genesisTourIn .22s ease-out}
    .genesis-tour-card{width:min(430px,calc(100vw - 34px));padding:27px;border:1px solid rgba(255,255,255,.18);border-radius:24px;color:#f6f8ff;background:linear-gradient(145deg,rgba(29,42,62,.96),rgba(9,14,25,.96));box-shadow:0 28px 90px rgba(0,0,0,.46),inset 0 1px rgba(255,255,255,.1)}
    .genesis-tour-kicker{font-size:9px;letter-spacing:.2em;color:#9eece5;font-weight:800}.genesis-tour-card h2{margin:10px 0 9px;font-size:26px;letter-spacing:-.04em}.genesis-tour-card p{margin:0;color:#b7c4d5;font-size:13px;line-height:1.65}.genesis-tour-actions{display:flex;justify-content:flex-end;margin-top:21px}.genesis-tour-actions .os-btn{padding:10px 16px;background:#e9ffff;color:#09202a;border:0;border-radius:11px;font-weight:700}.genesis-tour-backdrop button:focus-visible{outline:2px solid #a5fff2;outline-offset:3px}@keyframes genesisTourIn{from{opacity:0}to{opacity:1}}
  `;document.head.appendChild(style);
  global.GenesisAppTour=Object.freeze({show,reset:id=>{try{localStorage.removeItem(seenKey(id))}catch{}}});
})(window);
