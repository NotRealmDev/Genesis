(()=>{
  const handlers=new Map();
  const origin=parent.location.origin;
  const sourceDescriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'srcObject');
  window.__fixtureSourceAssignments=0;
  Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{
    ...sourceDescriptor,set(value){
      if(this.id==='genesisVmStream'&&value)window.__fixtureSourceAssignments++;
      sourceDescriptor.set.call(this,value);
    }
  });
  window.GENESIS_BACKEND={url:'https://fixture.supabase.co',anonKey:'synthetic-public-key-for-local-tests'};
  localStorage.setItem('genesisVmHostKey','synthetic-host-key-not-a-production-credential');
  window.GenesisVM={isAdmin:()=>true};
  const channel={on(type,{event},fn){handlers.set(event,fn);return this},subscribe(fn){fn('SUBSCRIBED');return this},
    async httpSend(event,payload){parent.postMessage({type:'signal',event,payload},origin);return {success:true}}};
  window.supabase={createClient:()=>({channel:()=>channel,async removeChannel(){}})};
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==origin)return;
    const packet=event.data;
    if(packet?.type==='signal')handlers.get(packet.event)?.({payload:packet.payload});
    if(packet?.type==='connect')GenesisHostVM.connect(packet.force);
    if(packet?.type==='disconnect')GenesisHostVM.disconnect();
  });
  window.addEventListener('load',()=>parent.postMessage({type:'viewer-ready'},origin));
})();
