(()=>{
  const handlers=new Map();
  window.GENESIS_BACKEND={url:'https://fixture.supabase.co',anonKey:'synthetic-public-key-for-local-tests'};
  localStorage.setItem('genesisVmHostKey','synthetic-host-key-not-a-production-credential');
  window.GenesisVM={isAdmin:()=>true};
  const channel={on(type,{event},fn){handlers.set(event,fn);return this},subscribe(fn){fn('SUBSCRIBED');return this},
    async httpSend(event,payload){parent.postMessage({type:'signal',event,payload},location.origin);return {success:true}}};
  window.supabase={createClient:()=>({channel:()=>channel,async removeChannel(){}})};
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin)return;
    const packet=event.data;
    if(packet?.type==='signal')handlers.get(packet.event)?.({payload:packet.payload});
    if(packet?.type==='connect')GenesisHostVM.connect(packet.force);
    if(packet?.type==='disconnect')GenesisHostVM.disconnect();
  });
  window.addEventListener('load',()=>parent.postMessage({type:'viewer-ready'},location.origin));
})();
