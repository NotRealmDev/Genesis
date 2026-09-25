(function(global){
  "use strict";

  const MAX_MESSAGES_PER_CONTACT = 500;
  const MAX_MESSAGE_LENGTH = 1200;
  const CONTACTS_PREFIX = "genesisMessagesContacts:";
  const HISTORY_PREFIX = "genesisMessagesHistory:";
  const SELECTED_PREFIX = "genesisMessagesSelected:";
  const TUTORIAL_KEY = "genesisMessagesTutorialComplete";
  const GROUPS_PREFIX = "genesisMessagesGroups:";
  const GROUP_HISTORY_PREFIX = "genesisMessagesGroupHistory:";
  const SDK_VERSION = "2.116.0";

  const state = {
    client:null,
    inbox:null,
    identity:"",
    connection:"connecting",
    selected:"",
    contacts:[],
    history:{},
    window:null,
    tutorialIndex:-1,
    tutorialTimer:null,
    tutorialResize:null,
    retryTimer:null,
    groups:[],
    groupHistory:{},
    selectedGroup:""
  };

  const tutorialSteps = [
    {
      target:"#gmIdentity",
      title:"This is your Genesis ID",
      copy:"Share this three-digit ID with someone so they can add and message you."
    },
    {
      target:"#gmAddContactButton",
      title:"Add a person by ID",
      copy:"Select Add ID, enter their three-digit Genesis ID, and they will appear in your contacts."
    },
    {
      target:"#gmContactList",
      title:"Your conversations stay here",
      copy:"Select a contact to reopen the conversation. Messages and contacts are saved on this device."
    },
    {
      target:"#gmComposer",
      title:"Send a live message",
      copy:"Type here and press Enter or the send button. Shift + Enter creates a new line."
    }
  ];

  function storageGet(key, fallback){
    try{
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    }catch{
      return fallback;
    }
  }

  function storageSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch{}
  }

  function normalizeId(value){
    const digits = String(value == null ? "" : value).replace(/\D/g,"").slice(0,3);
    return /^\d{3}$/.test(digits) ? digits : "";
  }

  function currentId(){
    return normalizeId(localStorage.getItem("genesisDisplayId"));
  }

  function currentName(){
    try{
      const login = JSON.parse(localStorage.getItem("genesisLogin") || "null");
      return String(login?.user || sessionStorage.getItem("realmUser") || "Genesis User").slice(0,40);
    }catch{
      return "Genesis User";
    }
  }

  function backend(){
    const value = global.GENESIS_BACKEND || {};
    if(!/^https:\/\/.+\.supabase\.co$/i.test(String(value.url || ""))) return null;
    if(String(value.anonKey || "").length < 20) return null;
    return value;
  }

  function contactKey(id=state.identity){ return CONTACTS_PREFIX + id; }
  function historyKey(id=state.identity){ return HISTORY_PREFIX + id; }
  function selectedKey(id=state.identity){ return SELECTED_PREFIX + id; }
  function topicFor(id){ return "genesis-inbox-" + normalizeId(id); }
  function groupsKey(id=state.identity){ return GROUPS_PREFIX + id; }
  function groupHistoryKey(id=state.identity){ return GROUP_HISTORY_PREFIX + id; }
  function groupTopic(id){ return "genesis-group-" + String(id||"").replace(/[^a-z0-9_-]/gi,"").slice(0,64); }

  function escapeHTML(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[character]);
  }

  function loadIdentity(id=currentId()){
    if(!id) return false;
    state.identity = id;
    const contacts = storageGet(contactKey(id), []);
    const history = storageGet(historyKey(id), {});
    state.contacts = Array.isArray(contacts)
      ? contacts.filter(contact => normalizeId(contact?.id) && normalizeId(contact.id) !== id)
      : [];
    state.history = history && typeof history === "object" && !Array.isArray(history) ? history : {};
    state.groups = storageGet(groupsKey(id), []);
    state.groupHistory = storageGet(groupHistoryKey(id), {});
    const selected = normalizeId(localStorage.getItem(selectedKey(id)) || "");
    state.selected = state.contacts.some(contact => contact.id === selected)
      ? selected
      : (state.contacts[0]?.id || "");
    return true;
  }

  function saveContacts(){
    storageSet(contactKey(), state.contacts);
  }

  function saveHistory(){
    storageSet(historyKey(), state.history);
  }
  function saveGroups(){ storageSet(groupsKey(), state.groups); }
  function saveGroupHistory(){ storageSet(groupHistoryKey(), state.groupHistory); }

  function saveSelected(){
    try{ localStorage.setItem(selectedKey(), state.selected || ""); }catch{}
  }

  function conversation(id){
    const normalized = normalizeId(id);
    const list = state.history[normalized];
    return Array.isArray(list) ? list : [];
  }

  function lastMessage(id){
    const list = conversation(id);
    return list[list.length - 1] || null;
  }

  function unreadCount(id){
    return conversation(id).filter(message => message.direction === "incoming" && message.unread).length;
  }

  function totalUnread(){
    return state.contacts.reduce((total, contact) => total + unreadCount(contact.id), 0);
  }

  function addContact(id, metadata={}){
    const normalized = normalizeId(id);
    if(!normalized || normalized === state.identity) return null;
    let contact = state.contacts.find(item => item.id === normalized);
    if(!contact){
      contact = {
        id:normalized,
        name:String(metadata.name || "").slice(0,40),
        addedAt:new Date().toISOString()
      };
      state.contacts.unshift(contact);
    }else if(metadata.name && metadata.name !== "Genesis User"){
      contact.name = String(metadata.name).slice(0,40);
    }
    saveContacts();
    return contact;
  }

  function uniqueMessageId(){
    if(global.crypto?.randomUUID) return global.crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function putMessage(contactId, message){
    const id = normalizeId(contactId);
    if(!id || !message?.id) return false;
    const list = conversation(id).slice();
    if(list.some(item => item.id === message.id)) return false;
    list.push(message);
    list.sort((a,b) => String(a.sentAt).localeCompare(String(b.sentAt)));
    state.history[id] = list.slice(-MAX_MESSAGES_PER_CONTACT);
    saveHistory();
    return true;
  }

  function patchMessage(contactId, messageId, patch){
    const list = conversation(contactId);
    const message = list.find(item => item.id === messageId);
    if(!message) return false;
    Object.assign(message, patch);
    saveHistory();
    return true;
  }

  function formatTime(value){
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  }

  function contactLabel(contact){
    if(contact?.name && contact.name !== "Genesis User") return contact.name;
    return "Genesis ID " + contact.id;
  }

  function html(){
    const id = currentId() || "···";
    return `<div class="gm-shell" id="genesisMessagesApp">
      <aside class="gm-sidebar">
        <div class="gm-sidebar-head">
          <div>
            <div class="gm-title">Messages</div>
            <div class="gm-identity" id="gmIdentity"><span class="gm-live-dot"></span><span>Your ID ${escapeHTML(id)}</span></div>
          </div>
          <div style="display:flex;gap:6px"><button class="gm-help" type="button" onclick="GenesisMessages.createGroupPrompt()" title="New group">＋</button><button class="gm-help" type="button" onclick="GenesisMessages.replayTutorial()" title="Show tutorial">?</button></div>
        </div>
        <button class="gm-add-contact" id="gmAddContactButton" type="button" onclick="GenesisMessages.toggleAddContact(true)">
          <span>＋</span><span>Add ID</span>
        </button>
        <div class="gm-add-panel" id="gmAddPanel" aria-hidden="true">
          <label for="gmContactId">Three-digit Genesis ID</label>
          <div class="gm-add-row">
            <input id="gmContactId" inputmode="numeric" maxlength="3" placeholder="527" autocomplete="off">
            <button type="button" onclick="GenesisMessages.submitContact()">Add</button>
          </div>
          <div class="gm-add-status" id="gmAddStatus"></div>
        </div>
        <div class="gm-contact-list" id="gmContactList"></div>
      </aside>
      <section class="gm-chat">
        <header class="gm-chat-head" id="gmChatHead"></header>
        <div class="gm-thread" id="gmThread"></div>
        <div class="gm-composer" id="gmComposer">
          <button class="gm-media-btn" type="button" onclick="GenesisMessages.pickImage()" title="Send image">▧</button><button class="gm-media-btn" type="button" onclick="GenesisMessages.sendGifPrompt()" title="Send GIF">GIF</button><input id="gmImagePicker" type="file" accept="image/*" hidden>
          <textarea id="gmMessageInput" maxlength="${MAX_MESSAGE_LENGTH}" rows="1" placeholder="Choose an ID to start messaging" disabled></textarea>
          <button id="gmSendButton" type="button" onclick="GenesisMessages.sendCurrent()" disabled title="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l17 8-17 8 3-8-3-8zM7 12h14"/></svg>
          </button>
        </div>
      </section>
      <svg class="gm-tutorial-line" id="gmTutorialLine" aria-hidden="true"><path></path><circle r="4"></circle></svg>
      <div class="gm-tutorial" id="gmTutorial" role="dialog" aria-live="polite">
        <div class="gm-tutorial-step" id="gmTutorialStep"></div>
        <div class="gm-tutorial-title" id="gmTutorialTitle"></div>
        <div class="gm-tutorial-copy" id="gmTutorialCopy"></div>
        <div class="gm-tutorial-actions">
          <button type="button" onclick="GenesisMessages.finishTutorial()">Skip</button>
          <button class="primary" id="gmTutorialNext" type="button" onclick="GenesisMessages.nextTutorial()">Next</button>
        </div>
      </div>
    </div>`;
  }

  function renderContacts(){
    const list = document.getElementById("gmContactList");
    if(!list) return;
    if(!state.contacts.length){
      list.innerHTML = `<div class="gm-empty-contacts"><div>✦</div><strong>No conversations yet</strong><span>Add someone using their Genesis ID.</span></div>`;
      updateBadges();
      return;
    }

    const sorted = state.contacts.slice().sort((a,b) => {
      const aTime = lastMessage(a.id)?.sentAt || a.addedAt || "";
      const bTime = lastMessage(b.id)?.sentAt || b.addedAt || "";
      return bTime.localeCompare(aTime);
    });

    list.innerHTML = sorted.map(contact => {
      const last = lastMessage(contact.id);
      const unread = unreadCount(contact.id);
      const preview = last ? String(last.text).replace(/\s+/g," ").slice(0,55) : "New conversation";
      return `<button class="gm-contact ${contact.id === state.selected ? "active" : ""}" type="button" onclick="GenesisMessages.selectContact('${contact.id}')">
        <span class="gm-avatar">${escapeHTML(contact.id.slice(-2))}</span>
        <span class="gm-contact-copy">
          <strong>${escapeHTML(contactLabel(contact))}</strong>
          <small>${escapeHTML(preview)}</small>
        </span>
        <span class="gm-contact-meta">
          <time>${last ? escapeHTML(formatTime(last.sentAt)) : ""}</time>
          ${unread ? `<b>${Math.min(unread,99)}</b>` : ""}
        </span>
      </button>`;
    }).join("");
    updateBadges();
  }

  function renderConversation(){
    const header = document.getElementById("gmChatHead");
    const thread = document.getElementById("gmThread");
    const picker=document.getElementById("gmImagePicker");
    if(picker && !picker.dataset.bound){picker.dataset.bound="1";picker.addEventListener("change",()=>{const file=picker.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>sendMedia("image",reader.result);reader.readAsDataURL(file);picker.value=""})}

    const input = document.getElementById("gmMessageInput");
    const send = document.getElementById("gmSendButton");
    if(!header || !thread || !input || !send) return;

    const contact = state.contacts.find(item => item.id === state.selected);
    if(!contact){
      header.innerHTML = `<div><strong>Messages</strong><small id="gmConnectionLabel">Connecting…</small></div>`;
      thread.innerHTML = `<div class="gm-empty-thread"><div class="gm-empty-orb">✦</div><h3>Your messages</h3><p>Add a Genesis ID, then choose the contact to begin a live conversation.</p></div>`;
      input.disabled = true;
      send.disabled = true;
      input.placeholder = "Choose an ID to start messaging";
      updateConnectionUI();
      return;
    }

    header.innerHTML = `<div class="gm-chat-person"><span class="gm-avatar">${escapeHTML(contact.id.slice(-2))}</span><span><strong>${escapeHTML(contactLabel(contact))}</strong><small>ID ${escapeHTML(contact.id)} · <span id="gmConnectionLabel"></span></small></span></div><button type="button" class="gm-remove" onclick="GenesisMessages.removeCurrent()" title="Remove contact">•••</button>`;
    const messages = conversation(contact.id);
    thread.innerHTML = messages.length ? messages.map(message => {
      const own = message.direction === "outgoing";
      const status = own ? (message.status === "delivered" ? "Delivered" : message.status === "queued" ? "Saved · retrying" : message.status === "sending" ? "Sending…" : "Sent") : "";
      const media=message.media?.url ? `<img src="${escapeHTML(message.media.url)}" alt="${escapeHTML(message.media.type||"image")}" loading="lazy">` : "";
      return `<div class="gm-message-row ${own ? "outgoing" : "incoming"}" data-message-id="${escapeHTML(message.id)}">
        <div class="gm-bubble">${media}<div>${escapeHTML(message.text).replace(/\n/g,"<br>")}</div><small>${escapeHTML(formatTime(message.sentAt))}${status ? " · " + escapeHTML(status) : ""}</small></div>
      </div>`;
    }).join("") : `<div class="gm-empty-thread compact"><div class="gm-empty-orb">${escapeHTML(contact.id.slice(-2))}</div><h3>Message ${escapeHTML(contactLabel(contact))}</h3><p>Your conversation will be saved on this device.</p></div>`;
    input.disabled = false;
    send.disabled = false;
    input.placeholder = "Message ID " + contact.id;
    updateConnectionUI();
    requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
  }

  function updateConnectionUI(){
    const label = document.getElementById("gmConnectionLabel");
    const dots = document.querySelectorAll(".gm-live-dot");
    const descriptions = {
      live:"Live",
      connecting:"Connecting…",
      offline:"Saved mode",
      error:"Reconnecting…"
    };
    if(label) label.textContent = descriptions[state.connection] || descriptions.connecting;
    dots.forEach(dot => dot.classList.toggle("online", state.connection === "live"));
  }

  function updateBadges(){
    const count = totalUnread();
    document.querySelectorAll("[data-messages-badge]").forEach(badge => {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.toggle("show", count > 0);
    });
  }

  function selectContact(id){
    const normalized = normalizeId(id);
    if(!state.contacts.some(contact => contact.id === normalized)) return;
    state.selected = normalized;
    saveSelected();
    conversation(normalized).forEach(message => {
      if(message.direction === "incoming") message.unread = false;
    });
    saveHistory();
    renderContacts();
    renderConversation();
    setTimeout(() => document.getElementById("gmMessageInput")?.focus(), 80);
  }

  function toggleAddContact(show){
    const panel = document.getElementById("gmAddPanel");
    if(!panel) return;
    const active = typeof show === "boolean" ? show : !panel.classList.contains("show");
    panel.classList.toggle("show", active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
    if(active) setTimeout(() => document.getElementById("gmContactId")?.focus(), 120);
  }

  function submitContact(){
    const input = document.getElementById("gmContactId");
    const status = document.getElementById("gmAddStatus");
    const id = normalizeId(input?.value);
    if(!id){
      if(status) status.textContent = "Enter a complete three-digit ID.";
      return;
    }
    if(id === state.identity){
      if(status) status.textContent = "That is your own Genesis ID.";
      return;
    }
    addContact(id);
    state.selected = id;
    saveSelected();
    if(input) input.value = "";
    if(status) status.textContent = "ID " + id + " added.";
    renderContacts();
    renderConversation();
    setTimeout(() => {
      toggleAddContact(false);
      const messageInput = document.getElementById("gmMessageInput");
      if(messageInput) messageInput.focus();
    }, 320);
  }

  async function sendBroadcast(targetId, event, payload){
    if(!state.client) throw new Error("Live messaging is not connected");
    const channel = state.client.channel(topicFor(targetId));
    try{
      if(typeof channel.httpSend === "function"){
        const response = await channel.httpSend(event, payload);
        if(response?.success === false) throw new Error(response.error || "Message service rejected the request");
        return response;
      }
      const response = await channel.send({type:"broadcast", event, payload});
      if(response !== "ok") throw new Error("Message service returned " + response);
      return response;
    }finally{
      state.client.removeChannel(channel).catch?.(()=>{});
    }
  }

  async function sendMedia(type,url){
    const target=normalizeId(state.selected),safe=String(url||"").trim().slice(0,240000);
    if(!target||!safe)return;
    const message={id:uniqueMessageId(),from:state.identity,to:target,senderName:currentName(),text:type==="gif"?"GIF":"Image",media:{type,url:safe},sentAt:new Date().toISOString(),direction:"outgoing",status:"sending",unread:false,version:2};
    putMessage(target,message);renderContacts();renderConversation();
    try{await sendBroadcast(target,"message",{id:message.id,from:message.from,to:message.to,senderName:message.senderName,text:message.text,media:message.media,sentAt:message.sentAt,version:2});patchMessage(target,message.id,{status:"sent"})}catch{patchMessage(target,message.id,{status:"queued"})}
    renderContacts();renderConversation();
  }
  function pickImage(){document.getElementById("gmImagePicker")?.click()}
  function sendGifPrompt(){const url=prompt("Paste a direct GIF URL");if(/^https:\/\//i.test(String(url||"")))sendMedia("gif",url)}
  function createGroupPrompt(){
    const name=String(prompt("Group name")||"").trim().slice(0,30);if(!name)return;
    const members=String(prompt("Genesis IDs, separated by commas")||"").split(",").map(normalizeId).filter(id=>id&&id!==state.identity);
    if(!members.length)return;
    const id="g-"+uniqueMessageId().replace(/[^a-z0-9]/gi,"").slice(0,18);
    state.groups.unshift({id,name,members:Array.from(new Set(members)),createdAt:new Date().toISOString()});saveGroups();
    if(typeof global.showGenesisAnnouncement==="function")global.showGenesisAnnouncement("Group “"+name+"” created",3000);
  }

  async function sendCurrent(){
    const input = document.getElementById("gmMessageInput");
    const target = normalizeId(state.selected);
    const text = String(input?.value || "").trim().slice(0,MAX_MESSAGE_LENGTH);
    if(!target || !text) return;

    const message = {
      id:uniqueMessageId(),
      from:state.identity,
      to:target,
      senderName:currentName(),
      text,
      sentAt:new Date().toISOString(),
      direction:"outgoing",
      status:"sending",
      unread:false,
      version:1
    };
    putMessage(target, message);
    if(input){
      input.value = "";
      input.style.height = "auto";
    }
    renderContacts();
    renderConversation();

    try{
      await sendBroadcast(target, "message", {
        id:message.id,
        from:message.from,
        to:message.to,
        senderName:message.senderName,
        text:message.text,
        sentAt:message.sentAt,
        version:message.version
      });
      patchMessage(target, message.id, {status:"sent"});
    }catch(error){
      console.warn("Genesis message queued:", error);
      patchMessage(target, message.id, {status:"queued"});
    }
    renderContacts();
    renderConversation();
  }

  async function retryQueued(){
    if(!state.client || state.connection !== "live") return;
    const queued = [];
    for(const [contactId,list] of Object.entries(state.history)){
      for(const message of Array.isArray(list) ? list : []){
        if(message.direction === "outgoing" && message.status === "queued") queued.push({contactId,message});
      }
    }
    for(const {contactId,message} of queued.slice(0,20)){
      try{
        await sendBroadcast(contactId,"message",{
          id:message.id,from:message.from,to:message.to,senderName:message.senderName,
          text:message.text,sentAt:message.sentAt,version:message.version || 1
        });
        patchMessage(contactId,message.id,{status:"sent"});
      }catch{
        break;
      }
    }
    if(queued.length){ renderContacts(); renderConversation(); }
  }

  function handleIncoming(packet){
    const payload = packet?.payload && packet.payload.id ? packet.payload : packet;
    const from = normalizeId(payload?.from);
    const to = normalizeId(payload?.to);
    const text = String(payload?.text || "").trim().slice(0,MAX_MESSAGE_LENGTH);
    const mediaOk = payload?.media && /^https:\/\//i.test(String(payload.media.url||""));
    if(!payload?.id || !from || to !== state.identity || (!text && !mediaOk) || from === state.identity) return;

    const contact = addContact(from,{name:payload.senderName});
    const appOpen = !!document.getElementById("genesisMessagesApp");
    const selected = appOpen && state.selected === from;
    const added = putMessage(from,{
      id:String(payload.id).slice(0,100),
      from,
      to,
      senderName:String(payload.senderName || "Genesis User").slice(0,40),
      text,
      media:payload.media && /^https:\/\//i.test(String(payload.media.url||"")) ? {type:String(payload.media.type||"image").slice(0,12),url:String(payload.media.url).slice(0,240000)} : null,
      sentAt:payload.sentAt && !Number.isNaN(new Date(payload.sentAt).getTime()) ? payload.sentAt : new Date().toISOString(),
      direction:"incoming",
      status:"received",
      unread:!selected,
      version:1
    });
    if(!added) return;

    if(selected){
      conversation(from).forEach(message => {
        if(message.direction === "incoming") message.unread = false;
      });
      saveHistory();
    }
    renderContacts();
    renderConversation();
    updateBadges();
    sendBroadcast(from,"receipt",{id:String(payload.id),from:state.identity,to:from,receivedAt:new Date().toISOString()}).catch(()=>{});

    if(!selected && typeof global.showGenesisAnnouncement === "function"){
      global.showGenesisAnnouncement("New message from " + contactLabel(contact), 4800);
    }
  }

  function handleReceipt(packet){
    const payload = packet?.payload && packet.payload.id ? packet.payload : packet;
    const from = normalizeId(payload?.from);
    const to = normalizeId(payload?.to);
    if(!payload?.id || !from || to !== state.identity) return;
    if(patchMessage(from,String(payload.id),{status:"delivered",deliveredAt:payload.receivedAt || new Date().toISOString()})){
      renderConversation();
    }
  }

  async function disconnectInbox(){
    if(state.client && state.inbox){
      try{ await state.client.removeChannel(state.inbox); }catch{}
    }
    state.inbox = null;
  }

  async function start(){
    injectStyles();
    const id = currentId();
    const config = backend();
    if(!id || !config || !global.supabase?.createClient){
      state.connection = "offline";
      updateConnectionUI();
      return false;
    }

    if(state.identity !== id){
      await disconnectInbox();
      loadIdentity(id);
      renderContacts();
      renderConversation();
    }
    if(state.inbox) return true;

    if(!state.client){
      state.client = global.supabase.createClient(config.url, config.anonKey, {
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
        realtime:{params:{eventsPerSecond:12}}
      });
    }

    state.connection = "connecting";
    updateConnectionUI();
    state.inbox = state.client
      .channel(topicFor(id),{config:{broadcast:{self:false,ack:true}}})
      .on("broadcast",{event:"message"},handleIncoming)
      .on("broadcast",{event:"receipt"},handleReceipt)
      .subscribe(status => {
        if(status === "SUBSCRIBED"){
          state.connection = "live";
          retryQueued();
        }else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT"){
          state.connection = "error";
        }else if(status === "CLOSED"){
          state.connection = "offline";
        }else{
          state.connection = "connecting";
        }
        updateConnectionUI();
      });
    return true;
  }

  function removeCurrent(){
    const id = state.selected;
    if(!id) return;
    state.contacts = state.contacts.filter(contact => contact.id !== id);
    state.selected = state.contacts[0]?.id || "";
    saveContacts();
    saveSelected();
    renderContacts();
    renderConversation();
  }

  function bindInputs(){
    const contactInput = document.getElementById("gmContactId");
    if(contactInput){
      contactInput.addEventListener("input", () => {
        contactInput.value = contactInput.value.replace(/\D/g,"").slice(0,3);
        const status = document.getElementById("gmAddStatus");
        if(status) status.textContent = "";
      });
      contactInput.addEventListener("keydown", event => {
        if(event.key === "Enter") submitContact();
        if(event.key === "Escape") toggleAddContact(false);
      });
    }

    const input = document.getElementById("gmMessageInput");
    if(input){
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(116,input.scrollHeight) + "px";
      });
      input.addEventListener("keydown", event => {
        if(event.key === "Enter" && !event.shiftKey){
          event.preventDefault();
          sendCurrent();
        }
      });
    }
  }

  function init(){
    injectStyles();
    state.window = document.querySelector('.window[data-app="messages"]');
    const id = currentId();
    if(id && state.identity !== id) loadIdentity(id);
    bindInputs();
    renderContacts();
    renderConversation();
    start();
    clearTimeout(state.tutorialTimer);
    if(localStorage.getItem(TUTORIAL_KEY) !== "1"){
      state.tutorialTimer = setTimeout(() => beginTutorial(0), 560);
    }
  }

  function onWindowClose(){
    clearTimeout(state.tutorialTimer);
    finishTutorial(false);
    state.window = null;
  }

  function tutorialElements(){
    return {
      shell:document.getElementById("genesisMessagesApp"),
      card:document.getElementById("gmTutorial"),
      svg:document.getElementById("gmTutorialLine"),
      path:document.querySelector("#gmTutorialLine path"),
      dot:document.querySelector("#gmTutorialLine circle")
    };
  }

  function positionTutorial(){
    const step = tutorialSteps[state.tutorialIndex];
    const target = step ? document.querySelector(step.target) : null;
    const {shell,card,svg,path,dot} = tutorialElements();
    if(!target || !shell || !card || !svg || !path || !dot) return;
    const shellRect = shell.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetX = targetRect.left - shellRect.left + targetRect.width/2;
    const targetY = targetRect.top - shellRect.top + targetRect.height/2;

    card.classList.toggle("place-left", targetX > shellRect.width/2);
    card.classList.toggle("place-top", targetY > shellRect.height/2);
    requestAnimationFrame(() => {
      const cardRect = card.getBoundingClientRect();
      const cardX = cardRect.left - shellRect.left + cardRect.width/2;
      const cardY = cardRect.top - shellRect.top + cardRect.height/2;
      const startX = cardX + (targetX > cardX ? cardRect.width/2 - 10 : -cardRect.width/2 + 10);
      const startY = cardY;
      const bend = Math.max(42,Math.abs(targetX-startX)*.42);
      const control1X = startX + (targetX > startX ? bend : -bend);
      const control2X = targetX + (targetX > startX ? -bend : bend);
      const d = `M ${startX} ${startY} C ${control1X} ${startY}, ${control2X} ${targetY}, ${targetX} ${targetY}`;
      path.style.opacity = "0";
      path.style.strokeDashoffset = "1";
      path.setAttribute("pathLength","1");
      path.setAttribute("d",d);
      dot.setAttribute("cx",String(targetX));
      dot.setAttribute("cy",String(targetY));
      requestAnimationFrame(() => {
        path.style.opacity = "1";
        path.style.strokeDashoffset = "0";
        dot.style.opacity = "1";
      });
    });
  }

  function beginTutorial(index=0){
    const {card,svg} = tutorialElements();
    if(!card || !svg) return;
    document.querySelectorAll(".gm-tutorial-target").forEach(element => element.classList.remove("gm-tutorial-target"));
    state.tutorialIndex = Math.max(0,Math.min(index,tutorialSteps.length-1));
    const step = tutorialSteps[state.tutorialIndex];
    const target = document.querySelector(step.target);
    if(target) target.classList.add("gm-tutorial-target");
    document.getElementById("gmTutorialStep").textContent = `Quick tour · ${state.tutorialIndex+1} of ${tutorialSteps.length}`;
    document.getElementById("gmTutorialTitle").textContent = step.title;
    document.getElementById("gmTutorialCopy").textContent = step.copy;
    document.getElementById("gmTutorialNext").textContent = state.tutorialIndex === tutorialSteps.length-1 ? "Done" : "Next";
    card.classList.add("show");
    svg.classList.add("show");
    clearTimeout(state.tutorialTimer);
    state.tutorialTimer = setTimeout(positionTutorial,80);
    if(!state.tutorialResize){
      state.tutorialResize = () => positionTutorial();
      global.addEventListener("resize",state.tutorialResize);
    }
  }

  function nextTutorial(){
    if(state.tutorialIndex >= tutorialSteps.length-1){
      finishTutorial(true);
      return;
    }
    const {path,dot} = tutorialElements();
    if(path){ path.style.strokeDashoffset = "1"; path.style.opacity = "0"; }
    if(dot) dot.style.opacity = "0";
    setTimeout(() => beginTutorial(state.tutorialIndex+1),180);
  }

  function finishTutorial(remember=true){
    const {card,svg,path,dot} = tutorialElements();
    if(card) card.classList.remove("show");
    if(svg) svg.classList.remove("show");
    if(path) path.style.strokeDashoffset = "1";
    if(dot) dot.style.opacity = "0";
    document.querySelectorAll(".gm-tutorial-target").forEach(element => element.classList.remove("gm-tutorial-target"));
    if(remember){
      try{ localStorage.setItem(TUTORIAL_KEY,"1"); }catch{}
    }
    state.tutorialIndex = -1;
  }

  function replayTutorial(){
    beginTutorial(0);
  }

  function injectStyles(){
    if(typeof document === "undefined" || document.getElementById("genesisMessagesStyles")) return;
    const style = document.createElement("style");
    style.id = "genesisMessagesStyles";
    style.textContent = `
      .window[data-app="messages"]{width:min(900px,calc(100vw - 280px));height:min(590px,calc(100vh - 135px));animation:gmWindowOpen .58s cubic-bezier(.16,.86,.22,1.04)}
      @keyframes gmWindowOpen{0%{opacity:0;transform:translate(-50%,-46%) scale(.82);filter:blur(13px);clip-path:inset(44% 45% round 28px)}65%{opacity:1;clip-path:inset(0 round 25px)}100%{transform:translate(-50%,-50%) scale(1);filter:blur(0);clip-path:inset(0 round 25px)}}
      .window[data-app="messages"] .window-content{overflow:hidden}
      .gm-shell{position:relative;display:grid;grid-template-columns:310px minmax(0,1fr);height:100%;min-height:0;overflow:hidden;background:radial-gradient(circle at 72% 12%,hsla(var(--accent),82%,56%,.13),transparent 36%),rgba(4,7,13,.30)}
      .gm-sidebar{min-width:0;border-right:1px solid rgba(255,255,255,.075);background:rgba(255,255,255,.025);padding:18px 13px 13px;overflow:hidden;display:flex;flex-direction:column;animation:gmPanelIn .55s .12s both cubic-bezier(.2,.8,.2,1)}
      .gm-chat{min-width:0;display:grid;grid-template-rows:68px minmax(0,1fr) auto;animation:gmPanelIn .55s .2s both cubic-bezier(.2,.8,.2,1)}
      @keyframes gmPanelIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
      .gm-sidebar-head{display:flex;align-items:center;justify-content:space-between;padding:0 5px 16px}
      .gm-title{font-size:24px;font-weight:720;letter-spacing:-.04em}
      .gm-identity{display:flex;align-items:center;gap:6px;margin-top:5px;color:var(--muted);font-size:10px}
      .gm-live-dot{width:7px;height:7px;border-radius:50%;background:#ffad59;box-shadow:0 0 0 4px rgba(255,173,89,.09);transition:.3s}
      .gm-live-dot.online{background:#62f5a4;box-shadow:0 0 0 4px rgba(98,245,164,.10),0 0 14px rgba(98,245,164,.38)}
      .gm-help{width:31px;height:31px;border-radius:11px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.055);cursor:pointer;color:rgba(255,255,255,.74)}
      .gm-help:hover{background:rgba(255,255,255,.11)}
      .gm-add-contact{height:42px;margin:0 2px 11px;border-radius:14px;border:1px solid hsla(var(--accent),75%,65%,.22);background:hsla(var(--accent),75%,55%,.14);display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;font-weight:650;font-size:12px;transition:.22s}
      .gm-add-contact:hover{transform:translateY(-1px);background:hsla(var(--accent),75%,55%,.23)}
      .gm-add-contact span:first-child{font-size:18px;font-weight:300}
      .gm-add-panel{max-height:0;opacity:0;overflow:hidden;margin:0 2px;transform:translateY(-7px);transition:max-height .32s ease,opacity .25s ease,transform .32s cubic-bezier(.2,.8,.2,1)}
      .gm-add-panel.show{max-height:108px;opacity:1;transform:none;margin-bottom:9px}
      .gm-add-panel label{display:block;font-size:9px;color:var(--muted);margin:0 0 6px 2px}
      .gm-add-row{display:grid;grid-template-columns:1fr 56px;gap:6px}
      .gm-add-row input{width:100%;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.1);outline:0;background:rgba(255,255,255,.055);color:#fff;padding:0 12px;letter-spacing:.18em}
      .gm-add-row input:focus{border-color:hsla(var(--accent),75%,65%,.5);box-shadow:0 0 0 3px hsla(var(--accent),75%,55%,.09)}
      .gm-add-row button{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.1);cursor:pointer}
      .gm-add-status{height:18px;padding:5px 2px 0;font-size:9px;color:var(--muted)}
      .gm-contact-list{min-height:120px;flex:1;overflow:auto;padding:2px;scrollbar-width:thin}
      .gm-contact{width:100%;min-height:67px;padding:9px 10px;border:0;border-radius:17px;background:transparent;display:grid;grid-template-columns:43px minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;cursor:pointer;transition:.2s}
      .gm-contact:hover{background:rgba(255,255,255,.055)}
      .gm-contact.active{background:linear-gradient(135deg,hsla(var(--accent),74%,56%,.25),rgba(255,255,255,.065));box-shadow:inset 0 0 0 1px rgba(255,255,255,.075)}
      .gm-avatar{width:43px;height:43px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,hsla(var(--accent),80%,63%,.50),rgba(255,255,255,.08));border:1px solid rgba(255,255,255,.11);font-size:12px;font-weight:750;letter-spacing:.04em;flex:none}
      .gm-contact-copy{min-width:0;display:block}.gm-contact-copy strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gm-contact-copy small{display:block;margin-top:5px;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gm-contact-meta{align-self:stretch;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:7px}.gm-contact-meta time{color:rgba(255,255,255,.34);font-size:8px}.gm-contact-meta b{min-width:18px;height:18px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:hsl(var(--accent),80%,61%);font-size:8px}
      .gm-empty-contacts{height:100%;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--muted);padding:22px}.gm-empty-contacts>div{font-size:25px;margin-bottom:11px;color:#fff}.gm-empty-contacts strong{font-size:11px;color:rgba(255,255,255,.78)}.gm-empty-contacts span{margin-top:6px;font-size:9px;line-height:1.5}
      .gm-chat-head{min-width:0;padding:0 19px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.018)}
      .gm-chat-head>div:not(.gm-chat-person){display:flex;flex-direction:column}.gm-chat-head strong{font-size:12px}.gm-chat-head small{display:block;color:var(--muted);font-size:9px;margin-top:4px}
      .gm-chat-person{display:flex;align-items:center;gap:11px;min-width:0}.gm-chat-person .gm-avatar{width:40px;height:40px;border-radius:14px}
      .gm-remove{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:16px;letter-spacing:2px}
      .gm-thread{min-height:0;overflow:auto;padding:22px 22px 12px;scroll-behavior:smooth;scrollbar-width:thin}
      .gm-message-row{display:flex;margin:4px 0;animation:gmMessageIn .25s cubic-bezier(.2,.8,.2,1)}.gm-message-row.outgoing{justify-content:flex-end}.gm-message-row.incoming{justify-content:flex-start}
      @keyframes gmMessageIn{from{opacity:0;transform:translateY(7px) scale(.98)}to{opacity:1;transform:none}}
      .gm-bubble{max-width:min(72%,520px);padding:10px 13px 7px;border-radius:17px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.065);box-shadow:0 7px 20px rgba(0,0,0,.12);font-size:12px;line-height:1.48;overflow-wrap:anywhere}
      .gm-message-row.outgoing .gm-bubble{background:linear-gradient(145deg,hsla(var(--accent),78%,57%,.65),hsla(var(--accent),78%,47%,.48));border-bottom-right-radius:5px}.gm-message-row.incoming .gm-bubble{border-bottom-left-radius:5px}
      .gm-bubble small{display:block;text-align:right;margin-top:5px;color:rgba(255,255,255,.52);font-size:8px}
      .gm-empty-thread{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:34px;color:var(--muted)}.gm-empty-thread.compact{min-height:260px}.gm-empty-thread h3{margin:13px 0 6px;color:rgba(255,255,255,.86);font-size:17px}.gm-empty-thread p{max-width:330px;margin:0;font-size:10px;line-height:1.6}.gm-empty-orb{width:58px;height:58px;border-radius:21px;display:grid;place-items:center;background:linear-gradient(145deg,hsla(var(--accent),76%,58%,.3),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.1);font-weight:730}
      .gm-composer{display:grid;grid-template-columns:36px 40px minmax(0,1fr) 43px;align-items:end;gap:8px;padding:10px 13px 13px;border-top:1px solid rgba(255,255,255,.06);background:rgba(4,7,13,.52)}
      .gm-composer textarea{width:100%;min-height:42px;max-height:116px;resize:none;border-radius:16px;border:1px solid rgba(255,255,255,.09);outline:0;background:rgba(255,255,255,.055);color:#fff;padding:11px 13px;line-height:1.45;scrollbar-width:thin}.gm-composer textarea:focus{border-color:hsla(var(--accent),75%,65%,.38);background:rgba(255,255,255,.075)}.gm-composer textarea:disabled{opacity:.38}
      .gm-composer>button{width:43px;height:43px;border-radius:15px;border:1px solid rgba(255,255,255,.12);background:hsl(var(--accent),70%,55%);display:grid;place-items:center;cursor:pointer;transition:.2s}.gm-composer>button:hover:not(:disabled){transform:translateY(-2px) scale(1.03)}.gm-composer>button:disabled{opacity:.28;cursor:default}.gm-composer svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .gm-media-btn{width:36px!important;height:36px!important;align-self:center;border-radius:12px!important;background:rgba(255,255,255,.07)!important;font-size:9px!important}.gm-media-btn:hover{background:rgba(255,255,255,.13)!important}.gm-bubble img{display:block;max-width:min(320px,62vw);max-height:260px;border-radius:12px;margin-bottom:6px;object-fit:cover}.desktop-icon .app-icon{position:relative}.gm-app-badge{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ff4568;color:#fff;display:none;place-items:center;border:2px solid #121725;font:750 8px/1 Inter,sans-serif}.gm-app-badge.show{display:grid}
      .gm-tutorial{position:absolute;right:18px;bottom:18px;z-index:8;width:min(300px,calc(100% - 36px));padding:18px;border-radius:21px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,21,.92);box-shadow:0 24px 70px rgba(0,0,0,.46);backdrop-filter:blur(24px) saturate(160%);opacity:0;transform:translateY(12px) scale(.96);pointer-events:none;transition:opacity .32s ease,transform .42s cubic-bezier(.2,.85,.2,1),left .35s ease,right .35s ease,top .35s ease,bottom .35s ease}.gm-tutorial.show{opacity:1;transform:none;pointer-events:auto}.gm-tutorial.place-left{right:auto;left:18px}.gm-tutorial.place-top{bottom:auto;top:18px}
      .gm-tutorial-step{font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:hsla(var(--accent),90%,76%,.88)}.gm-tutorial-title{margin-top:8px;font-size:15px;font-weight:710}.gm-tutorial-copy{margin-top:7px;color:var(--muted);font-size:10px;line-height:1.55}.gm-tutorial-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:15px}.gm-tutorial-actions button{height:33px;padding:0 12px;border-radius:11px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.055);cursor:pointer;font-size:10px}.gm-tutorial-actions .primary{background:hsla(var(--accent),75%,55%,.42)}
      .gm-tutorial-line{position:absolute;inset:0;width:100%;height:100%;z-index:7;overflow:visible;pointer-events:none;opacity:0;transition:opacity .28s ease}.gm-tutorial-line.show{opacity:1}.gm-tutorial-line path{fill:none;stroke:hsla(var(--accent),90%,72%,.95);stroke-width:2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;filter:drop-shadow(0 0 6px hsla(var(--accent),90%,65%,.55));transition:stroke-dashoffset .65s cubic-bezier(.2,.8,.2,1),opacity .18s ease}.gm-tutorial-line circle{fill:hsl(var(--accent),85%,70%);filter:drop-shadow(0 0 7px hsla(var(--accent),90%,70%,.8));opacity:0;transition:opacity .25s .42s}
      .gm-tutorial-target{position:relative;z-index:9!important;box-shadow:0 0 0 2px hsla(var(--accent),90%,73%,.82),0 0 0 8px hsla(var(--accent),80%,55%,.12),0 0 30px hsla(var(--accent),80%,58%,.25)!important;transition:box-shadow .35s ease}
      @media(max-width:800px){.window[data-app="messages"]{width:calc(100vw - 24px)}.gm-shell{grid-template-columns:42% minmax(0,1fr)}.gm-sidebar{padding-left:9px;padding-right:9px}.gm-bubble{max-width:84%}}
      @media(max-width:560px){.gm-shell{grid-template-columns:118px minmax(0,1fr)}.gm-sidebar{padding:13px 6px 8px}.gm-title{font-size:17px}.gm-identity span:last-child{font-size:8px}.gm-help{display:none}.gm-add-contact{font-size:0}.gm-add-contact span:first-child{font-size:18px}.gm-contact{grid-template-columns:38px minmax(0,1fr);padding:7px 5px;gap:6px}.gm-contact .gm-avatar{width:38px;height:38px}.gm-contact-meta{display:none}.gm-contact-copy strong{font-size:9px}.gm-contact-copy small{display:none}.gm-chat-head{padding:0 10px}.gm-thread{padding:15px 10px 9px}.gm-tutorial{width:min(270px,calc(100% - 24px));left:12px!important;right:12px!important}.gm-tutorial-line{display:none}}
      @media(prefers-reduced-motion:reduce){.window[data-app="messages"],.gm-sidebar,.gm-chat,.gm-message-row{animation:none!important}.gm-tutorial,.gm-tutorial-line path{transition-duration:.01ms!important}}
    `;
    document.head.appendChild(style);
  }

  if(typeof global.addEventListener === "function"){
    global.addEventListener("online",() => { start(); retryQueued(); });
    global.addEventListener("offline",() => { state.connection="offline"; updateConnectionUI(); });
    global.addEventListener("storage",event => {
      if(!state.identity) return;
      if(event.key === contactKey() || event.key === historyKey()){
        loadIdentity(state.identity);
        renderContacts();
        renderConversation();
      }
    });
  }

  state.retryTimer = typeof global.setInterval === "function" ? global.setInterval(retryQueued,15000) : null;
  injectStyles();

  global.GenesisMessages = Object.freeze({
    sdkVersion:SDK_VERSION,
    html,
    init,
    start,
    onWindowClose,
    selectContact,
    toggleAddContact,
    submitContact,
    sendCurrent,
    removeCurrent,
    pickImage,
    sendGifPrompt,
    createGroupPrompt,
    replayTutorial,
    nextTutorial,
    finishTutorial,
    __test:Object.freeze({normalizeId,topicFor,escapeHTML})
  });
})(globalThis);
