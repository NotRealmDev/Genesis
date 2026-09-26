(function(global){
  "use strict";

  const FACE_ONE="assets/ransom/admin-face-1.webp";
  const FACE_TWO="assets/ransom/admin-face-2.webp";
  const DOWNLOAD_VIDEO="assets/ransom/downloading.mp4";
  let active=false;

  function isAdmin(){
    try{
      if(typeof global.genesisRole==="function")return global.genesisRole()==="admin";
      const login=JSON.parse(localStorage.getItem("genesisLogin")||"null");
      return !!(login&&login.expires>Date.now()&&login.role==="admin");
    }catch{return false}
  }

  function injectStyles(){
    if(document.getElementById("genesisRansomPreviewStyles"))return;
    const style=document.createElement("style");
    style.id="genesisRansomPreviewStyles";
    style.textContent=`
      #genesisRansomAdminPreview{
        position:fixed;inset:0;z-index:2147483646;background:#000;
        display:grid;place-items:center;overflow:hidden;opacity:1;
        transition:background .42s ease,opacity .72s ease,filter .42s ease;
      }
      #genesisRansomAdminPreview .grp-face{
        width:min(58vw,540px);height:min(58vw,540px);max-height:72vh;
        object-fit:contain;image-rendering:auto;filter:contrast(1.08);
        transform:scale(.98);transition:opacity .12s linear,transform .18s ease,filter .25s ease;
      }
      #genesisRansomAdminPreview.face-two .grp-face{transform:scale(1.035);filter:contrast(1.32) saturate(1.2)}
      #genesisRansomAdminPreview.red-phase{background:#c00000;animation:grpShake .11s steps(2,end) infinite}
      #genesisRansomAdminPreview.red-phase .grp-face{opacity:.22;filter:contrast(2.1) saturate(1.8)}
      #genesisRansomAdminPreview .grp-download{
        position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#c00000;
        opacity:0;pointer-events:none;transition:opacity .18s ease;
      }
      #genesisRansomAdminPreview.video-phase .grp-download{opacity:1}
      #genesisRansomAdminPreview.fade-out{opacity:0;filter:blur(12px);animation:none}
      #genesisRansomAdminPreview .grp-label{
        position:absolute;bottom:22px;left:50%;transform:translateX(-50%);
        font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;
        color:rgba(255,255,255,.28);text-transform:uppercase;pointer-events:none;
      }
      #genesisRansomPreviewButton{background:rgba(255,48,68,.14);border-color:rgba(255,70,88,.22)}
      #genesisRansomPreviewButton:hover{background:rgba(255,48,68,.24)}
      .ransom-coin.ransom-hard-coin{
        width:56px!important;height:62px!important;z-index:2147482350!important;
        opacity:.68!important;filter:drop-shadow(0 0 4px rgba(255,225,80,.42))!important;
        transition:opacity .22s ease,transform .22s ease!important;
      }
      .ransom-coin.ransom-hard-coin img{height:76%!important}
      .ransom-coin.ransom-hard-coin span{font-size:8px!important;opacity:.55!important}
      .ransom-coin.ransom-hard-coin.ransom-hard-pending{opacity:0!important;pointer-events:none!important}
      @keyframes grpShake{0%{transform:translate(0,0)}25%{transform:translate(5px,-2px)}50%{transform:translate(-4px,3px)}75%{transform:translate(3px,4px)}100%{transform:translate(-3px,-2px)}}
    `;
    document.head.appendChild(style);
  }

  function startRansomDirect(){
    try{
      const url=new URL(location.href);
      url.searchParams.set("ransomEvent","1");
      history.replaceState(history.state,"",url.pathname+url.search+url.hash);
    }catch{}
    if(global.GenesisRansomEaster?.startOsEvent){
      global.GenesisRansomEaster.startOsEvent();
    }else{
      const next=new URL("os.html",location.href);
      next.searchParams.set("ransomEvent","1");
      location.replace(next.pathname+next.search+next.hash);
    }
  }

  function finishPreview(root){
    if(!root?.isConnected)return;
    root.classList.remove("video-phase");
    root.classList.add("red-phase");
    setTimeout(()=>root.classList.add("fade-out"),360);
    setTimeout(()=>{
      root.remove();
      active=false;
      startRansomDirect();
    },980);
  }

  function playDownloadPhase(root){
    if(!root?.isConnected)return;
    root.classList.add("red-phase");
    const video=root.querySelector(".grp-download");
    let settled=false;
    const fallback=setTimeout(()=>{
      if(settled)return;
      settled=true;
      finishPreview(root);
    },2600);
    const finish=()=>{
      if(settled)return;
      settled=true;
      clearTimeout(fallback);
      finishPreview(root);
    };
    video.addEventListener("canplay",()=>{
      root.classList.add("video-phase");
      const play=video.play();
      play?.catch?.(()=>{});
    },{once:true});
    video.addEventListener("ended",finish,{once:true});
    video.addEventListener("error",finish,{once:true});
    video.src=DOWNLOAD_VIDEO;
    video.load();
  }

  function startPreview(){
    if(active||!isAdmin())return;
    active=true;
    global.GenesisUI?.pauseMusic?.();
    const root=document.createElement("div");
    root.id="genesisRansomAdminPreview";
    root.innerHTML=`<img class="grp-face" src="${FACE_ONE}" alt=""><video class="grp-download" playsinline preload="auto"></video><div class="grp-label">move</div>`;
    document.body.appendChild(root);

    let switched=false;
    const switchFace=()=>{
      if(switched||!root.isConnected)return;
      switched=true;
      const face=root.querySelector(".grp-face");
      root.classList.add("face-two");
      if(face)face.src=FACE_TWO;
      root.querySelector(".grp-label")?.remove();
      setTimeout(()=>playDownloadPhase(root),520);
    };
    window.addEventListener("pointermove",switchFace,{once:true,capture:true});
    window.addEventListener("mousemove",switchFace,{once:true,capture:true});
    window.addEventListener("touchstart",switchFace,{once:true,capture:true});
  }

  function hardPosition(coin){
    const edge=Math.floor(Math.random()*4);
    let left,top;
    if(edge===0){left=4+Math.random()*13;top=23+Math.random()*65}
    else if(edge===1){left=83+Math.random()*13;top=23+Math.random()*65}
    else if(edge===2){left=15+Math.random()*70;top=10+Math.random()*10}
    else{left=15+Math.random()*70;top=79+Math.random()*12}
    coin.style.left=left.toFixed(1)+"%";
    coin.style.top=top.toFixed(1)+"%";
  }

  function hardenCoin(coin){
    if(!coin||coin.dataset.ransomHard==="1")return;
    coin.dataset.ransomHard="1";
    coin.classList.add("ransom-hard-coin","ransom-hard-pending");
    hardPosition(coin);
    coin.style.pointerEvents="none";
    const delay=1700+Math.random()*1900;
    setTimeout(()=>{
      if(!coin.isConnected)return;
      coin.classList.remove("ransom-hard-pending");
      coin.style.pointerEvents="auto";
    },delay);
  }

  function hardenCoins(root=document){
    if(root?.matches?.(".ransom-coin"))hardenCoin(root);
    root?.querySelectorAll?.(".ransom-coin").forEach(hardenCoin);
  }

  function installButton(){
    if(!isAdmin())return;
    const input=document.getElementById("deactivateIdInput");
    if(!input||document.getElementById("genesisRansomPreviewButton"))return;
    const row=input.closest(".admin-row");
    if(!row)return;
    const button=document.createElement("button");
    button.id="genesisRansomPreviewButton";
    button.type="button";
    button.className="os-btn";
    button.textContent="Preview RANSOM";
    button.title="Run the RANSOM prank sequence on this Genesis session";
    button.addEventListener("click",startPreview);
    row.appendChild(button);
    const status=document.createElement("div");
    status.className="muted";
    status.style.cssText="font-size:10px;margin-top:8px;opacity:.65";
    status.textContent="Preview runs here. Downloading video slot: assets/ransom/downloading.mp4";
    row.insertAdjacentElement("afterend",status);
  }

  function start(){
    injectStyles();
    installButton();
    hardenCoins();
    const observer=new MutationObserver(records=>{
      installButton();
      for(const record of records){
        for(const node of record.addedNodes){
          if(node?.nodeType===1)hardenCoins(node);
        }
      }
    });
    observer.observe(document.body,{subtree:true,childList:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
  global.GenesisRansomPreview=Object.freeze({start:startPreview});
})(globalThis);
