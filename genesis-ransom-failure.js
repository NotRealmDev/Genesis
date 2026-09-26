(function(global){
  "use strict";

  const JUMP_SELECTOR="video.ransom-jumpscare-video";
  let handled=false;

  function endGenesisTab(){
    try{ global.open("","_self"); }catch{}
    try{ global.close(); }catch{}
    setTimeout(()=>{
      try{
        if(!global.closed) global.location.replace("about:blank");
      }catch{}
    },120);
  }

  function fullscreenJumpscare(video){
    if(!video||handled)return;
    handled=true;

    const win=video.closest?.(".ransom-jumpscare-window,.ransom-os-window");
    const bar=win?.querySelector?.(".ransom-window-bar");
    const content=win?.querySelector?.(".ransom-window-content");

    document.documentElement.classList.add("ransom-jumpscare-fullscreen-active");

    if(win){
      Object.assign(win.style,{
        position:"fixed",
        inset:"0",
        left:"0",
        top:"0",
        width:"100vw",
        height:"100vh",
        maxWidth:"none",
        maxHeight:"none",
        margin:"0",
        border:"0",
        borderRadius:"0",
        transform:"none",
        zIndex:"2147483647",
        background:"#000",
        boxShadow:"none"
      });
    }

    if(bar) bar.style.display="none";
    if(content){
      Object.assign(content.style,{
        position:"absolute",
        inset:"0",
        width:"100%",
        height:"100%",
        background:"#000"
      });
    }

    Object.assign(video.style,{
      position:"absolute",
      inset:"0",
      width:"100vw",
      height:"100vh",
      maxWidth:"none",
      maxHeight:"none",
      objectFit:"cover",
      background:"#000",
      margin:"0"
    });

    video.muted=true;

    let finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;
      endGenesisTab();
    };

    video.addEventListener("ended",finish,{once:true});
    video.addEventListener("error",()=>setTimeout(finish,350),{once:true});

    // Safety fallback in case the media event is swallowed by the browser.
    setTimeout(finish,4200);
  }

  function scan(root=document){
    const direct=root?.matches?.(JUMP_SELECTOR)?root:null;
    const found=direct||root?.querySelector?.(JUMP_SELECTOR);
    if(found) fullscreenJumpscare(found);
  }

  const observer=new MutationObserver(records=>{
    if(handled)return;
    for(const record of records){
      for(const node of record.addedNodes){
        if(node?.nodeType===1)scan(node);
      }
    }
  });

  function install(){
    const style=document.createElement("style");
    style.textContent=`
      .ransom-jumpscare-fullscreen-active,
      .ransom-jumpscare-fullscreen-active body{overflow:hidden!important;background:#000!important}
      .ransom-jumpscare-fullscreen-active #genesisRansomOSEvent{z-index:2147483647!important}
      .ransom-jumpscare-fullscreen-active .ransom-jumpscare-window{position:fixed!important;inset:0!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;transform:none!important;border:0!important;border-radius:0!important;margin:0!important;z-index:2147483647!important;background:#000!important;box-shadow:none!important}
      .ransom-jumpscare-fullscreen-active .ransom-jumpscare-window .ransom-window-bar{display:none!important}
      .ransom-jumpscare-fullscreen-active .ransom-jumpscare-window .ransom-window-content{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;background:#000!important}
      .ransom-jumpscare-fullscreen-active .ransom-jumpscare-video{position:absolute!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;object-fit:cover!important;background:#000!important;margin:0!important}
    `;
    document.head.appendChild(style);
    scan();
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})(globalThis);
