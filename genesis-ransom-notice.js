(() => {
  "use strict";

  const ACK_KEY = "genesisRansomPrankNoticeV1";

  function alreadyAccepted(){
    try{return localStorage.getItem(ACK_KEY)==="accepted"}catch{return false}
  }

  function rememberAccepted(){
    try{localStorage.setItem(ACK_KEY,"accepted")}catch{}
  }

  function injectStyles(){
    if(document.getElementById("genesisRansomNoticeStyles"))return;
    const style=document.createElement("style");
    style.id="genesisRansomNoticeStyles";
    style.textContent=`
      #genesisRansomNotice{
        position:fixed;inset:0;z-index:2147483647;
        display:grid;place-items:center;padding:24px;
        background:rgba(2,4,9,.76);
        backdrop-filter:blur(18px) saturate(125%);
        -webkit-backdrop-filter:blur(18px) saturate(125%);
        font-family:Inter,Poppins,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #genesisRansomNotice .grn-card{
        width:min(560px,calc(100vw - 36px));
        padding:30px 30px 26px;border-radius:26px;
        border:1px solid rgba(255,255,255,.14);
        background:linear-gradient(145deg,rgba(22,27,40,.97),rgba(8,11,19,.97));
        color:#f8f9ff;box-shadow:0 30px 110px rgba(0,0,0,.56),inset 0 1px rgba(255,255,255,.08);
        animation:grnIn .28s cubic-bezier(.2,.84,.2,1.08);
      }
      #genesisRansomNotice .grn-badge{
        display:inline-flex;align-items:center;gap:7px;margin-bottom:14px;padding:7px 10px;
        border:1px solid rgba(255,70,85,.22);border-radius:999px;
        background:rgba(255,48,68,.10);color:#ff9ca8;
        font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
      }
      #genesisRansomNotice h1{margin:0 0 12px;font-size:25px;line-height:1.15;letter-spacing:-.02em}
      #genesisRansomNotice p{margin:0;color:rgba(255,255,255,.68);font-size:13px;line-height:1.7}
      #genesisRansomNotice .grn-safe{
        margin-top:18px;padding:14px 15px;border-radius:16px;
        border:1px solid rgba(117,255,169,.13);background:rgba(117,255,169,.055);
        color:rgba(234,255,241,.82);font-size:12px;line-height:1.65;
      }
      #genesisRansomNotice .grn-safe strong{color:#a9ffc8}
      #genesisRansomNotice .grn-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:23px;flex-wrap:wrap}
      #genesisRansomNotice button{
        min-height:42px;padding:0 16px;border-radius:13px;cursor:pointer;
        border:1px solid rgba(255,255,255,.11);font:700 12px/1 inherit;
      }
      #genesisRansomNotice .grn-exit{background:rgba(255,255,255,.055);color:rgba(255,255,255,.7)}
      #genesisRansomNotice .grn-accept{background:#fff;color:#090b11;border-color:#fff}
      #genesisRansomNotice.removing{opacity:0;transition:opacity .2s ease}
      @keyframes grnIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
    `;
    document.head.appendChild(style);
  }

  function exitGenesis(){
    try{window.close()}catch{}
    setTimeout(()=>{
      try{location.replace("about:blank")}catch{}
    },80);
  }

  function show(){
    if(alreadyAccepted()||document.getElementById("genesisRansomNotice"))return;
    injectStyles();
    const root=document.createElement("div");
    root.id="genesisRansomNotice";
    root.setAttribute("role","dialog");
    root.setAttribute("aria-modal","true");
    root.setAttribute("aria-labelledby","genesisRansomNoticeTitle");
    root.innerHTML=`
      <section class="grn-card">
        <div class="grn-badge">Genesis notice</div>
        <h1 id="genesisRansomNoticeTitle">RANSOM prank notice</h1>
        <p>
          Genesis includes a fake RANSOM / troll sequence that may be triggered by an administrator while you are using the site.
          It can use fullscreen images, video, sound, screen effects, and the Genesis RANSOM mini-game.
        </p>
        <div class="grn-safe">
          <strong>It is not real ransomware.</strong> The effect stays inside Genesis and does not encrypt, delete, download, rename,
          or modify files on your device. You can leave at any time by closing the Genesis tab.
        </div>
        <div class="grn-actions">
          <button type="button" class="grn-exit">Exit Genesis</button>
          <button type="button" class="grn-accept">I Understand &amp; Continue</button>
        </div>
      </section>`;
    document.body.appendChild(root);
    root.querySelector(".grn-exit")?.addEventListener("click",exitGenesis);
    root.querySelector(".grn-accept")?.addEventListener("click",()=>{
      rememberAccepted();
      root.classList.add("removing");
      setTimeout(()=>root.remove(),210);
    });
    setTimeout(()=>root.querySelector(".grn-accept")?.focus(),50);
  }

  function start(){
    const path=location.pathname||"";
    if(!/(?:^|\/)os\.html$/i.test(path))return;
    show();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();

  window.GenesisRansomNotice=Object.freeze({show,accepted:alreadyAccepted,ackKey:ACK_KEY});
})();
