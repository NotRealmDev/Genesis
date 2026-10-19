/* Genesis GPT is a native chat surface. Shared defaults are optional and admin-managed. */
(function(global){
  "use strict";
  const KEY="genesisGPTApiKeySession";
  const MODEL_KEY="genesisGPTModelSession";
  const SHARED_TABLE="genesis_gpt_config";
  const sessions=new WeakMap();
  const providers=Object.freeze({
    openai:{name:"ChatGPT API",endpoint:"https://api.openai.com/v1/responses",model:"gpt-5-mini",protocol:"responses"},
    compatible:{name:"OpenAI-compatible API",endpoint:"",model:"",protocol:"chat"}
  });
  function read(key){try{return sessionStorage.getItem(key)||""}catch{return""}}
  function write(key,value){try{sessionStorage.setItem(key,value)}catch{}}
  function backend(){
    const value=global.GENESIS_BACKEND||{};
    return /^https:\/\/.+\.supabase\.co$/i.test(String(value.url||""))&&String(value.anonKey||"").length>20?value:null;
  }
  function isAdmin(){
    try{return typeof global.genesisRole==="function"&&global.genesisRole()==="admin"}catch{}
    try{const login=JSON.parse(localStorage.getItem("genesisLogin")||"null");return login?.role==="admin"&&Number(login.expires)>Date.now()}catch{return false}
  }
  function html(){
    return `<div class="gpt-app">
      <div class="gpt-toolbar"><div class="gpt-provider-label"><span class="gpt-mark-small">✦</span><select class="gpt-provider" aria-label="AI provider"><option value="openai">ChatGPT API</option><option value="compatible">OpenAI-compatible API</option></select></div>
      <button type="button" class="os-btn" data-gpt-action="new">New chat</button><button type="button" class="os-btn" data-gpt-action="settings">API settings</button></div>
      <div class="gpt-config" hidden><div class="gpt-config-title">Connect your AI</div><p class="gpt-config-copy">Genesis uses the shared default when an administrator has configured one. Otherwise your key stays only in this browser session. <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an OpenAI API key</a>.</p><label>API key<input type="password" class="gpt-key" autocomplete="off" placeholder="sk-…"></label><label>Endpoint<input type="url" class="gpt-endpoint" placeholder="https://api.openai.com/v1/responses"></label><label>Model<input type="text" class="gpt-model" placeholder="gpt-5-mini"></label>
        <div class="gpt-managed-copy" hidden>Genesis default is active. Only administrators can change the shared key or API endpoint.</div>
        <div class="gpt-config-actions"><button type="button" class="os-btn" data-gpt-action="clear">Clear session key</button><button type="button" class="os-btn gpt-save" data-gpt-action="save">Save in session</button></div>
        <div class="gpt-shared-panel" hidden><div class="gpt-shared-title">Genesis default (admins only)</div><p class="gpt-shared-copy">This publishes one default for everyone. A browser-side key can be inspected by users; use a server-side proxy for production secrets.</p><label>Default API key<input type="password" class="gpt-shared-key" autocomplete="off" placeholder="sk-…"></label><label>Default endpoint<input type="url" class="gpt-shared-endpoint" placeholder="https://api.openai.com/v1/responses"></label><label>Default model<input type="text" class="gpt-shared-model" placeholder="gpt-5-mini"></label><div class="gpt-config-actions"><button type="button" class="os-btn" data-gpt-action="clear-shared">Remove default</button><button type="button" class="os-btn gpt-save" data-gpt-action="save-shared">Publish default</button></div><div class="gpt-shared-status" role="status" aria-live="polite"></div></div>
      </div>
      <div class="gpt-status" role="status" aria-live="polite">Ready</div><div class="gpt-messages" aria-live="polite"></div>
      <form class="gpt-composer"><textarea class="gpt-input" rows="1" maxlength="8000" placeholder="Ask ChatGPT anything…"></textarea><button class="gpt-send" type="submit" aria-label="Send message">↑</button></form>
      <div class="gpt-footer">Genesis talks to the API you choose. Conversations stay in this browser session.</div></div>`;
  }
  function escape(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
  function provider(state){return providers[state.select.value]||providers.openai}
  function config(state){
    const p=provider(state),shared=state.shared,key=shared?.api_key||read(KEY),model=shared?.model||read(MODEL_KEY)||p.model;
    state.key.value=key;state.endpoint.value=shared?.endpoint||p.endpoint||"";state.model.value=model||"";
    const managed=!!shared&&!isAdmin();
    state.key.disabled=managed;state.endpoint.disabled=managed;state.model.disabled=managed;
    state.managedCopy.hidden=!managed;
    state.sharedPanel.hidden=!isAdmin();
    if(isAdmin()){
      state.sharedKey.value=shared?.api_key||"";state.sharedEndpoint.value=shared?.endpoint||providers.openai.endpoint;state.sharedModel.value=shared?.model||providers.openai.model;
    }
  }
  async function loadSharedConfig(state){
    const b=backend();if(!b)return;
    try{
      const response=await fetch(`${b.url}/rest/v1/${SHARED_TABLE}?select=id,endpoint,model,api_key,updated_at&limit=1`,{headers:{apikey:b.anonKey,accept:"application/json"},cache:"no-store"});
      if(!response.ok)return;
      const rows=await response.json();const row=Array.isArray(rows)?rows[0]:rows;
      if(row?.api_key)state.shared={api_key:String(row.api_key),endpoint:String(row.endpoint||providers.openai.endpoint),model:String(row.model||providers.openai.model)};
      config(state);
      if(state.shared)status(state,"Using the Genesis default API key.");
    }catch{}
  }
  function render(state){
    state.messages.innerHTML=state.history.length?state.history.map(m=>'<article class="gpt-message '+m.role+'"><div class="gpt-message-role">'+(m.role==="user"?"You":"Genesis AI")+'</div><div class="gpt-message-text">'+escape(m.text).replace(/\n/g,"<br>")+'</div></article>').join(""):'<div class="gpt-empty"><div class="gpt-empty-mark">✦</div><h2>Your AI workspace</h2><p>Connect ChatGPT with API settings, then start a conversation.</p></div>';
    state.messages.scrollTop=state.messages.scrollHeight;
  }
  function status(state,text,error=false){state.status.textContent=text;state.status.classList.toggle("error",!!error)}
  function save(state){
    if(state.shared&&!isAdmin()){status(state,"The Genesis default is managed by an administrator.");return}
    write(KEY,state.key.value.trim());
    if(state.model.value.trim())write(MODEL_KEY,state.model.value.trim());
    state.config.hidden=true;status(state,state.key.value.trim()?"API settings saved for this session":"Add an API key to start.");
  }
  async function publishShared(state){
    if(!isAdmin()){status(state,"Only administrators can publish the Genesis default.",true);return}
    const apiKey=state.sharedKey.value.trim(),endpoint=state.sharedEndpoint.value.trim()||providers.openai.endpoint,model=state.sharedModel.value.trim()||providers.openai.model;
    if(!apiKey){state.sharedStatus.textContent="Enter a default API key first.";return}
    try{
      if(typeof global.genesisAdminRequest!=="function")throw Error("Admin connection is unavailable. Sign in again.");
      await global.genesisAdminRequest(`${SHARED_TABLE}?on_conflict=id`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:1,api_key:apiKey,endpoint,model,updated_at:new Date().toISOString()})},{interactive:false});
      state.shared={api_key:apiKey,endpoint,model};config(state);state.sharedStatus.textContent="Published for everyone.";status(state,"Genesis default published.");
    }catch(error){state.sharedStatus.textContent="Could not publish: "+(error?.message||String(error))}
  }
  async function clearShared(state){
    if(!isAdmin())return;
    try{
      if(typeof global.genesisAdminRequest!=="function")throw Error("Admin connection is unavailable. Sign in again.");
      await global.genesisAdminRequest(`${SHARED_TABLE}?id=eq.1`,{method:"DELETE"},{interactive:false});
      state.shared=null;state.sharedKey.value="";config(state);state.sharedStatus.textContent="Removed.";status(state,"Genesis default removed.");
    }catch(error){state.sharedStatus.textContent="Could not remove: "+(error?.message||String(error))}
  }
  function extractResponse(data){
    if(typeof data.output_text==="string")return data.output_text.trim();
    const output=Array.isArray(data.output)?data.output:[];let text="";
    for(const item of output){for(const part of (item.content||[])){if(typeof part.text==="string")text+=part.text}}
    if(text.trim())return text.trim();
    return data.choices?.[0]?.message?.content||"";
  }
  async function request(state,history){
    const p=provider(state),shared=state.shared,endpoint=shared?.endpoint||state.endpoint.value.trim()||p.endpoint,key=shared?.api_key||state.key.value.trim(),model=shared?.model||state.model.value.trim()||p.model;
    if(!key)throw Error("Add your API key in API settings first.");
    if(!endpoint)throw Error("Add an API endpoint in API settings.");
    const headers={"content-type":"application/json","authorization":"Bearer "+key};let body;
    if(endpoint.includes("/responses"))body={model,input:history.map(m=>({role:m.role,content:[{type:m.role==="assistant"?"output_text":"input_text",text:m.text}]})),store:false};
    else body={model,messages:history.map(m=>({role:m.role,content:m.text})),stream:false};
    const response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify(body),signal:state.abort.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error?.message||"The AI API returned HTTP "+response.status+".");
    const text=extractResponse(data);if(!text)throw Error("The AI API returned an empty response.");return text;
  }
  async function send(state,text){
    if(state.busy)return;
    const clean=String(text||"").trim();if(!clean)return;
    if(state.sharedReady)await state.sharedReady;
    state.history.push({role:"user",text:clean});render(state);state.input.value="";state.busy=true;state.send.disabled=true;status(state,"Thinking…");state.abort=new AbortController();
    try{const answer=await request(state,state.history);state.history.push({role:"assistant",text:answer});status(state,"Ready")}catch(error){if(error.name!=="AbortError"){state.history.push({role:"assistant",text:"I couldn't complete that request: "+error.message});status(state,error.message,true)}}finally{state.busy=false;state.send.disabled=false;render(state)}
  }
  function init(win){
    if(!win?.isConnected||sessions.has(win))return;
    const q=s=>win.querySelector(s),state={win,history:[],busy:false,abort:new AbortController(),shared:null,sharedReady:null,select:q(".gpt-provider"),config:q(".gpt-config"),key:q(".gpt-key"),endpoint:q(".gpt-endpoint"),model:q(".gpt-model"),managedCopy:q(".gpt-managed-copy"),sharedPanel:q(".gpt-shared-panel"),sharedKey:q(".gpt-shared-key"),sharedEndpoint:q(".gpt-shared-endpoint"),sharedModel:q(".gpt-shared-model"),sharedStatus:q(".gpt-shared-status"),status:q(".gpt-status"),messages:q(".gpt-messages"),input:q(".gpt-input"),send:q(".gpt-send")};
    sessions.set(win,state);config(state);render(state);state.sharedReady=loadSharedConfig(state);
    q('[data-gpt-action="settings"]').onclick=()=>{config(state);state.config.hidden=!state.config.hidden};
    q('[data-gpt-action="save"]').onclick=()=>save(state);
    q('[data-gpt-action="clear"]').onclick=()=>{if(state.shared&&!isAdmin()){status(state,"The Genesis default remains active.");return}state.key.value="";write(KEY,"");status(state,"Session key cleared.")};
    q('[data-gpt-action="save-shared"]').onclick=()=>publishShared(state);
    q('[data-gpt-action="clear-shared"]').onclick=()=>clearShared(state);
    q('[data-gpt-action="new"]').onclick=()=>{state.history=[];status(state,"New chat");render(state);state.input.focus()};
    state.select.onchange=()=>{config(state);status(state,"Provider changed · save API settings before sending.")};
    q(".gpt-composer").onsubmit=e=>{e.preventDefault();send(state,state.input.value)};
    state.input.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(state,state.input.value)}};
    if(!read(KEY)&&!state.shared)state.config.hidden=false;
  }
  function close(win){const state=sessions.get(win);if(!state)return;state.abort.abort();sessions.delete(win)}
  global.GenesisGPT=Object.freeze({html,init,close});
})(window);
