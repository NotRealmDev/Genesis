/* AI websites use the same Genesis proxy as Browser, in their own frame. */
(function(global){
  "use strict";
  const providers=Object.freeze({
    chatgpt:{name:"ChatGPT",url:"https://chatgpt.com/"},
    claude:{name:"Claude",url:"https://claude.ai/"},
    gemini:{name:"Gemini",url:"https://gemini.google.com/app"},
    duck:{name:"Duck.ai",url:"https://duck.ai/"}
  });
  const preferenceKey="genesisAIProviderV1";
  const sessions=new WeakMap();
  function selectedProvider(){
    try{const value=localStorage.getItem(preferenceKey);if(Object.hasOwn(providers,value))return value;}catch{}
    return "chatgpt";
  }
  function html(){
    return `<div class="gpt-app">
      <div class="gpt-toolbar">
        <label class="gpt-provider-label">AI <select class="gpt-provider" aria-label="AI service">${Object.entries(providers).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join("")}</select></label>
        <button type="button" class="os-btn" data-gpt-action="new">New chat</button>
        <button type="button" class="os-btn gpt-refresh" data-gpt-action="reload" aria-label="Reload AI" title="Reload AI">↻</button>
        <a class="os-btn gpt-external" target="_blank" rel="noopener noreferrer">Open website ↗</a>
      </div>
      <div class="gpt-status" role="status" aria-live="polite">Preparing your AI workspace…</div>
      <div class="gpt-stage">
        <div class="gpt-frame-host"></div>
        <div class="gpt-overlay">
          <div class="gpt-card">
            <div class="gpt-mark" aria-hidden="true">✦</div>
            <h2 class="gpt-heading">Opening ChatGPT</h2>
            <p class="gpt-detail">Connecting to your AI service…</p>
            <button type="button" class="os-btn gpt-retry" hidden>Try again</button>
          </div>
        </div>
      </div>
      <div class="gpt-footer">Your selected AI service handles chats and sign-in. An internet connection is required.</div>
    </div>`;
  }
  function alive(state,attempt){return !state.closed && state.win.isConnected && state.attempt===attempt;}
  function clearTimer(state){clearTimeout(state.timer);state.timer=null;}
  function showError(state,message){
    if(state.closed)return;
    clearTimer(state);
    state.overlay.hidden=false;
    state.overlay.classList.remove("loading");
    state.heading.textContent="Couldn’t open "+providers[state.provider].name;
    state.detail.textContent=message+" Try again, choose another AI above, or open its website.";
    state.retry.hidden=false;
    state.status.textContent=providers[state.provider].name+" · Connection unavailable";
  }
  async function navigate(state,id){
    if(state.closed || !Object.hasOwn(providers,id))return;
    const attempt=++state.attempt;
    state.provider=id;
    state.select.value=id;
    try{localStorage.setItem(preferenceKey,id);}catch{}
    clearTimer(state);
    state.frameEvents?.abort();
    // Detaching the old frame prevents an older asynchronous connection from
    // navigating the newly selected service or a reopened GPT window.
    state.host.replaceChildren();
    const provider=providers[id];
    state.external.href=provider.url;
    state.external.setAttribute("aria-label","Open "+provider.name+" website in a new tab");
    state.status.textContent="Connecting to "+provider.name+"…";
    state.heading.textContent="Opening "+provider.name;
    state.detail.textContent="Connecting to your AI service…";
    state.retry.hidden=true;
    state.overlay.hidden=false;
    state.overlay.classList.add("loading");
    const frame=document.createElement("iframe");
    frame.className="gpt-frame";
    frame.title=provider.name;
    frame.referrerPolicy="no-referrer";
    frame.allow="clipboard-read; clipboard-write; microphone; fullscreen";
    state.frame=frame;
    state.proxyFrame=null;
    state.host.appendChild(frame);
    const events=new AbortController();
    state.frameEvents=events;
    frame.addEventListener("load",()=>{
      if(!alive(state,attempt) || !frame.getAttribute("src") || frame.getAttribute("src")==="about:blank")return;
      const failure=global.GenesisPrism?.readFrameProxyFailure?.(frame);
      if(failure){showError(state,"The connection to this service failed.");return;}
      clearTimer(state);
      state.overlay.hidden=true;
      state.overlay.classList.remove("loading");
      state.status.textContent=provider.name;
    },{signal:events.signal});
    global.addEventListener("message",event=>{
      if(!alive(state,attempt) || event.source!==frame.contentWindow || event.origin!==location.origin)return;
      if(event.data?.$genesisProxyError)showError(state,"The connection to this service failed.");
    },{signal:events.signal});
    state.timer=setTimeout(()=>{
      if(alive(state,attempt))showError(state,"This service is taking too long to respond.");
    },45000);
    try{
      const runtime=await global.ensureGenesisPrismRuntime(state.status);
      if(!alive(state,attempt))return;
      const proxyFrame=await runtime.createFrame(frame);
      if(!alive(state,attempt))return;
      state.proxyFrame=proxyFrame;
      state.status.textContent="Loading "+provider.name+"…";
      await proxyFrame.go(provider.url);
    }catch(error){
      if(alive(state,attempt))showError(state,error?.message||"The connection could not be started.");
    }
  }
  function init(win){
    if(!win?.isConnected || sessions.has(win))return;
    const get=selector=>win.querySelector(selector);
    const state={win,closed:false,attempt:0,provider:selectedProvider(),
      select:get(".gpt-provider"),external:get(".gpt-external"),status:get(".gpt-status"),
      host:get(".gpt-frame-host"),overlay:get(".gpt-overlay"),heading:get(".gpt-heading"),
      detail:get(".gpt-detail"),retry:get(".gpt-retry"),events:new AbortController()};
    sessions.set(win,state);
    const options={signal:state.events.signal};
    state.select.addEventListener("change",()=>navigate(state,state.select.value),options);
    state.retry.addEventListener("click",()=>navigate(state,state.provider),options);
    get('[data-gpt-action="new"]').addEventListener("click",()=>navigate(state,state.provider),options);
    get('[data-gpt-action="reload"]').addEventListener("click",()=>{
      if(state.proxyFrame && state.overlay.hidden){
        // Refresh retains the service's current conversation URL.
        const attempt=state.attempt;
        clearTimer(state);
        state.status.textContent="Reloading "+providers[state.provider].name+"…";
        state.timer=setTimeout(()=>{if(alive(state,attempt))showError(state,"This service is taking too long to respond.");},45000);
        try{
          Promise.resolve(state.proxyFrame.reload()).catch(error=>{
            if(alive(state,attempt))showError(state,error?.message||"The page could not be reloaded.");
          });
        }catch{navigate(state,state.provider);}
      }else navigate(state,state.provider);
    },options);
    navigate(state,state.provider);
  }
  function close(win){
    const state=sessions.get(win);
    if(!state)return;
    state.closed=true;
    state.attempt++;
    clearTimer(state);
    state.events.abort();
    state.frameEvents?.abort();
    state.host.replaceChildren();
    sessions.delete(win);
    Promise.resolve(global.GenesisPrism?.persistSession?.()).catch(()=>{});
  }
  global.GenesisGPT=Object.freeze({html,init,close});
})(window);
