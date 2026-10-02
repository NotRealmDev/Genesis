/* Bump this version when a new feature showcase should appear for everyone. */
(function(global){
  "use strict";
  const version="2026-10-gpt-install-r1";
  function key(login){return "genesisShowcaseSeen:"+encodeURIComponent(String(login?.user||"user").trim().toLowerCase());}
  function shouldShow(login){
    const name=key(login);
    try{if(localStorage.getItem(name)===version)return false;}catch{}
    try{if(sessionStorage.getItem(name)===version)return false;}catch{}
    return true;
  }
  function complete(login){
    const name=key(login);
    try{localStorage.setItem(name,version);}catch{}
    try{sessionStorage.setItem(name,version);}catch{}
  }
  function destination(login){return shouldShow(login)?"intro.html":"os.html";}
  global.GenesisIntroState=Object.freeze({version,shouldShow,complete,destination});
})(window);
