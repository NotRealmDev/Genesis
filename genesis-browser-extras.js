(function(global){
  'use strict';
  const BOOKMARKS='genesisBookmarksV1',THEME='genesisAuroraV1';
  function validUrl(value){try{const url=new URL(String(value));return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}}
  function cleanBookmarks(value){
    if(!Array.isArray(value))return [];
    const seen=new Set();return value.slice(0,200).flatMap(item=>{
      const url=validUrl(item?.url);if(!url||seen.has(url))return [];seen.add(url);
      return [{url,title:String(item?.title||new URL(url).hostname).slice(0,100)}];
    });
  }
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
  function cleanTheme(value={}){value=value&&typeof value==='object'?value:{};return {enabled:value.enabled!==false,hue:clamp(value.hue,0,360,155),second:clamp(value.second,0,360,270),brightness:clamp(value.brightness,0,100,45),speed:clamp(value.speed,10,90,35)}}
  let bookmarks=cleanBookmarks(read(BOOKMARKS,[])),theme=cleanTheme(read(THEME,{}));
  let lastKeyAt=0;
  const $=id=>document.getElementById(id);
  function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{console.warn('Genesis could not save browser customization.');return false}}
  function current(){return validUrl($('browserAddress')?.value)}
  function keyTone(event){
    if(event.key.length!==1||event.ctrlKey||event.metaKey||event.altKey)return;
    const now=performance.now();if(now-lastKeyAt>24){global.GenesisUI?.sound?.('key');lastKeyAt=now}
  }
  function bindFrameKeys(){
    try{const body=$('browserFrame')?.contentDocument?.body;if(body&&!body.__genesisKeySounds){body.__genesisKeySounds=true;body.addEventListener('keydown',keyTone,true)}}catch{}
  }
  function drawBookmarks(){
    const bar=$('genesisBookmarkBar'),star=$('genesisBookmarkStar');if(!bar||!star)return;
    bar.replaceChildren();const url=current(),saved=bookmarks.some(item=>item.url===url);
    star.innerHTML=`<svg viewBox="0 0 24 24"${saved?' fill="currentColor"':''}><path d="M12 3.7l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.72 6.9 19.4l.97-5.68L3.75 9.7l5.7-.83L12 3.7z"/></svg>`;star.setAttribute('aria-pressed',String(saved));star.title=saved?'Remove bookmark':'Bookmark this page';star.disabled=!url;
    for(const item of bookmarks){
      const group=document.createElement('span'),open=document.createElement('button'),remove=document.createElement('button');
      open.type=remove.type='button';open.className=remove.className='genesis-bookmark';open.textContent='★ '+item.title;open.title=item.url;
      open.onclick=()=>global.browserNavigate?.(item.url,true,true);
      remove.textContent='×';remove.setAttribute('aria-label','Remove '+item.title);remove.onclick=()=>{bookmarks=bookmarks.filter(mark=>mark.url!==item.url);persist(BOOKMARKS,bookmarks);drawBookmarks()};
      group.append(open,remove);bar.appendChild(group);
    }
    if(!bookmarks.length){const hint=document.createElement('span');hint.textContent='Use ☆ to save a website';hint.style.opacity='.6';bar.appendChild(hint)}
  }
  function browser(){
    const toolbar=document.querySelector('.browser-toolbar');if(!toolbar||$('genesisBookmarkStar'))return;
    const more=$('browserMore');
    const star=document.createElement('button');star.id='genesisBookmarkStar';star.className='nav-btn';star.type='button';star.setAttribute('aria-label','Toggle current page bookmark');
    star.onclick=()=>{const url=current();if(!url)return;if(bookmarks.some(item=>item.url===url))bookmarks=bookmarks.filter(item=>item.url!==url);else if(bookmarks.length<200)bookmarks.push({url,title:new URL(url).hostname});persist(BOOKMARKS,bookmarks);drawBookmarks()};toolbar.insertBefore(star,more);
    const bar=document.createElement('div');bar.id='genesisBookmarkBar';bar.setAttribute('aria-label','Bookmarks');toolbar.after(bar);
    const address=$('browserAddress');
    address?.addEventListener('input',drawBookmarks);
    address?.addEventListener('keydown',keyTone);
    const full=document.createElement('button');full.id='genesisBrowserFullscreen';full.className='nav-btn';full.type='button';
    const browserRoot=toolbar.closest('.browser');
    const syncFull=()=>{const active=(document.fullscreenElement||document.webkitFullscreenElement)===browserRoot;full.innerHTML=active?'<svg viewBox="0 0 24 24"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>';full.title=active?'Exit fullscreen':'Fullscreen browser';full.setAttribute('aria-label',full.title);full.setAttribute('aria-pressed',String(active))};
    full.onclick=async()=>{try{const active=document.fullscreenElement||document.webkitFullscreenElement;if(active===browserRoot){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document)}else{const enter=browserRoot?.requestFullscreen||browserRoot?.webkitRequestFullscreen;if(enter)await enter.call(browserRoot)}}catch(error){const status=$('browserStatus');if(status)status.textContent='Fullscreen could not start · '+(error?.message||String(error))}syncFull()};
    document.addEventListener('fullscreenchange',syncFull);document.addEventListener('webkitfullscreenchange',syncFull);syncFull();toolbar.insertBefore(full,more);
    $('browserFrame')?.addEventListener('load',()=>{drawBookmarks();bindFrameKeys()});drawBookmarks();
  }
  function applyTheme(){
    const layer=$('genesisAurora');if(!layer)return;
    layer.hidden=!theme.enabled;layer.style.setProperty('--aurora-hue',theme.hue);layer.style.setProperty('--aurora-second',theme.second);layer.style.opacity=String(theme.brightness/100);layer.style.setProperty('--aurora-duration',theme.speed+'s');
  }
  function settings(){
    const panel=$('genesisAuroraSettings');if(!panel||panel.__bound)return;panel.__bound=true;
    panel.querySelectorAll('input').forEach(input=>{input.oninput=()=>{theme[input.dataset.theme]=input.type==='checkbox'?input.checked:Number(input.value);theme=cleanTheme(theme);applyTheme();persist(THEME,theme)}});
  }
  function install(){
    if(!/(?:^|\/)os\.html$/i.test(location.pathname))return;
    const style=document.createElement('style');style.textContent='#genesisBookmarkBar{flex:none;min-height:40px;padding:7px 12px;display:flex;align-items:center;gap:8px;overflow-x:auto;white-space:nowrap;font:12px system-ui;border-bottom:1px solid #ffffff12;background:linear-gradient(90deg,#ffffff05,transparent)}.genesis-bookmark{border:1px solid #ffffff0d;border-radius:9px;background:#ffffff09;color:inherit;padding:6px 9px;cursor:pointer;transition:transform .16s,background .16s}.genesis-bookmark:hover{background:#ffffff14;transform:translateY(-1px)}#genesisBookmarkStar{color:#ffda78}.browser:fullscreen,.browser:-webkit-full-screen{width:100vw;height:100vh;background:#060912}.browser-toolbar{box-shadow:0 8px 24px #0000001f}.browser-address{transition:background .18s,border-color .18s,box-shadow .18s}.browser-address:focus{box-shadow:0 0 0 3px hsla(var(--accent),75%,55%,.13)}#genesisAurora{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}#genesisAurora i{position:absolute;width:130%;height:65%;top:-18%;left:-15%;filter:blur(32px);background:radial-gradient(ellipse at 35% 55%,hsla(var(--aurora-hue),95%,65%,.8),transparent 42%),radial-gradient(ellipse at 70% 50%,hsla(var(--aurora-second),95%,65%,.8),transparent 40%);transform:rotate(-16deg) skewY(-12deg);animation:genesisAuroraDrift var(--aurora-duration) ease-in-out infinite alternate}#genesisAurora i:nth-child(2){top:20%;animation-delay:-14s;opacity:.5}#genesisAurora i:nth-child(3){top:45%;animation-delay:-24s;opacity:.3}@keyframes genesisAuroraDrift{to{transform:translate(8%,15%) rotate(9deg) skewY(16deg)}}@media(prefers-reduced-motion:reduce){#genesisAurora i{animation:none}}';document.head.appendChild(style);
    const os=$('os');if(os&&!$('genesisAurora')){const layer=document.createElement('div');layer.id='genesisAurora';layer.setAttribute('aria-hidden','true');layer.innerHTML='<i></i><i></i><i></i>';os.prepend(layer);applyTheme()}
    try{
      if(typeof apps==='object'&&apps.settings&&!apps.settings.__aurora){const content=apps.settings.content;apps.settings.__aurora=true;apps.settings.content=()=>{const base=typeof content==='function'?content():content;const controls=`<div id="genesisAuroraSettings"><h3>Northern lights</h3><label><input type="checkbox" data-theme="enabled" ${theme.enabled?'checked':''}> Enable northern lights</label>${[['hue','Primary color',0,360],['second','Second color',0,360],['brightness','Brightness',0,100],['speed','Animation duration (seconds)',10,90]].map(([key,label,min,max])=>`<div class="setting"><label>${label}</label><input type="range" data-theme="${key}" min="${min}" max="${max}" value="${theme[key]}"></div>`).join('')}</div>`;return base.replace(/<\/div>\s*$/,controls+'</div>')}}
    }catch(error){console.warn('Aurora settings unavailable',error)}
    if(typeof global.browserNavigate==='function'){const navigate=global.browserNavigate;global.browserNavigate=function(url,...args){const result=navigate.call(this,url,...args);Promise.resolve(result).finally(drawBookmarks).catch(()=>{});return result}}
    let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;browser();settings()})}).observe(os||document.body,{childList:true,subtree:true});browser();settings();
    global.addEventListener('storage',event=>{if(event.key===BOOKMARKS){bookmarks=cleanBookmarks(read(BOOKMARKS,[]));drawBookmarks()}if(event.key===THEME){theme=cleanTheme(read(THEME,{}));applyTheme()}});
  }
  global.GenesisBrowserExtras={validUrl,cleanBookmarks,cleanTheme};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
