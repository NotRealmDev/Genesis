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
 Genesis GeForce NOW VM configuration.

 The Genesis VM app connects only to the self-hosted Genesis GFN VM appliance
 in /gfn-vm. The appliance runs GeForce NOW on the remote cloud machine and
 returns a short-lived authenticated viewer URL to Genesis Admin users.

 After deploying the appliance, set sessionEndpoint to its HTTPS endpoint:
   https://YOUR_VM_DOMAIN/api/session

 Until a remote host is connected, the VM app stays open inside Genesis and
 shows its setup/offline state instead of opening and immediately closing a
 blank browser tab.

 Keep server credentials and SESSION_SECRET on the VM, never in this file.
*/
window.GENESIS_VM = window.GENESIS_VM || {
  provider: "Genesis GFN VM",
  sessionEndpoint: "",
  viewerUrl: "",
  startupUrl: "https://play.geforcenow.com/",
  sessionMode: "persistent",
  displayMode: "embed"
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