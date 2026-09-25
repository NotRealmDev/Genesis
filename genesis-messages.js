(function(global){
  "use strict";

  const MAX_MESSAGES_PER_CONTACT=500;
  const MAX_MESSAGE_LENGTH=1200;
  const MAX_INLINE_MEDIA=240000;
  const CONTACTS_PREFIX="genesisMessagesContacts:";
  const HISTORY_PREFIX="genesisMessagesHistory:";
  const SELECTED_PREFIX="genesisMessagesSelected:";
  const SERVERS_PREFIX="genesisMessagesServers:";
  const SERVER_HISTORY_PREFIX="genesisMessagesServerHistory:";
  const VIEW_PREFIX="genesisMessagesView:";
  const TUTORIAL_KEY="genesisMessagesTutorialComplete";
  const SDK_VERSION="2.116.0";

  const state={
    client:null,inbox:null,identity:"",connection:"connecting",
    mode:"dm",selected:"",selectedServer:"",selectedChannel:"",
    contacts:[],history:{},servers:[],serverHistory:{},
    window:null,tutorialIndex:-1,tutorialTimer:null,tutorialResize:null,retryTimer:null
  };

  const tutorialSteps=[
    {target:"#gmIdentity",title:"Your Genesis identity",copy:"Your three-digit Genesis ID is how people can find you for direct messages and server invites."},
    {target:"#gmServerRail",title:"Servers live here",copy:"Create servers, switch communities, and jump back to Direct Messages from the server rail."},
    {target:"#gmContactList",title:"Channels and conversations",copy:"This panel changes with what you are viewing: DMs on Home, channels inside a server."},
    {target:"#gmComposer",title:"Send anything",copy:"Send text, images, or GIFs. Press Enter to send and Shift + Enter for a new line."}
  ];

  function storageGet(key,fallback){
    try{const value=JSON.parse(localStorage.getItem(key)||"null");return value===null?fallback:value}catch{return fallback}
  }
  function storageSet(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  function normalizeId(value){
    const digits=String(value==null?"":value).replace(/\D/g,"").slice(0,3);
    return /^\d{3}$/.test(digits)?digits:"";
  }
  function currentId(){return normalizeId(localStorage.getItem("genesisDisplayId"))}
  function currentName(){
    try{
      const custom=String(localStorage.getItem("genesisUsername")||"").trim();
      if(custom)return custom.slice(0,40);
      const login=JSON.parse(localStorage.getItem("genesisLogin")||"null");
      return String(login?.user||sessionStorage.getItem("realmUser")||"Genesis User").slice(0,40);
    }catch{return "Genesis User"}
  }
  function backend(){
    const value=global.GENESIS_BACKEND||{};
    if(!/^https:\/\/.+\.supabase\.co$/i.test(String(value.url||"")))return null;
    if(String(value.anonKey||"").length<20)return null;
    return value;
  }
  function contactKey(id=state.identity){return CONTACTS_PREFIX+id}
  function historyKey(id=state.identity){return HISTORY_PREFIX+id}
  function selectedKey(id=state.identity){return SELECTED_PREFIX+id}
  function serversKey(id=state.identity){return SERVERS_PREFIX+id}
  function serverHistoryKey(id=state.identity){return SERVER_HISTORY_PREFIX+id}
  function viewKey(id=state.identity){return VIEW_PREFIX+id}
  function topicFor(id){return "genesis-inbox-"+normalizeId(id)}
  function escapeHTML(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(character){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character];
    });
  }
  function uniqueMessageId(){
    if(global.crypto?.randomUUID)return global.crypto.randomUUID();
    return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  }
  function serverId(value){return String(value||"").replace(/[^a-z0-9_-]/gi,"").slice(0,64)}
  function channelSlug(value){
    return String(value||"").trim().toLowerCase().replace(/[^a-z0-9 -]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").slice(0,28);
  }
  function normalizeServer(raw){
    if(!raw||typeof raw!=="object")return null;
    const id=serverId(raw.id);
    const name=String(raw.name||"Genesis Server").trim().slice(0,36);
    if(!id||!name)return null;
    const members=Array.from(new Set((Array.isArray(raw.members)?raw.members:[]).map(normalizeId).filter(Boolean))).slice(0,50);
    const owner=normalizeId(raw.owner)||members[0]||"";
    const channels=[];
    for(const item of Array.isArray(raw.channels)?raw.channels:[]){
      const cid=serverId(item?.id)||channelSlug(item?.name);
      const cname=channelSlug(item?.name||cid);
      if(cid&&cname&&!channels.some(channel=>channel.id===cid))channels.push({id:cid,name:cname});
    }
    if(!channels.length)channels.push({id:"general",name:"general"});
    return {id,name,owner,members,channels,createdAt:String(raw.createdAt||new Date().toISOString())};
  }
  function publicServer(server){
    return {id:server.id,name:server.name,owner:server.owner,members:server.members.slice(),channels:server.channels.map(c=>({id:c.id,name:c.name})),createdAt:server.createdAt};
  }

  function loadIdentity(id=currentId()){
    if(!id)return false;
    state.identity=id;
    const contacts=storageGet(contactKey(id),[]);
    const history=storageGet(historyKey(id),{});
    const servers=storageGet(serversKey(id),[]);
    const serverHistory=storageGet(serverHistoryKey(id),{});
    state.contacts=Array.isArray(contacts)?contacts.filter(contact=>normalizeId(contact?.id)&&normalizeId(contact.id)!==id):[];
    state.history=history&&typeof history==="object"&&!Array.isArray(history)?history:{};
    state.servers=Array.isArray(servers)?servers.map(normalizeServer).filter(server=>server&&server.members.includes(id)):[];
    state.serverHistory=serverHistory&&typeof serverHistory==="object"&&!Array.isArray(serverHistory)?serverHistory:{};
    const selected=normalizeId(localStorage.getItem(selectedKey(id))||"");
    state.selected=state.contacts.some(contact=>contact.id===selected)?selected:(state.contacts[0]?.id||"");
    const view=storageGet(viewKey(id),{});
    state.mode=view.mode==="server"?"server":"dm";
    state.selectedServer=serverId(view.server);
    state.selectedChannel=serverId(view.channel);
    if(!state.servers.some(server=>server.id===state.selectedServer)){
      state.mode="dm";state.selectedServer="";state.selectedChannel="";
    }else{
      const server=state.servers.find(item=>item.id===state.selectedServer);
      if(!server.channels.some(channel=>channel.id===state.selectedChannel))state.selectedChannel=server.channels[0]?.id||"general";
    }
    return true;
  }
  function saveContacts(){storageSet(contactKey(),state.contacts)}
  function saveHistory(){storageSet(historyKey(),state.history)}
  function saveServers(){storageSet(serversKey(),state.servers)}
  function saveServerHistory(){storageSet(serverHistoryKey(),state.serverHistory)}
  function saveSelected(){try{localStorage.setItem(selectedKey(),state.selected||"")}catch{}}
  function saveView(){storageSet(viewKey(),{mode:state.mode,server:state.selectedServer,channel:state.selectedChannel})}

  function conversation(id){
    const normalized=normalizeId(id),list=state.history[normalized];
    return Array.isArray(list)?list:[];
  }
  function serverConversation(sid,cid){
    const list=state.serverHistory[serverId(sid)+":"+serverId(cid)];
    return Array.isArray(list)?list:[];
  }
  function currentServer(){return state.servers.find(server=>server.id===state.selectedServer)||null}
  function currentChannel(){
    const server=currentServer();
    return server?.channels.find(channel=>channel.id===state.selectedChannel)||server?.channels[0]||null;
  }
  function lastMessage(id){const list=conversation(id);return list[list.length-1]||null}
  function unreadCount(id){return conversation(id).filter(message=>message.direction==="incoming"&&message.unread).length}
  function serverUnreadCount(server){
    return server.channels.reduce((total,channel)=>total+serverConversation(server.id,channel.id).filter(message=>message.direction==="incoming"&&message.unread).length,0);
  }
  function totalUnread(){
    return state.contacts.reduce((total,contact)=>total+unreadCount(contact.id),0)+state.servers.reduce((total,server)=>total+serverUnreadCount(server),0);
  }
  function contactLabel(contact){
    if(contact?.name&&contact.name!=="Genesis User")return contact.name;
    return "Genesis ID "+contact.id;
  }
  function addContact(id,metadata={}){
    const normalized=normalizeId(id);
    if(!normalized||normalized===state.identity)return null;
    let contact=state.contacts.find(item=>item.id===normalized);
    if(!contact){
      contact={id:normalized,name:String(metadata.name||"").slice(0,40),addedAt:new Date().toISOString()};
      state.contacts.unshift(contact);
    }else if(metadata.name&&metadata.name!=="Genesis User"){
      contact.name=String(metadata.name).slice(0,40);
    }
    saveContacts();
    return contact;
  }
  function syncServer(raw){
    const server=normalizeServer(raw);
    if(!server||!server.members.includes(state.identity))return null;
    const existing=state.servers.find(item=>item.id===server.id);
    if(existing)Object.assign(existing,server);
    else state.servers.unshift(server);
    saveServers();
    return existing||server;
  }
  function putMessage(contactId,message){
    const id=normalizeId(contactId);
    if(!id||!message?.id)return false;
    const list=conversation(id).slice();
    if(list.some(item=>item.id===message.id))return false;
    list.push(message);
    list.sort((a,b)=>String(a.sentAt).localeCompare(String(b.sentAt)));
    state.history[id]=list.slice(-MAX_MESSAGES_PER_CONTACT);
    saveHistory();
    return true;
  }
  function putServerMessage(sid,cid,message){
    const key=serverId(sid)+":"+serverId(cid);
    if(!key||!message?.id)return false;
    const list=serverConversation(sid,cid).slice();
    if(list.some(item=>item.id===message.id))return false;
    list.push(message);
    list.sort((a,b)=>String(a.sentAt).localeCompare(String(b.sentAt)));
    state.serverHistory[key]=list.slice(-MAX_MESSAGES_PER_CONTACT);
    saveServerHistory();
    return true;
  }
  function patchMessage(contactId,messageId,patch){
    const message=conversation(contactId).find(item=>item.id===messageId);
    if(!message)return false;
    Object.assign(message,patch);saveHistory();return true;
  }
  function patchServerMessage(sid,cid,messageId,patch){
    const message=serverConversation(sid,cid).find(item=>item.id===messageId);
    if(!message)return false;
    Object.assign(message,patch);saveServerHistory();return true;
  }
  function formatTime(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return "";
    return date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  }
  function safeMediaUrl(value){
    const url=String(value||"").trim();
    if(/^https:\/\//i.test(url))return url.slice(0,4000);
    if(/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)&&url.length<=MAX_INLINE_MEDIA)return url;
    return "";
  }
  function mediaLabel(media){
    if(!media?.url)return "";
    return String(media.type||"").toLowerCase()==="gif"?"sent a GIF":"sent an image";
  }
  function messagePreview(text,media){
    const clean=String(text||"").replace(/\s+/g," ").trim();
    if(clean&&clean!=="Image"&&clean!=="GIF")return clean.slice(0,115);
    return mediaLabel(media)||"sent a message";
  }
  function showMessageNotification(sender,text,media,context){
    if(typeof global.showGenesisAnnouncement!=="function")return;
    const prefix=context?sender+" · "+context:sender;
    global.showGenesisAnnouncement(prefix+": "+messagePreview(text,media),6000);
  }

  function html(){
    const id=currentId()||"···";
    return '<div class="gm-shell" id="genesisMessagesApp">'+
      '<nav class="gm-server-rail" aria-label="Servers">'+
        '<button class="gm-home-server" id="gmHomeServer" type="button" onclick="GenesisMessages.selectDirectMessages()" title="Direct Messages"><span>✦</span></button>'+
        '<div class="gm-rail-divider"></div>'+
        '<div class="gm-server-list" id="gmServerRail"></div>'+
        '<button class="gm-create-server" type="button" onclick="GenesisMessages.createServerPrompt()" title="Create server">＋</button>'+
      '</nav>'+
      '<aside class="gm-sidebar">'+
        '<div class="gm-sidebar-head" id="gmNavHead">'+
          '<div><div class="gm-title" id="gmNavTitle">Direct Messages</div><div class="gm-identity" id="gmIdentity"><span class="gm-live-dot"></span><span>Your ID '+escapeHTML(id)+'</span></div></div>'+
          '<button class="gm-help" type="button" onclick="GenesisMessages.replayTutorial()" title="Show tutorial">?</button>'+
        '</div>'+
        '<div class="gm-server-actions" id="gmServerActions"></div>'+
        '<button class="gm-add-contact" id="gmAddContactButton" type="button" onclick="GenesisMessages.toggleAddContact(true)"><span>＋</span><span>Add friend by ID</span></button>'+
        '<div class="gm-add-panel" id="gmAddPanel" aria-hidden="true">'+
          '<label for="gmContactId">Three-digit Genesis ID</label>'+
          '<div class="gm-add-row"><input id="gmContactId" inputmode="numeric" maxlength="3" placeholder="527" autocomplete="off"><button type="button" onclick="GenesisMessages.submitContact()">Add</button></div>'+
          '<div class="gm-add-status" id="gmAddStatus"></div>'+
        '</div>'+
        '<div class="gm-contact-list" id="gmContactList"></div>'+
        '<div class="gm-userbar"><span class="gm-user-avatar">'+escapeHTML((currentName().slice(0,2)||"GU").toUpperCase())+'</span><span><strong>'+escapeHTML(currentName())+'</strong><small>ID '+escapeHTML(id)+'</small></span><span class="gm-status-dot"></span></div>'+
      '</aside>'+
      '<section class="gm-chat">'+
        '<header class="gm-chat-head" id="gmChatHead"></header>'+
        '<div class="gm-thread" id="gmThread"></div>'+
        '<div class="gm-composer-wrap"><div class="gm-composer" id="gmComposer">'+
          '<button class="gm-media-btn" type="button" onclick="GenesisMessages.pickImage()" title="Send image">＋</button>'+
          '<button class="gm-gif-btn" type="button" onclick="GenesisMessages.sendGifPrompt()" title="Send GIF">GIF</button>'+
          '<input id="gmImagePicker" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>'+
          '<textarea id="gmMessageInput" maxlength="'+MAX_MESSAGE_LENGTH+'" rows="1" placeholder="Choose a conversation" disabled></textarea>'+
          '<button class="gm-send-btn" id="gmSendButton" type="button" onclick="GenesisMessages.sendCurrent()" disabled title="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l17 8-17 8 3-8-3-8zM7 12h14"/></svg></button>'+
        '</div></div>'+
      '</section>'+
      '<svg class="gm-tutorial-line" id="gmTutorialLine" aria-hidden="true"><path></path><circle r="4"></circle></svg>'+
      '<div class="gm-tutorial" id="gmTutorial" role="dialog" aria-live="polite"><div class="gm-tutorial-step" id="gmTutorialStep"></div><div class="gm-tutorial-title" id="gmTutorialTitle"></div><div class="gm-tutorial-copy" id="gmTutorialCopy"></div><div class="gm-tutorial-actions"><button type="button" onclick="GenesisMessages.finishTutorial()">Skip</button><button class="primary" id="gmTutorialNext" type="button" onclick="GenesisMessages.nextTutorial()">Next</button></div></div>'+
    '</div>';
  }

  function renderServerRail(){
    const rail=document.getElementById("gmServerRail");
    const home=document.getElementById("gmHomeServer");
    if(!rail)return;
    if(home)home.classList.toggle("active",state.mode==="dm");
    rail.innerHTML=state.servers.map(function(server){
      const unread=serverUnreadCount(server);
      const initials=server.name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()||"G";
      return '<button class="gm-server-icon '+(state.mode==="server"&&state.selectedServer===server.id?"active":"")+'" type="button" onclick="GenesisMessages.selectServer(\''+escapeHTML(server.id)+'\')" title="'+escapeHTML(server.name)+'"><span>'+escapeHTML(initials)+'</span>'+(unread?'<b>'+Math.min(unread,99)+'</b>':'')+'</button>';
    }).join("");
  }

  function renderContacts(){
    const list=document.getElementById("gmContactList");
    const title=document.getElementById("gmNavTitle");
    const identity=document.getElementById("gmIdentity");
    const add=document.getElementById("gmAddContactButton");
    const actions=document.getElementById("gmServerActions");
    if(!list)return;

    if(state.mode==="server"){
      const server=currentServer();
      if(!server){state.mode="dm";saveView();return renderContacts()}
      if(title)title.textContent=server.name;
      if(identity)identity.innerHTML='<span class="gm-live-dot"></span><span>'+server.members.length+' member'+(server.members.length===1?"":"s")+'</span>';
      if(add)add.hidden=true;
      if(actions)actions.innerHTML='<button type="button" onclick="GenesisMessages.inviteToServerPrompt()">Invite</button><button type="button" onclick="GenesisMessages.createChannelPrompt()">＋ Channel</button>';
      list.innerHTML='<div class="gm-section-label">TEXT CHANNELS</div>'+server.channels.map(function(channel){
        const unread=serverConversation(server.id,channel.id).filter(message=>message.direction==="incoming"&&message.unread).length;
        return '<button class="gm-channel '+(channel.id===state.selectedChannel?"active":"")+'" type="button" onclick="GenesisMessages.selectChannel(\''+escapeHTML(channel.id)+'\')"><span>#</span><strong>'+escapeHTML(channel.name)+'</strong>'+(unread?'<b>'+Math.min(unread,99)+'</b>':'')+'</button>';
      }).join("");
      return;
    }

    if(title)title.textContent="Direct Messages";
    if(identity)identity.innerHTML='<span class="gm-live-dot"></span><span>Your ID '+escapeHTML(state.identity||currentId()||"···")+'</span>';
    if(add)add.hidden=false;
    if(actions)actions.innerHTML="";
    if(!state.contacts.length){
      list.innerHTML='<div class="gm-empty-contacts"><div>✦</div><strong>No DMs yet</strong><span>Add someone by Genesis ID or create a server.</span></div>';
      updateBadges();return;
    }
    const sorted=state.contacts.slice().sort(function(a,b){
      return String(lastMessage(b.id)?.sentAt||b.addedAt||"").localeCompare(String(lastMessage(a.id)?.sentAt||a.addedAt||""));
    });
    list.innerHTML='<div class="gm-section-label">DIRECT MESSAGES</div>'+sorted.map(function(contact){
      const last=lastMessage(contact.id),unread=unreadCount(contact.id);
      const preview=last?messagePreview(last.text,last.media):"New conversation";
      return '<button class="gm-contact '+(contact.id===state.selected?"active":"")+'" type="button" onclick="GenesisMessages.selectContact(\''+contact.id+'\')"><span class="gm-avatar">'+escapeHTML(contact.id.slice(-2))+'</span><span class="gm-contact-copy"><strong>'+escapeHTML(contactLabel(contact))+'</strong><small>'+escapeHTML(preview)+'</small></span><span class="gm-contact-meta"><time>'+(last?escapeHTML(formatTime(last.sentAt)):"")+'</time>'+(unread?'<b>'+Math.min(unread,99)+'</b>':'')+'</span></button>';
    }).join("");
    updateBadges();
  }

  function renderMessageRows(messages,serverMode){
    if(!messages.length)return "";
    return messages.map(function(message){
      const own=message.direction==="outgoing";
      const sender=own?currentName():String(message.senderName||"Genesis User");
      const avatar=(sender.replace(/\s+/g,"").slice(0,2)||message.from||"GU").toUpperCase();
      const status=own?(message.status==="queued"?" · retrying":message.status==="sending"?" · sending":""):"";
      const media=message.media?.url?'<img class="gm-message-media" src="'+escapeHTML(message.media.url)+'" alt="'+escapeHTML(message.media.type||"image")+'" loading="lazy">':"";
      const body=String(message.text||"").trim();
      const visibleText=(body==="Image"||body==="GIF")&&media?"":'<div class="gm-message-text">'+escapeHTML(body).replace(/\n/g,"<br>")+'</div>';
      return '<article class="gm-chat-message '+(own?"own":"")+'" data-message-id="'+escapeHTML(message.id)+'"><div class="gm-message-avatar">'+escapeHTML(avatar)+'</div><div class="gm-message-content"><div class="gm-message-meta"><strong>'+escapeHTML(sender)+'</strong><time>'+escapeHTML(formatTime(message.sentAt))+escapeHTML(status)+'</time></div>'+visibleText+media+'</div></article>';
    }).join("");
  }

  function bindImagePicker(){
    const picker=document.getElementById("gmImagePicker");
    if(!picker||picker.dataset.bound)return;
    picker.dataset.bound="1";
    picker.addEventListener("change",function(){
      const file=picker.files?.[0];
      if(!file)return;
      if(file.size>175000){
        if(typeof global.showGenesisAnnouncement==="function")global.showGenesisAnnouncement("Image is too large. Choose one under 175 KB.",4200);
        picker.value="";return;
      }
      const reader=new FileReader();
      reader.onload=function(){sendMedia("image",reader.result)};
      reader.readAsDataURL(file);
      picker.value="";
    });
  }

  function renderConversation(){
    const header=document.getElementById("gmChatHead");
    const thread=document.getElementById("gmThread");
    const input=document.getElementById("gmMessageInput");
    const send=document.getElementById("gmSendButton");
    if(!header||!thread||!input||!send)return;
    bindImagePicker();

    if(state.mode==="server"){
      const server=currentServer(),channel=currentChannel();
      if(!server||!channel){
        input.disabled=true;send.disabled=true;
        header.innerHTML='<div><strong>Server</strong><small id="gmConnectionLabel"></small></div>';
        thread.innerHTML='<div class="gm-empty-thread"><div class="gm-empty-orb">#</div><h3>Select a channel</h3></div>';
        updateConnectionUI();return;
      }
      header.innerHTML='<div class="gm-channel-head"><span>#</span><div><strong>'+escapeHTML(channel.name)+'</strong><small>'+escapeHTML(server.name)+' · '+server.members.length+' members · <span id="gmConnectionLabel"></span></small></div></div><div class="gm-head-pill">'+server.members.length+' members</div>';
      const messages=serverConversation(server.id,channel.id);
      thread.innerHTML=messages.length?renderMessageRows(messages,true):'<div class="gm-channel-welcome"><div>#</div><h2>Welcome to #'+escapeHTML(channel.name)+'</h2><p>This is the start of the channel in '+escapeHTML(server.name)+'.</p></div>';
      input.disabled=false;send.disabled=false;input.placeholder="Message #"+channel.name;
      updateConnectionUI();
      requestAnimationFrame(function(){thread.scrollTop=thread.scrollHeight});
      return;
    }

    const contact=state.contacts.find(item=>item.id===state.selected);
    if(!contact){
      header.innerHTML='<div><strong>Direct Messages</strong><small id="gmConnectionLabel">Connecting…</small></div>';
      thread.innerHTML='<div class="gm-empty-thread"><div class="gm-empty-orb">✦</div><h3>Your conversations</h3><p>Add a Genesis ID or create a server to start talking.</p></div>';
      input.disabled=true;send.disabled=true;input.placeholder="Choose a conversation";updateConnectionUI();return;
    }
    header.innerHTML='<div class="gm-chat-person"><span class="gm-avatar">'+escapeHTML(contact.id.slice(-2))+'</span><span><strong>'+escapeHTML(contactLabel(contact))+'</strong><small>ID '+escapeHTML(contact.id)+' · <span id="gmConnectionLabel"></span></small></span></div><button type="button" class="gm-remove" onclick="GenesisMessages.removeCurrent()" title="Remove DM">•••</button>';
    const messages=conversation(contact.id);
    thread.innerHTML=messages.length?renderMessageRows(messages,false):'<div class="gm-channel-welcome"><div>@</div><h2>'+escapeHTML(contactLabel(contact))+'</h2><p>This is the beginning of your direct message history.</p></div>';
    input.disabled=false;send.disabled=false;input.placeholder="Message "+contactLabel(contact);
    updateConnectionUI();
    requestAnimationFrame(function(){thread.scrollTop=thread.scrollHeight});
  }

  function renderAll(){renderServerRail();renderContacts();renderConversation();updateBadges()}
  function updateConnectionUI(){
    const label=document.getElementById("gmConnectionLabel");
    const dots=document.querySelectorAll(".gm-live-dot,.gm-status-dot");
    const descriptions={live:"Live",connecting:"Connecting…",offline:"Saved mode",error:"Reconnecting…"};
    if(label)label.textContent=descriptions[state.connection]||descriptions.connecting;
    dots.forEach(dot=>dot.classList.toggle("online",state.connection==="live"));
  }
  function updateBadges(){
    const count=totalUnread();
    document.querySelectorAll("[data-messages-badge]").forEach(function(badge){
      badge.textContent=count>99?"99+":String(count);
      badge.classList.toggle("show",count>0);
    });
  }

  function selectDirectMessages(){
    state.mode="dm";saveView();renderAll();
    setTimeout(function(){document.getElementById("gmMessageInput")?.focus()},80);
  }
  function selectServer(id){
    const server=state.servers.find(item=>item.id===serverId(id));
    if(!server)return;
    state.mode="server";state.selectedServer=server.id;state.selectedChannel=server.channels[0]?.id||"general";
    saveView();markCurrentServerRead();renderAll();
  }
  function selectChannel(id){
    const server=currentServer(),cid=serverId(id);
    if(!server||!server.channels.some(channel=>channel.id===cid))return;
    state.mode="server";state.selectedChannel=cid;saveView();markCurrentServerRead();renderAll();
    setTimeout(function(){document.getElementById("gmMessageInput")?.focus()},80);
  }
  function markCurrentServerRead(){
    const server=currentServer(),channel=currentChannel();
    if(!server||!channel)return;
    serverConversation(server.id,channel.id).forEach(function(message){if(message.direction==="incoming")message.unread=false});
    saveServerHistory();
  }
  function selectContact(id){
    const normalized=normalizeId(id);
    if(!state.contacts.some(contact=>contact.id===normalized))return;
    state.mode="dm";state.selected=normalized;saveSelected();saveView();
    conversation(normalized).forEach(function(message){if(message.direction==="incoming")message.unread=false});
    saveHistory();renderAll();
    setTimeout(function(){document.getElementById("gmMessageInput")?.focus()},80);
  }

  function toggleAddContact(show){
    const panel=document.getElementById("gmAddPanel");
    if(!panel)return;
    const active=typeof show==="boolean"?show:!panel.classList.contains("show");
    panel.classList.toggle("show",active);panel.setAttribute("aria-hidden",active?"false":"true");
    if(active)setTimeout(function(){document.getElementById("gmContactId")?.focus()},120);
  }
  function submitContact(){
    const input=document.getElementById("gmContactId"),status=document.getElementById("gmAddStatus");
    const id=normalizeId(input?.value);
    if(!id){if(status)status.textContent="Enter a complete three-digit ID.";return}
    if(id===state.identity){if(status)status.textContent="That is your own Genesis ID.";return}
    addContact(id);state.mode="dm";state.selected=id;saveSelected();saveView();
    if(input)input.value="";if(status)status.textContent="ID "+id+" added.";
    renderAll();
    setTimeout(function(){toggleAddContact(false);document.getElementById("gmMessageInput")?.focus()},280);
  }

  async function sendBroadcast(targetId,event,payload){
    if(!state.client)throw new Error("Live messaging is not connected");
    const channel=state.client.channel(topicFor(targetId));
    try{
      if(typeof channel.httpSend==="function"){
        const response=await channel.httpSend(event,payload);
        if(response?.success===false)throw new Error(response.error||"Message service rejected the request");
        return response;
      }
      const response=await channel.send({type:"broadcast",event,payload});
      if(response!=="ok")throw new Error("Message service returned "+response);
      return response;
    }finally{state.client.removeChannel(channel).catch?.(function(){})}
  }
  async function broadcastServerMeta(server,targets){
    const recipients=(targets||server.members).filter(id=>id!==state.identity);
    await Promise.allSettled(recipients.map(function(id){
      return sendBroadcast(id,"server-sync",{from:state.identity,to:id,server:publicServer(server),sentAt:new Date().toISOString()});
    }));
  }

  function createServerPrompt(){
    const name=String(prompt("Server name")||"").trim().slice(0,36);
    if(!name)return;
    const invited=String(prompt("Invite Genesis IDs now? Separate IDs with commas. You can leave this blank.")||"").split(",").map(normalizeId).filter(id=>id&&id!==state.identity);
    const id="s-"+uniqueMessageId().replace(/[^a-z0-9]/gi,"").slice(0,18);
    const server=normalizeServer({id,name,owner:state.identity,members:[state.identity].concat(invited),channels:[{id:"general",name:"general"}],createdAt:new Date().toISOString()});
    state.servers.unshift(server);saveServers();
    state.mode="server";state.selectedServer=server.id;state.selectedChannel="general";saveView();renderAll();
    if(state.connection==="live")broadcastServerMeta(server,invited);
    if(typeof global.showGenesisAnnouncement==="function")global.showGenesisAnnouncement(name+" created · #general is ready",3600);
  }
  function createGroupPrompt(){return createServerPrompt()}
  function inviteToServerPrompt(){
    const server=currentServer();if(!server)return;
    const ids=String(prompt("Genesis IDs to invite, separated by commas")||"").split(",").map(normalizeId).filter(id=>id&&id!==state.identity);
    const fresh=ids.filter(id=>!server.members.includes(id));
    if(!fresh.length)return;
    server.members=Array.from(new Set(server.members.concat(fresh))).slice(0,50);saveServers();renderAll();
    if(state.connection==="live")broadcastServerMeta(server,fresh);
    if(typeof global.showGenesisAnnouncement==="function")global.showGenesisAnnouncement(fresh.length+" member"+(fresh.length===1?"":"s")+" invited to "+server.name,3200);
  }
  function createChannelPrompt(){
    const server=currentServer();if(!server)return;
    const name=channelSlug(prompt("Channel name")||"");
    if(!name)return;
    let id=name,suffix=2;
    while(server.channels.some(channel=>channel.id===id)){id=name+"-"+suffix++}
    server.channels.push({id,name});state.selectedChannel=id;saveServers();saveView();renderAll();
    if(state.connection==="live")broadcastServerMeta(server);
  }

  async function sendDirectMessage(text,media){
    const target=normalizeId(state.selected);if(!target||(!text&&!media))return;
    const message={id:uniqueMessageId(),from:state.identity,to:target,senderName:currentName(),text:text||mediaLabel(media),media:media||null,sentAt:new Date().toISOString(),direction:"outgoing",status:"sending",unread:false,version:3};
    putMessage(target,message);renderAll();
    try{
      await sendBroadcast(target,"message",{id:message.id,from:message.from,to:message.to,senderName:message.senderName,text:message.text,media:message.media,sentAt:message.sentAt,version:3});
      patchMessage(target,message.id,{status:"sent"});
    }catch(error){console.warn("Genesis DM queued:",error);patchMessage(target,message.id,{status:"queued"})}
    renderAll();
  }
  async function sendServerMessage(text,media){
    const server=currentServer(),channel=currentChannel();if(!server||!channel||(!text&&!media))return;
    const message={id:uniqueMessageId(),from:state.identity,senderName:currentName(),text:text||mediaLabel(media),media:media||null,serverId:server.id,channelId:channel.id,sentAt:new Date().toISOString(),direction:"outgoing",status:"sending",unread:false,version:3};
    putServerMessage(server.id,channel.id,message);renderAll();
    const recipients=server.members.filter(id=>id!==state.identity);
    if(!recipients.length){patchServerMessage(server.id,channel.id,message.id,{status:"sent"});renderAll();return}
    const results=await Promise.allSettled(recipients.map(function(id){
      return sendBroadcast(id,"server-message",{id:message.id,from:state.identity,to:id,senderName:message.senderName,text:message.text,media:message.media,server:publicServer(server),channelId:channel.id,sentAt:message.sentAt,version:3});
    }));
    patchServerMessage(server.id,channel.id,message.id,{status:results.some(result=>result.status==="fulfilled")?"sent":"queued"});
    renderAll();
  }
  async function sendCurrent(){
    const input=document.getElementById("gmMessageInput");
    const text=String(input?.value||"").trim().slice(0,MAX_MESSAGE_LENGTH);
    if(!text)return;
    if(input){input.value="";input.style.height="auto"}
    if(state.mode==="server")await sendServerMessage(text,null);else await sendDirectMessage(text,null);
  }
  async function sendMedia(type,url){
    const safe=safeMediaUrl(url);if(!safe)return;
    const media={type:type==="gif"?"gif":"image",url:safe};
    if(state.mode==="server")await sendServerMessage("",media);else await sendDirectMessage("",media);
  }
  function pickImage(){document.getElementById("gmImagePicker")?.click()}
  function sendGifPrompt(){
    const url=String(prompt("Paste a direct HTTPS GIF URL")||"").trim();
    if(/^https:\/\//i.test(url))sendMedia("gif",url);
  }

  async function retryQueued(){
    if(!state.client||state.connection!=="live")return;
    const direct=[];
    for(const [contactId,list] of Object.entries(state.history)){
      for(const message of Array.isArray(list)?list:[])if(message.direction==="outgoing"&&message.status==="queued")direct.push({contactId,message});
    }
    for(const item of direct.slice(0,12)){
      try{
        await sendBroadcast(item.contactId,"message",{id:item.message.id,from:item.message.from,to:item.message.to,senderName:item.message.senderName,text:item.message.text,media:item.message.media||null,sentAt:item.message.sentAt,version:item.message.version||3});
        patchMessage(item.contactId,item.message.id,{status:"sent"});
      }catch{break}
    }
    const queuedServers=[];
    for(const server of state.servers){
      for(const channel of server.channels){
        for(const message of serverConversation(server.id,channel.id)){
          if(message.direction==="outgoing"&&message.status==="queued")queuedServers.push({server,channel,message});
        }
      }
    }
    for(const item of queuedServers.slice(0,8)){
      const recipients=item.server.members.filter(id=>id!==state.identity);
      const results=await Promise.allSettled(recipients.map(function(id){
        return sendBroadcast(id,"server-message",{id:item.message.id,from:state.identity,to:id,senderName:item.message.senderName,text:item.message.text,media:item.message.media||null,server:publicServer(item.server),channelId:item.channel.id,sentAt:item.message.sentAt,version:item.message.version||3});
      }));
      if(results.some(result=>result.status==="fulfilled"))patchServerMessage(item.server.id,item.channel.id,item.message.id,{status:"sent"});
    }
    if(direct.length||queuedServers.length)renderAll();
  }

  function handleIncoming(packet){
    const payload=packet?.payload&&packet.payload.id?packet.payload:packet;
    const from=normalizeId(payload?.from),to=normalizeId(payload?.to);
    const text=String(payload?.text||"").trim().slice(0,MAX_MESSAGE_LENGTH);
    const mediaUrl=safeMediaUrl(payload?.media?.url),media=mediaUrl?{type:String(payload.media.type||"image").slice(0,12),url:mediaUrl}:null;
    if(!payload?.id||!from||to!==state.identity||(!text&&!media)||from===state.identity)return;
    const contact=addContact(from,{name:payload.senderName});
    const appOpen=!!document.getElementById("genesisMessagesApp");
    const selected=appOpen&&state.mode==="dm"&&state.selected===from;
    const added=putMessage(from,{id:String(payload.id).slice(0,100),from,to,senderName:String(payload.senderName||"Genesis User").slice(0,40),text,media,sentAt:payload.sentAt&&!Number.isNaN(new Date(payload.sentAt).getTime())?payload.sentAt:new Date().toISOString(),direction:"incoming",status:"received",unread:!selected,version:payload.version||3});
    if(!added)return;
    if(selected){conversation(from).forEach(message=>{if(message.direction==="incoming")message.unread=false});saveHistory()}
    renderAll();
    sendBroadcast(from,"receipt",{id:String(payload.id),from:state.identity,to:from,receivedAt:new Date().toISOString()}).catch(function(){});
    if(!selected)showMessageNotification(contactLabel(contact),text,media,"DM");
  }
  function handleServerSync(packet){
    const payload=packet?.payload?.server?packet.payload:packet;
    const to=normalizeId(payload?.to),from=normalizeId(payload?.from);
    if(!from||to!==state.identity||from===state.identity)return;
    const existed=state.servers.some(server=>server.id===serverId(payload.server?.id));
    const server=syncServer(payload.server);if(!server)return;
    renderAll();
    if(!existed&&typeof global.showGenesisAnnouncement==="function")global.showGenesisAnnouncement("You were invited to "+server.name,5000);
  }
  function handleServerMessage(packet){
    const payload=packet?.payload&&packet.payload.id?packet.payload:packet;
    const from=normalizeId(payload?.from),to=normalizeId(payload?.to);
    if(!payload?.id||!from||to!==state.identity||from===state.identity)return;
    const server=syncServer(payload.server);if(!server||!server.members.includes(from))return;
    const channelId=serverId(payload.channelId);
    const channel=server.channels.find(item=>item.id===channelId);if(!channel)return;
    const text=String(payload?.text||"").trim().slice(0,MAX_MESSAGE_LENGTH);
    const mediaUrl=safeMediaUrl(payload?.media?.url),media=mediaUrl?{type:String(payload.media.type||"image").slice(0,12),url:mediaUrl}:null;
    if(!text&&!media)return;
    const appOpen=!!document.getElementById("genesisMessagesApp");
    const selected=appOpen&&state.mode==="server"&&state.selectedServer===server.id&&state.selectedChannel===channelId;
    const added=putServerMessage(server.id,channelId,{id:String(payload.id).slice(0,100),from,senderName:String(payload.senderName||"Genesis User").slice(0,40),text,media,serverId:server.id,channelId,sentAt:payload.sentAt&&!Number.isNaN(new Date(payload.sentAt).getTime())?payload.sentAt:new Date().toISOString(),direction:"incoming",status:"received",unread:!selected,version:payload.version||3});
    if(!added)return;
    if(selected){markCurrentServerRead()}
    renderAll();
    if(!selected)showMessageNotification(String(payload.senderName||"Genesis User"),text,media,server.name+" · #"+channel.name);
  }
  function handleReceipt(packet){
    const payload=packet?.payload&&packet.payload.id?packet.payload:packet;
    const from=normalizeId(payload?.from),to=normalizeId(payload?.to);
    if(!payload?.id||!from||to!==state.identity)return;
    if(patchMessage(from,String(payload.id),{status:"delivered",deliveredAt:payload.receivedAt||new Date().toISOString()}))renderConversation();
  }

  async function disconnectInbox(){
    if(state.client&&state.inbox){try{await state.client.removeChannel(state.inbox)}catch{}}
    state.inbox=null;
  }
  async function start(){
    injectStyles();
    const id=currentId(),config=backend();
    if(!id||!config||!global.supabase?.createClient){state.connection="offline";updateConnectionUI();return false}
    if(state.identity!==id){await disconnectInbox();loadIdentity(id);renderAll()}
    if(state.inbox)return true;
    if(!state.client){
      state.client=global.supabase.createClient(config.url,config.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:12}}});
    }
    state.connection="connecting";updateConnectionUI();
    state.inbox=state.client
      .channel(topicFor(id),{config:{broadcast:{self:false,ack:true}}})
      .on("broadcast",{event:"message"},handleIncoming)
      .on("broadcast",{event:"receipt"},handleReceipt)
      .on("broadcast",{event:"server-sync"},handleServerSync)
      .on("broadcast",{event:"server-message"},handleServerMessage)
      .subscribe(function(status){
        if(status==="SUBSCRIBED"){state.connection="live";retryQueued()}
        else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")state.connection="error";
        else if(status==="CLOSED")state.connection="offline";
        else state.connection="connecting";
        updateConnectionUI();
      });
    return true;
  }

  function removeCurrent(){
    if(state.mode!=="dm")return;
    const id=state.selected;if(!id)return;
    state.contacts=state.contacts.filter(contact=>contact.id!==id);
    state.selected=state.contacts[0]?.id||"";saveContacts();saveSelected();renderAll();
  }
  function bindInputs(){
    const contactInput=document.getElementById("gmContactId");
    if(contactInput&&!contactInput.dataset.bound){
      contactInput.dataset.bound="1";
      contactInput.addEventListener("input",function(){contactInput.value=contactInput.value.replace(/\D/g,"").slice(0,3);const status=document.getElementById("gmAddStatus");if(status)status.textContent=""});
      contactInput.addEventListener("keydown",function(event){if(event.key==="Enter")submitContact();if(event.key==="Escape")toggleAddContact(false)});
    }
    const input=document.getElementById("gmMessageInput");
    if(input&&!input.dataset.bound){
      input.dataset.bound="1";
      input.addEventListener("input",function(){input.style.height="auto";input.style.height=Math.min(116,input.scrollHeight)+"px"});
      input.addEventListener("keydown",function(event){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();sendCurrent()}});
    }
  }
  function init(){
    injectStyles();state.window=document.querySelector('.window[data-app="messages"]');
    const id=currentId();if(id&&state.identity!==id)loadIdentity(id);
    bindInputs();renderAll();start();
    clearTimeout(state.tutorialTimer);
    if(localStorage.getItem(TUTORIAL_KEY)!=="1")state.tutorialTimer=setTimeout(function(){beginTutorial(0)},560);
  }
  function onWindowClose(){clearTimeout(state.tutorialTimer);finishTutorial(false);state.window=null}

  function tutorialElements(){
    return {shell:document.getElementById("genesisMessagesApp"),card:document.getElementById("gmTutorial"),svg:document.getElementById("gmTutorialLine"),path:document.querySelector("#gmTutorialLine path"),dot:document.querySelector("#gmTutorialLine circle")};
  }
  function positionTutorial(){
    const step=tutorialSteps[state.tutorialIndex],target=step?document.querySelector(step.target):null;
    const parts=tutorialElements(),shell=parts.shell,card=parts.card,svg=parts.svg,path=parts.path,dot=parts.dot;
    if(!target||!shell||!card||!svg||!path||!dot)return;
    const shellRect=shell.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
    const targetX=targetRect.left-shellRect.left+targetRect.width/2,targetY=targetRect.top-shellRect.top+targetRect.height/2;
    card.classList.toggle("place-left",targetX>shellRect.width/2);card.classList.toggle("place-top",targetY>shellRect.height/2);
    requestAnimationFrame(function(){
      const cardRect=card.getBoundingClientRect(),cardX=cardRect.left-shellRect.left+cardRect.width/2,cardY=cardRect.top-shellRect.top+cardRect.height/2;
      const startX=cardX+(targetX>cardX?cardRect.width/2-10:-cardRect.width/2+10),startY=cardY;
      const bend=Math.max(42,Math.abs(targetX-startX)*.42),c1=startX+(targetX>startX?bend:-bend),c2=targetX+(targetX>startX?-bend:bend);
      path.style.opacity="0";path.style.strokeDashoffset="1";path.setAttribute("pathLength","1");path.setAttribute("d","M "+startX+" "+startY+" C "+c1+" "+startY+", "+c2+" "+targetY+", "+targetX+" "+targetY);
      dot.setAttribute("cx",String(targetX));dot.setAttribute("cy",String(targetY));
      requestAnimationFrame(function(){path.style.opacity="1";path.style.strokeDashoffset="0";dot.style.opacity="1"});
    });
  }
  function beginTutorial(index=0){
    const parts=tutorialElements(),card=parts.card,svg=parts.svg;if(!card||!svg)return;
    document.querySelectorAll(".gm-tutorial-target").forEach(element=>element.classList.remove("gm-tutorial-target"));
    state.tutorialIndex=Math.max(0,Math.min(index,tutorialSteps.length-1));
    const step=tutorialSteps[state.tutorialIndex],target=document.querySelector(step.target);if(target)target.classList.add("gm-tutorial-target");
    document.getElementById("gmTutorialStep").textContent="Quick tour · "+(state.tutorialIndex+1)+" of "+tutorialSteps.length;
    document.getElementById("gmTutorialTitle").textContent=step.title;
    document.getElementById("gmTutorialCopy").textContent=step.copy;
    document.getElementById("gmTutorialNext").textContent=state.tutorialIndex===tutorialSteps.length-1?"Done":"Next";
    card.classList.add("show");svg.classList.add("show");clearTimeout(state.tutorialTimer);state.tutorialTimer=setTimeout(positionTutorial,80);
    if(!state.tutorialResize){state.tutorialResize=positionTutorial;global.addEventListener("resize",state.tutorialResize)}
  }
  function nextTutorial(){
    if(state.tutorialIndex>=tutorialSteps.length-1){finishTutorial(true);return}
    const parts=tutorialElements();if(parts.path){parts.path.style.strokeDashoffset="1";parts.path.style.opacity="0"}if(parts.dot)parts.dot.style.opacity="0";
    setTimeout(function(){beginTutorial(state.tutorialIndex+1)},180);
  }
  function finishTutorial(remember=true){
    const parts=tutorialElements();
    if(parts.card)parts.card.classList.remove("show");if(parts.svg)parts.svg.classList.remove("show");if(parts.path)parts.path.style.strokeDashoffset="1";if(parts.dot)parts.dot.style.opacity="0";
    document.querySelectorAll(".gm-tutorial-target").forEach(element=>element.classList.remove("gm-tutorial-target"));
    if(remember){try{localStorage.setItem(TUTORIAL_KEY,"1")}catch{}}
    state.tutorialIndex=-1;
  }
  function replayTutorial(){beginTutorial(0)}

  function injectStyles(){
    if(typeof document==="undefined"||document.getElementById("genesisMessagesStyles"))return;
    const style=document.createElement("style");style.id="genesisMessagesStyles";
    style.textContent=[
      '.window[data-app="messages"]{width:min(1120px,calc(100vw - 120px));height:min(680px,calc(100vh - 90px));animation:gmWindowOpen .52s cubic-bezier(.16,.86,.22,1.04)}',
      '@keyframes gmWindowOpen{0%{opacity:0;transform:translate(-50%,-47%) scale(.88);filter:blur(10px)}100%{opacity:1;transform:translate(-50%,-50%) scale(1);filter:blur(0)}}',
      '.window[data-app="messages"] .window-content{overflow:hidden}',
      '.gm-shell{position:relative;display:grid;grid-template-columns:72px 250px minmax(0,1fr);height:100%;min-height:0;overflow:hidden;background:#11131a;color:#f4f6fb}',
      '.gm-server-rail{display:flex;flex-direction:column;align-items:center;gap:9px;padding:12px 8px;background:linear-gradient(180deg,#0b0d12,#0e1016);border-right:1px solid rgba(255,255,255,.055);overflow:hidden}',
      '.gm-server-list{width:100%;display:flex;flex-direction:column;align-items:center;gap:9px;overflow:auto;scrollbar-width:none}.gm-server-list::-webkit-scrollbar{display:none}',
      '.gm-home-server,.gm-server-icon,.gm-create-server{position:relative;width:46px;height:46px;flex:none;border:0;border-radius:16px;background:rgba(255,255,255,.075);color:#fff;display:grid;place-items:center;cursor:pointer;font-weight:750;font-size:12px;transition:.2s cubic-bezier(.2,.8,.2,1)}',
      '.gm-home-server:hover,.gm-server-icon:hover,.gm-create-server:hover{border-radius:13px;transform:translateY(-1px);background:hsla(var(--accent),70%,55%,.35)}.gm-home-server.active,.gm-server-icon.active{border-radius:13px;background:hsl(var(--accent),68%,54%);box-shadow:0 8px 25px hsla(var(--accent),70%,40%,.25)}',
      '.gm-server-icon.active:before,.gm-home-server.active:before{content:"";position:absolute;left:-12px;width:4px;height:26px;border-radius:0 4px 4px 0;background:#fff}.gm-server-icon b{position:absolute;right:-3px;bottom:-3px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#ed4245;display:grid;place-items:center;font-size:8px;border:2px solid #0d0f15}',
      '.gm-create-server{margin-top:auto;color:#63e6a5;font-size:22px}.gm-rail-divider{width:32px;height:1px;background:rgba(255,255,255,.09)}',
      '.gm-sidebar{min-width:0;display:flex;flex-direction:column;background:#171a22;border-right:1px solid rgba(255,255,255,.055);overflow:hidden}',
      '.gm-sidebar-head{min-height:70px;padding:14px 14px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.055)}.gm-title{font-size:16px;font-weight:760;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gm-identity{display:flex;align-items:center;gap:6px;margin-top:5px;color:#9298a7;font-size:9px}',
      '.gm-live-dot,.gm-status-dot{width:7px;height:7px;border-radius:50%;background:#f0a554;box-shadow:0 0 0 3px rgba(240,165,84,.08)}.gm-live-dot.online,.gm-status-dot.online{background:#3ba55c;box-shadow:0 0 0 3px rgba(59,165,92,.12)}',
      '.gm-help{width:28px;height:28px;border-radius:9px;border:0;background:rgba(255,255,255,.06);color:#aab0bd;cursor:pointer}.gm-help:hover{background:rgba(255,255,255,.11);color:#fff}',
      '.gm-server-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:9px 10px 0}.gm-server-actions:empty{display:none}.gm-server-actions button{height:32px;border:0;border-radius:9px;background:rgba(255,255,255,.055);color:#b8bdc8;font-size:9px;cursor:pointer}.gm-server-actions button:hover{background:rgba(255,255,255,.1);color:#fff}',
      '.gm-add-contact{height:36px;margin:10px 10px 6px;border:0;border-radius:10px;background:hsla(var(--accent),65%,52%,.16);color:#e9ecf3;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-size:10px;font-weight:650}.gm-add-contact:hover{background:hsla(var(--accent),65%,52%,.26)}.gm-add-contact[hidden]{display:none}',
      '.gm-add-panel{max-height:0;opacity:0;overflow:hidden;margin:0 10px;transform:translateY(-5px);transition:.22s}.gm-add-panel.show{max-height:100px;opacity:1;transform:none;margin-bottom:7px}.gm-add-panel label{display:block;font-size:8px;color:#8f95a3;margin:0 0 5px 2px}.gm-add-row{display:grid;grid-template-columns:1fr 50px;gap:5px}.gm-add-row input{height:34px;min-width:0;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101219;color:#fff;padding:0 10px;outline:none}.gm-add-row input:focus{border-color:hsla(var(--accent),75%,65%,.45)}.gm-add-row button{border:0;border-radius:9px;background:rgba(255,255,255,.09);color:#fff;cursor:pointer}.gm-add-status{height:17px;padding-top:4px;font-size:8px;color:#9298a7}',
      '.gm-contact-list{flex:1;min-height:0;overflow:auto;padding:7px 7px 10px;scrollbar-width:thin}.gm-section-label{padding:8px 8px 5px;color:#777e8d;font-size:8px;font-weight:800;letter-spacing:.08em}',
      '.gm-contact{width:100%;min-height:51px;padding:7px 8px;border:0;border-radius:10px;background:transparent;color:#b8bdc8;display:grid;grid-template-columns:35px minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;cursor:pointer}.gm-contact:hover,.gm-contact.active{background:rgba(255,255,255,.065);color:#fff}.gm-contact.active{background:hsla(var(--accent),55%,52%,.16)}',
      '.gm-avatar{width:35px;height:35px;display:grid;place-items:center;border-radius:50%;background:linear-gradient(145deg,hsla(var(--accent),65%,58%,.55),#303543);color:#fff;font-size:10px;font-weight:750}.gm-contact-copy{min-width:0}.gm-contact-copy strong{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gm-contact-copy small{display:block;margin-top:3px;color:#7f8695;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gm-contact-meta{display:flex;flex-direction:column;align-items:flex-end;gap:5px}.gm-contact-meta time{font-size:7px;color:#6f7582}.gm-contact-meta b,.gm-channel b{min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#ed4245;color:#fff;display:grid;place-items:center;font-size:7px}',
      '.gm-channel{width:100%;height:36px;padding:0 9px;border:0;border-radius:8px;background:transparent;color:#8e95a4;display:grid;grid-template-columns:19px 1fr auto;align-items:center;text-align:left;cursor:pointer}.gm-channel span{font-size:18px;color:#69707e}.gm-channel strong{font-size:10px;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gm-channel:hover,.gm-channel.active{background:rgba(255,255,255,.055);color:#e8ebf1}.gm-channel.active{background:rgba(255,255,255,.075)}',
      '.gm-empty-contacts{height:100%;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#7f8695;padding:18px}.gm-empty-contacts>div{font-size:24px;margin-bottom:8px}.gm-empty-contacts strong{color:#bdc2cc;font-size:10px}.gm-empty-contacts span{margin-top:5px;font-size:8px;line-height:1.5}',
      '.gm-userbar{height:55px;flex:none;padding:8px 10px;display:grid;grid-template-columns:32px 1fr 8px;gap:8px;align-items:center;background:#12141b;border-top:1px solid rgba(255,255,255,.04)}.gm-user-avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:hsla(var(--accent),65%,55%,.35);font-size:9px;font-weight:800}.gm-userbar strong,.gm-userbar small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gm-userbar strong{font-size:9px}.gm-userbar small{font-size:7px;color:#7d8492;margin-top:2px}',
      '.gm-chat{min-width:0;display:grid;grid-template-rows:58px minmax(0,1fr) auto;background:radial-gradient(circle at 80% -10%,hsla(var(--accent),60%,55%,.08),transparent 34%),#1c1f28}.gm-chat-head{padding:0 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.055);box-shadow:0 1px 0 rgba(0,0,0,.18)}.gm-chat-head strong{font-size:11px}.gm-chat-head small{display:block;margin-top:3px;color:#878e9c;font-size:8px}.gm-chat-person,.gm-channel-head{display:flex;align-items:center;gap:10px}.gm-channel-head>span{font-size:23px;color:#7c8391}.gm-head-pill{padding:5px 8px;border-radius:9px;background:rgba(255,255,255,.05);color:#8e95a3;font-size:8px}.gm-remove{border:0;background:transparent;color:#7f8695;cursor:pointer}',
      '.gm-thread{min-height:0;overflow:auto;padding:18px 18px 12px;scroll-behavior:smooth;scrollbar-width:thin}.gm-chat-message{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;padding:5px 7px;margin:1px 0;border-radius:8px;animation:gmMessageIn .2s ease}.gm-chat-message:hover{background:rgba(255,255,255,.025)}@keyframes gmMessageIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.gm-message-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#303541;color:#fff;font-size:9px;font-weight:780}.gm-chat-message.own .gm-message-avatar{background:hsla(var(--accent),65%,55%,.42)}.gm-message-content{min-width:0}.gm-message-meta{display:flex;align-items:baseline;gap:7px}.gm-message-meta strong{font-size:10px}.gm-message-meta time{color:#69707d;font-size:7px}.gm-message-text{margin-top:2px;color:#d9dce3;font-size:11px;line-height:1.45;overflow-wrap:anywhere}.gm-message-media{display:block;max-width:min(420px,70vw);max-height:310px;margin-top:7px;border-radius:12px;object-fit:contain;background:#101219;border:1px solid rgba(255,255,255,.06)}',
      '.gm-channel-welcome{padding:34px 8px 10px;margin-top:auto}.gm-channel-welcome>div{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:#2d313d;font-size:28px;font-weight:760}.gm-channel-welcome h2{margin:14px 0 5px;font-size:21px;letter-spacing:-.03em}.gm-channel-welcome p{margin:0;color:#878e9c;font-size:10px}.gm-empty-thread{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#7f8695}.gm-empty-thread h3{margin:12px 0 5px;color:#d7dae1}.gm-empty-thread p{max-width:320px;font-size:9px}.gm-empty-orb{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#2b2f3a;font-size:20px}',
      '.gm-composer-wrap{padding:0 18px 18px}.gm-composer{display:grid;grid-template-columns:32px 35px minmax(0,1fr) 38px;gap:6px;align-items:end;min-height:48px;padding:6px;border-radius:13px;background:#272b35}.gm-composer textarea{width:100%;min-height:36px;max-height:116px;padding:9px 6px;border:0;outline:0;resize:none;background:transparent;color:#e7e9ee;font:inherit;font-size:11px;line-height:1.45}.gm-composer textarea::placeholder{color:#717886}.gm-composer button{border:0;color:#aeb4c0;cursor:pointer;transition:.18s}.gm-media-btn,.gm-gif-btn{width:32px;height:32px;align-self:center;border-radius:9px;background:transparent;font-size:17px}.gm-gif-btn{font-size:8px;font-weight:800}.gm-media-btn:hover,.gm-gif-btn:hover{background:rgba(255,255,255,.07);color:#fff}.gm-send-btn{width:38px;height:38px;border-radius:10px;background:hsl(var(--accent),64%,52%);display:grid;place-items:center}.gm-send-btn:disabled{opacity:.25;cursor:default}.gm-send-btn svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:1.7}',
      '.desktop-icon .app-icon{position:relative}.gm-app-badge{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ed4245;color:#fff;display:none;place-items:center;border:2px solid #121725;font:750 8px/1 Inter,sans-serif}.gm-app-badge.show{display:grid}',
      '.gm-tutorial{position:absolute;right:18px;bottom:18px;z-index:12;width:min(300px,calc(100% - 36px));padding:17px;border-radius:16px;border:1px solid rgba(255,255,255,.13);background:rgba(15,17,23,.96);box-shadow:0 24px 70px rgba(0,0,0,.48);opacity:0;transform:translateY(10px) scale(.97);pointer-events:none;transition:.25s}.gm-tutorial.show{opacity:1;transform:none;pointer-events:auto}.gm-tutorial.place-left{right:auto;left:18px}.gm-tutorial.place-top{bottom:auto;top:18px}.gm-tutorial-step{font-size:7px;letter-spacing:.13em;color:hsla(var(--accent),85%,72%,.9)}.gm-tutorial-title{margin-top:7px;font-size:13px;font-weight:720}.gm-tutorial-copy{margin-top:6px;color:#969dac;font-size:9px;line-height:1.5}.gm-tutorial-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:13px}.gm-tutorial-actions button{height:30px;padding:0 10px;border:0;border-radius:9px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:9px}.gm-tutorial-actions .primary{background:hsla(var(--accent),65%,52%,.45)}',
      '.gm-tutorial-line{position:absolute;inset:0;width:100%;height:100%;z-index:11;pointer-events:none;opacity:0}.gm-tutorial-line.show{opacity:1}.gm-tutorial-line path{fill:none;stroke:hsla(var(--accent),90%,72%,.95);stroke-width:2;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset .55s ease}.gm-tutorial-line circle{fill:hsl(var(--accent),85%,70%);opacity:0}.gm-tutorial-target{position:relative;z-index:13!important;box-shadow:0 0 0 2px hsla(var(--accent),90%,73%,.8),0 0 0 7px hsla(var(--accent),80%,55%,.1)!important}',
      '@media(max-width:850px){.window[data-app="messages"]{width:calc(100vw - 20px)}.gm-shell{grid-template-columns:62px 210px minmax(0,1fr)}}',
      '@media(max-width:620px){.gm-shell{grid-template-columns:56px 150px minmax(0,1fr)}.gm-contact{grid-template-columns:32px minmax(0,1fr)}.gm-contact-meta,.gm-contact-copy small{display:none}.gm-server-actions{grid-template-columns:1fr}.gm-chat-head{padding:0 10px}.gm-thread{padding:12px 8px}.gm-composer-wrap{padding:0 8px 8px}.gm-userbar{display:none}.gm-tutorial-line{display:none}}',
      '@media(prefers-reduced-motion:reduce){.window[data-app="messages"],.gm-chat-message{animation:none!important}.gm-tutorial{transition:none!important}}'
    ].join("");
    document.head.appendChild(style);
  }

  if(typeof global.addEventListener==="function"){
    global.addEventListener("online",function(){start();retryQueued()});
    global.addEventListener("offline",function(){state.connection="offline";updateConnectionUI()});
    global.addEventListener("storage",function(event){
      if(!state.identity)return;
      if([contactKey(),historyKey(),serversKey(),serverHistoryKey(),viewKey()].includes(event.key)){loadIdentity(state.identity);renderAll()}
    });
  }
  state.retryTimer=typeof global.setInterval==="function"?global.setInterval(retryQueued,15000):null;
  injectStyles();

  global.GenesisMessages=Object.freeze({
    sdkVersion:SDK_VERSION,html,init,start,onWindowClose,
    selectDirectMessages,selectServer,selectChannel,selectContact,
    toggleAddContact,submitContact,sendCurrent,removeCurrent,pickImage,sendGifPrompt,
    createServerPrompt,createGroupPrompt,createChannelPrompt,inviteToServerPrompt,
    replayTutorial,nextTutorial,finishTutorial,
    __test:Object.freeze({normalizeId,topicFor,escapeHTML,channelSlug,safeMediaUrl,messagePreview,normalizeServer})
  });
})(globalThis);
