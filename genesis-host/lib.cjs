const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

function createHostKey(){
  return crypto.randomBytes(24).toString('base64url');
}

function validHostKey(value){
  return /^[A-Za-z0-9_-]{24,128}$/.test(String(value||'').trim());
}

function findBrowser(env=process.env,exists=fs.existsSync){
  const candidates=[
    env.GENESIS_GFN_BROWSER,
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Google','Chrome','Application','chrome.exe'),
    env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe')
  ].filter(Boolean);
  return candidates.find(candidate=>exists(candidate))||'';
}

function browserArgs(profileDir,url='https://play.geforcenow.com/'){
  return [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--autoplay-policy=no-user-gesture-required',
    '--start-fullscreen',
    '--kiosk',
    url
  ];
}

function normalizeControlMessage(value){
  if(!value||typeof value!=='object')return null;
  if(value.type==='key'){
    return {
      type:'key',event:value.event==='up'?'up':'down',
      code:String(value.code||'').slice(0,40),key:String(value.key||'').slice(0,20),repeat:!!value.repeat
    };
  }
  if(value.type==='pointer'){
    return {
      type:'pointer',event:['move','down','up','wheel'].includes(value.event)?value.event:'move',
      x:Math.max(0,Math.min(1,Number(value.x)||0)),y:Math.max(0,Math.min(1,Number(value.y)||0)),
      movementX:Math.max(-500,Math.min(500,Number(value.movementX)||0)),movementY:Math.max(-500,Math.min(500,Number(value.movementY)||0)),
      button:Math.max(0,Math.min(2,Number(value.button)||0)),deltaY:Math.max(-2400,Math.min(2400,Number(value.deltaY)||0)),locked:!!value.locked
    };
  }
  if(value.type==='gamepad-mouse')return {type:'gamepad-mouse',left:!!value.left,right:!!value.right};
  if(value.type==='release-all')return {type:'release-all'};
  if(value.type==='focus')return {type:'focus'};
  return null;
}

module.exports={createHostKey,validHostKey,findBrowser,browserArgs,normalizeControlMessage};
