/* Genesis GPT is a native chat surface. Keys stay in sessionStorage and are never committed. */
(function(global){
  "use strict";
  const KEY="genesisGPTApiKeySession";
  const MODEL_KEY="genesisGPTModelSession";
  const sessions=new WeakMap();
  const providers=Object.freeze({
    openai:{name:"ChatGPT API",endpoint:"https://api.openai.com/v1/responses",model:"gpt-5-mini",protocol:"responses"},
    compatible:{name:"OpenAI-compatible API",endpoint:"",model:"",protocol:"chat"}
  });
  function read(key){try{return sessionStorage.getItem(key)||""}catch{return""}}
  function write(key,value){try{sessionStorage.setItem(key,value)}catch{}}
  function html(){
    return '<div class="gpt-app">'+
      '<div class="gpt-toolbar"><div class="gpt-provider-label"><span class="gpt-mark-small">✦</span><select class="gpt-provider" aria-label="AI provider"><option value="openai">ChatGPT API</option><option value="compatible">OpenAI-compatible API</option></select></div>'+
      '<button type="button" class="os-btn" data-gpt-action="new">New chat</button><button type="button" class="os-btn" data-gpt-action="settings">API settings</button></div>'+
      '<div class="gpt-config" hidden><div class="gpt-config-title">Connect your AI</div><p class="gpt-config-copy">Your key is held only in this browser session. Genesis never commits or shares it.</p><label>API key<input type="password" class="gpt-key" autocomplete="off" placeholder="sk-…"></label><label>Endpoint<input type="url" class="gpt-endpoint" placeholder="https://api.openai.com/v1/responses"></label><label>Model<input type="text" class="gpt-model" placeholder="gpt-5-mini"></label><div class="gpt-config-actions"><button type="button" class="os-btn" data-gpt-action="clear">Clear key</button><button type="button" class="os-btn gpt-save" data-gpt-action="save">Save in session</button></div></div>'+
      '<div class="gpt-status" role="status" aria-live="polite">Ready</div><div class="gpt-messages" aria-live="polite"></div>'+
      '<form class="gpt-composer"><textarea class="gpt-input" rows="1" maxlength="8000" placeholder="Ask ChatGPT anything…"></textarea><button class="gpt-send" type="submit" aria-label="Send message">↑</button></form>'+
      '<div class="gpt-footer">Genesis talks to the API you choose. Conversations stay in this browser session.</div></div>';
  }
  function escape(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
  function provider(state){return providers[state.select.value]||providers.openai}
  function config(state){
    const p=provider(state),key=read(KEY),model=read(MODEL_KEY);
    state.key.value=key;state.endpoint.value=p.endpoint||"";state.model.value=model||p.model||"";
  }
  function render(state){
    state.messages.innerHTML=state.history.length?state.history.map(m=>'<article class="gpt-message '+m.role+'"><div class="gpt-message-role">'+(m.role==="user"?"You":"Genesis AI")+'</div><div class="gpt-message-text">'+escape(m.text).replace(/\n/g,"<br>")+'</div></article>').join(""):'<div class="gpt-empty"><div class="gpt-empty-mark">✦</div><h2>Your AI workspace</h2><p>Connect ChatGPT with API settings, then start a conversation.</p></div>';
    state.messages.scrollTop=state.messages.scrollHeight;
  }
  function status(state,text,error=false){state.status.textContent=text;state.status.classList.toggle("error",!!error)}
  function save(state){
    write(KEY,state.key.value.trim());
    if(state.model.value.trim())write(MODEL_KEY,state.model.value.trim());
    state.config.hidden=true;status(state,state.key.value.trim()?"API settings saved for this session":"Add an API key to start.");
  }
  function extractResponse(data){
    if(typeof data.output_text==="string")return data.output_text.trim();
    const output=Array.isArray(data.output)?data.output:[];let text="";
    for(const item of output){for(const part of (item.content||[])){if(typeof part.text==="string")text+=part.text}}
    if(text.trim())return text.trim();
    return data.choices?.[0]?.message?.content||"";
  }
  async function request(state,history){
    const p=provider(state),endpoint=state.endpoint.value.trim()||p.endpoint,key=state.key.value.trim(),model=state.model.value.trim()||p.model;
    if(!key)throw Error("Add your API key in API settings first.");
    if(!endpoint)throw Error("Add an API endpoint in API settings.");
    const headers={"content-type":"application/json","authorization":"Bearer "+key};
    let body;
    if(endpoint.includes("/responses")){
      body={model,input:history.map(m=>({role:m.role,content:[{type:m.role==="assistant"?"output_text":"input_text",text:m.text}]})),store:false};
    }else{
      body={model,messages:history.map(m=>({role:m.role,content:m.text})),stream:false};
    }
    const response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify(body),signal:state.abort.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error?.message||"The AI API returned HTTP "+response.status+".");
    const text=extractResponse(data);if(!text)throw Error("The AI API returned an empty response.");return text;
  }
  async function send(state,text){
    if(state.busy)return;
    const clean=String(text||"").trim();if(!clean)return;
    state.history.push({role:"user",text:clean});render(state);state.input.value="";state.busy=true;state.send.disabled=true;status(state,"Thinking…");
    state.abort=new AbortController();
    try{const answer=await request(state,state.history);state.history.push({role:"assistant",text:answer});status(state,"Ready")}catch(error){if(error.name!=="AbortError"){state.history.push({role:"assistant",text:"I couldn't complete that request: "+error.message});status(state,error.message,true)}}finally{state.busy=false;state.send.disabled=false;render(state)}
  }
  function init(win){
    if(!win?.isConnected||sessions.has(win))return;
    const q=s=>win.querySelector(s),state={win,history:[],busy:false,abort:new AbortController(),select:q(".gpt-provider"),config:q(".gpt-config"),key:q(".gpt-key"),endpoint:q(".gpt-endpoint"),model:q(".gpt-model"),status:q(".gpt-status"),messages:q(".gpt-messages"),input:q(".gpt-input"),send:q(".gpt-send")};
    sessions.set(win,state);config(state);render(state);
    q('[data-gpt-action="settings"]').onclick=()=>{config(state);state.config.hidden=!state.config.hidden};
    q('[data-gpt-action="save"]').onclick=()=>save(state);
    q('[data-gpt-action="clear"]').onclick=()=>{state.key.value="";write(KEY,"");status(state,"Session key cleared.")};
    q('[data-gpt-action="new"]').onclick=()=>{state.history=[];status(state,"New chat");render(state);state.input.focus()};
    state.select.onchange=()=>{config(state);status(state,"Provider changed · save API settings before sending.")};
    q(".gpt-composer").onsubmit=e=>{e.preventDefault();send(state,state.input.value)};
    state.input.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(state,state.input.value)}};
    if(!read(KEY))state.config.hidden=false;
  }
  function close(win){const state=sessions.get(win);if(!state)return;state.abort.abort();sessions.delete(win)}
  global.GenesisGPT=Object.freeze({html,init,close});
})(window);
