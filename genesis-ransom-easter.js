(function(global){
  "use strict";

  const FIRST_VIDEO_ID="F3k-Rv9Bje8";
  const TAPE_ZERO_VIDEO_ID="Ih67uamFYNs";
  const FIRST_START_SECONDS=45;
  const FIRST_DURATION_MS=2600;
  const TAPE_ZERO_DURATION_MS=12150;
  let active=false;
  let timer=0;

  function credentialsMatch(){
    const username=String(document.getElementById("username")?.value||"").trim().toLowerCase();
    const password=String(document.getElementById("password")?.value||"").toLowerCase();
    return username==="ransom"&&password==="ransom";
  }

  function youtubeEmbed(id,params={}){
    const query=new URLSearchParams({
      autoplay:"1",
      controls:"0",
      disablekb:"1",
      fs:"0",
      modestbranding:"1",
      playsinline:"1",
      rel:"0",
      iv_load_policy:"3",
      ...params
    });
    return `https://www.youtube-nocookie.com/embed/${id}?${query.toString()}`;
  }

  function frame(src,className){
    const iframe=document.createElement("iframe");
    iframe.className=className;
    iframe.src=src;
    iframe.allow="autoplay; encrypted-media; picture-in-picture";
    iframe.referrerPolicy="strict-origin-when-cross-origin";
    iframe.setAttribute("frameborder","0");
    iframe.setAttribute("aria-hidden","true");
    iframe.tabIndex=-1;
    return iframe;
  }

  function cleanup(){
    clearTimeout(timer);
    document.getElementById("genesisRansomEgg")?.remove();
    document.documentElement.classList.remove("genesis-ransom-running");
    active=false;
    const password=document.getElementById("password");
    if(password){password.value="";password.focus()}
  }

  function playTapeZero(root){
    if(!root?.isConnected)return cleanup();
    root.innerHTML="";
    root.className="genesis-ransom-egg tape-zero-stage";

    const shell=document.createElement("div");
    shell.className="genesis-tape-shell";
    const tape=frame(youtubeEmbed(TAPE_ZERO_VIDEO_ID,{start:"0",end:"12"}),"genesis-tape-video");
    const scan=document.createElement("div");
    scan.className="genesis-vhs-scan";
    const flicker=document.createElement("div");
    flicker.className="genesis-vhs-flicker";
    shell.append(tape,scan,flicker);
    root.appendChild(shell);

    timer=setTimeout(cleanup,TAPE_ZERO_DURATION_MS);
  }

  function start(){
    if(active)return;
    active=true;
    document.documentElement.classList.add("genesis-ransom-running");

    const root=document.createElement("div");
    root.id="genesisRansomEgg";
    root.className="genesis-ransom-egg scream-stage";
    root.setAttribute("role","presentation");

    const scream=frame(youtubeEmbed(FIRST_VIDEO_ID,{start:String(FIRST_START_SECONDS),end:"48"}),"genesis-scream-video");
    const flash=document.createElement("div");
    flash.className="genesis-ransom-flash";
    root.append(scream,flash);
    document.body.appendChild(root);

    timer=setTimeout(()=>playTapeZero(root),FIRST_DURATION_MS);
  }

  function intercept(event){
    if(!credentialsMatch())return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    start();
  }

  function install(){
    if(!/(?:^|\/)index\.html$/i.test(location.pathname)&&location.pathname!=="/"&&location.pathname!=="")return;
    document.addEventListener("click",event=>{
      if(event.target?.closest?.("#loginButton"))intercept(event);
    },true);
    document.addEventListener("keydown",event=>{
      if(event.key!=="Enter")return;
      if(event.target?.id==="password"||event.target?.id==="username")intercept(event);
    },true);
  }

  function injectStyles(){
    if(document.getElementById("genesisRansomEasterStyles"))return;
    const style=document.createElement("style");
    style.id="genesisRansomEasterStyles";
    style.textContent=`
      html.genesis-ransom-running,html.genesis-ransom-running body{overflow:hidden!important;background:#000!important}
      .genesis-ransom-egg{position:fixed;inset:0;z-index:2147483647;background:#000;display:grid;place-items:center;overflow:hidden;cursor:none}
      .genesis-ransom-egg iframe{border:0;pointer-events:none;background:#000}
      .genesis-scream-video{position:absolute;inset:-3%;width:106%;height:106%;object-fit:cover;filter:saturate(1.14) contrast(1.07)}
      .genesis-ransom-flash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%,transparent 0 52%,rgba(120,0,0,.14) 100%);mix-blend-mode:screen;animation:ransomFlash .12s steps(2,end) infinite}
      .genesis-tape-shell{position:relative;width:min(100vw,calc(100vh * 4 / 3));height:min(100vh,calc(100vw * 3 / 4));background:#000;overflow:hidden;box-shadow:0 0 0 100vmax #000}
      .genesis-tape-video{position:absolute;inset:0;width:100%;height:100%;transform:scale(1.006);filter:contrast(1.03) saturate(1.02)}
      .genesis-vhs-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 3px);mix-blend-mode:overlay;opacity:.65}
      .genesis-vhs-flicker{position:absolute;inset:-4%;pointer-events:none;background:linear-gradient(90deg,rgba(255,0,60,.025),transparent 28%,rgba(0,80,255,.03) 72%,transparent);animation:tapeFlicker .09s steps(2,end) infinite}
      @keyframes ransomFlash{0%,100%{opacity:.15}50%{opacity:.42}}
      @keyframes tapeFlicker{0%{opacity:.2;transform:translate(0,0)}35%{opacity:.44;transform:translate(-1px,0)}70%{opacity:.15;transform:translate(1px,-1px)}100%{opacity:.3;transform:translate(0,0)}}
      @media(prefers-reduced-motion:reduce){.genesis-ransom-flash,.genesis-vhs-flicker{animation:none}}
    `;
    document.head.appendChild(style);
  }

  injectStyles();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();

  global.GenesisRansomEaster=Object.freeze({start,cleanup,credentialsMatch});
})(globalThis);
