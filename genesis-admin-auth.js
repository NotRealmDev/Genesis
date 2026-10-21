(function(global){
  'use strict';
  async function getSessionToken(){return global.GenesisAuth.adminToken()}
  global.GenesisAdminAuth=Object.freeze({getSessionToken});
  global.genesisAdminSession=getSessionToken;
})(window);
