/*
 Genesis Supabase configuration.
 This uses the public/publishable Supabase key.
 NEVER place a secret/service_role key in this file.
*/
window.GENESIS_BACKEND = {
  url: "https://yubpnkcsjuxuczrafmmj.supabase.co",
  anonKey: "sb_publishable_JNxkxsQxxy5gwawUduiFbw_wHYsaQ5V"
};

/*
 Genesis VM configuration.

 Default provider:
 - Switchboard Guest: free cloud OS, no credit card required.
 - Switchboard refuses iframe embedding, so Genesis launches it as a normal
   top-level VM tab instead of placing it inside the VM iframe.

 You can replace it later with a dedicated VM provider by configuring:
 - sessionEndpoint: recommended. Genesis sends the authenticated admin token
   to this endpoint and expects JSON containing url/viewerUrl/sessionUrl.
 - viewerUrl: a fixed browser-based remote-desktop/cloud-OS URL.
 - displayMode: "embed" for providers that permit iframe embedding, or "tab"
   for providers that must run as a top-level browser page.

 Keep provider API keys and VM credentials on the server, never in this file.
*/
window.GENESIS_VM = window.GENESIS_VM || {
  provider: "Switchboard Free",
  sessionEndpoint: "",
  viewerUrl: "https://os.switchboard.computer/",
  startupUrl: "https://play.geforcenow.com/",
  sessionMode: "persistent",
  displayMode: "tab"
};

(function loadGenesisAdminVm(){
  function currentRole(){
    try{
      const login = JSON.parse(localStorage.getItem("genesisLogin") || "null");
      if(login && login.expires > Date.now()) return String(login.role || "user").toLowerCase();
    }catch{}
    return String(sessionStorage.getItem("genesisRole") || "user").toLowerCase();
  }

  function load(){
    if(!/(?:^|\/)os\.html$/i.test(location.pathname)) return;
    if(currentRole() !== "admin") return;
    if(window.GenesisVM){
      window.GenesisVM.install?.();
      return;
    }
    if(document.querySelector('script[data-genesis-vm]')) return;
    const script = document.createElement("script");
    script.src = "genesis-vm.js";
    script.defer = true;
    script.dataset.genesisVm = "1";
    document.head.appendChild(script);
  }

  if(document.readyState === "complete") load();
  else window.addEventListener("load",load,{once:true});
})();