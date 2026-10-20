/* Genesis GPT prefers an authenticated Supabase Edge Function; optional BYOK stays session-only. */
(function(global){
  "use strict";
  const KEY="genesisGPTApiKeySession";
  const MODEL_KEY="genesisGPTModelSession";
  const FUNCTION_NAME="genesis-gpt";
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
      <div class="gpt-config" hidden>
        <div class="gpt-config-title">GPT connection</div>
        <p class="gpt-config-copy">Genesis uses its secured Supabase GPT service for authenticated accounts when configured. Your OpenAI API key is kept on the server, never delivered to browsers. Optional personal API settings below stay in this browser session.</p>
        <label>Optional personal API key<input type="password" class="gpt-key" autocomplete="off" placeholder="Leave empty for secure Genesis GPT"></label>
        <label>Personal API endpoint<input type="url" class="gpt-endpoint" placeholder="https://api.openai.com/v1/responses"></label>
        <label>Model (personal key only)<input type="text" class="gpt-model" placeholder="gpt-5-mini"></label>
        <div class="gpt-config-actions"><button type="button" class="os-btn" data-gpt-action="clear">Clear session key</button><button type="button" class="os-btn gpt-save" data-gpt-action="save">Save in session</button></div>
      </div>
      <div class="gpt-status" role="status" aria-live="polite">Ready</div><div class="gpt-messages" aria-live="polite"></div>
      <form class="gpt-composer"><textarea class="gpt-input" rows="1" maxlength="8000" placeholder="Ask ChatGPT anything…"></textarea><button class="gpt-send" type="submit" aria-label="Send message">↑</button></form>
      <div class="gpt-footer">Genesis talks to the API you choose. Conversations stay in this browser session.</div></div>`;
  }
  function escape(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
  function provider(state){return providers[state.select.value]||providers.openai}
  function config(state){
    const p=provider(state);
    state.key.value=read(KEY);
    state.endpoint.value=p.endpoint||"";
    state.model.value=read(MODEL_KEY)||p.model||"";
  }
  function render(state){
    state.messages.innerHTML=state.history.length?state.history.map(m=>'<article class="gpt-message '+m.role+'"><div class="gpt-message-role">'+(m.role==="user"?"You":"Genesis AI")+'</div><div class="gpt-message-text">'+escape(m.text).replace(/\n/g,"<br>")+'</div></article>').join(""):'<div class="gpt-empty"><div class="gpt-empty-mark">✦</div><h2>Your AI workspace</h2><p>Ask anything. Genesis uses the securely configured GPT service when available.</p></div>';
    state.messages.scrollTop=state.messages.scrollHeight;
  }
  function status(state,text,error=false){state.status.textContent=text;state.status.classList.toggle("error",!!error)}
  function save(state){
    write(KEY,state.key.value.trim());
    if(state.model.value.trim())write(MODEL_KEY,state.model.value.trim());
    state.config.hidden=true;
    status(state,state.key.value.trim()?"Personal API settings saved for this session.":"Using secure Genesis GPT when available.");
  }
  function extractResponse(data){
    if(typeof data.output_text==="string")return data.output_text.trim();
    const output=Array.isArray(data.output)?data.output:[];let text="";
    for(const item of output){for(const part of (item.content||[])){if(typeof part.text==="string")text+=part.text}}
    if(text.trim())return text.trim();
    return data.choices?.[0]?.message?.content||"";
  }
  async function request(state,history){
    const p=provider(state),key=state.key.value.trim();
    const endpoint=state.endpoint.value.trim()||p.endpoint,model=state.model.value.trim()||p.model;
    let response;
    if(state.select.value==="openai"&&!key){
      const b=backend();
      if(!b)throw Error("The secure Genesis GPT service is not configured.");
      let token="";
      try{token=await global.GenesisAdminAuth?.getSessionToken({interactive:false})||""}catch{}
      if(!token)throw Error("Secure GPT requires a verified Supabase account. Sign in as Genesis Admin, or use a personal API key in settings.");
      response=await fetch(b.url+"/functions/v1/"+FUNCTION_NAME,{
        method:"POST",
        headers:{"content-type":"application/json","apikey":b.anonKey,"authorization":"Bearer "+token},
        body:JSON.stringify({messages:history.slice(-12)}),
        signal:state.abort.signal
      });
    }else{
      if(!key)throw Error("Add a personal API key for this provider.");
      if(!endpoint)throw Error("Set a personal API endpoint.");
      const headers={"content-type":"application/json","authorization":"Bearer "+key};
      const body=endpoint.includes("/responses")
        ? {model,input:history.map(m=>({role:m.role,content:m.text})),store:false}
        : {model,messages:history.map(m=>({role:m.role,content:m.text})),stream:false};
      response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify(body),signal:state.abort.signal});
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error?.message||"The GPT service returned HTTP "+response.status+".");
    const text=extractResponse(data);
    if(!text)throw Error("The GPT service returned an empty response.");
    return text;
  }
  async function send(state,text){
    if(state.busy)return;
    const clean=String(text||"").trim();if(!clean)return;
    state.history.push({role:"user",text:clean});render(state);state.input.value="";state.busy=true;state.send.disabled=true;status(state,"Thinking…");state.abort=new AbortController();
    try{const answer=await request(state,state.history);state.history.push({role:"assistant",text:answer});status(state,"Ready")}catch(error){if(error.name!=="AbortError"){state.history.push({role:"assistant",text:"I couldn't complete that request: "+error.message});status(state,error.message,true)}}finally{state.busy=false;state.send.disabled=false;render(state)}
  }
  function init(win){
    if(!win?.isConnected||sessions.has(win))return;
    const q=s=>win.querySelector(s),state={
      win,history:[],busy:false,abort:new AbortController(),
      select:q(".gpt-provider"),config:q(".gpt-config"),key:q(".gpt-key"),
      endpoint:q(".gpt-endpoint"),model:q(".gpt-model"),
      status:q(".gpt-status"),messages:q(".gpt-messages"),
      input:q(".gpt-input"),send:q(".gpt-send")
    };
    sessions.set(win,state);config(state);render(state);
    q('[data-gpt-action="settings"]').onclick=()=>{config(state);state.config.hidden=!state.config.hidden};
    q('[data-gpt-action="save"]').onclick=()=>save(state);
    q('[data-gpt-action="clear"]').onclick=()=>{
      state.key.value="";write(KEY,"");
      status(state,"Personal key cleared. Secure Genesis GPT is the default.");
    };
    q('[data-gpt-action="new"]').onclick=()=>{state.history=[];status(state,"New chat");render(state);state.input.focus()};
    state.select.onchange=()=>{config(state);status(state,"Provider changed.")};
    q(".gpt-composer").onsubmit=e=>{e.preventDefault();send(state,state.input.value)};
    state.input.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(state,state.input.value)}};
  }
  function close(win){const state=sessions.get(win);if(!state)return;state.abort.abort();sessions.delete(win)}
  global.GenesisGPT=Object.freeze({html,init,close});
})(window);
