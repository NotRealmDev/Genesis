const {app,BrowserWindow,ipcMain,desktopCapturer,session,clipboard}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createHostKey,validHostKey,findBrowser,browserArgs,normalizeControlMessage}=require('./lib.cjs');

const SUPABASE_URL='https://yubpnkcsjuxuczrafmmj.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_JNxkxsQxxy5gwawUduiFbw_wHYsaQ5V';
const GENESIS_ADMIN_EMAIL='admin@genesisos.lol';
const GFN_URL='https://play.geforcenow.com/';

let mainWindow=null;
let browserProcess=null;
let inputProcess=null;
let inputScriptPath='';
let shuttingDown=false;
let lastBrowserPath='';

function configPath(){return path.join(app.getPath('userData'),'host-config.json')}
function loadHostConfig(){
  let config={};
  try{config=JSON.parse(fs.readFileSync(configPath(),'utf8'))||{}}catch{}
  if(!validHostKey(config.hostKey))config.hostKey=createHostKey();
  config.autoLaunch=config.autoLaunch!==false;
  try{fs.mkdirSync(path.dirname(configPath()),{recursive:true});fs.writeFileSync(configPath(),JSON.stringify(config,null,2))}catch{}
  return config;
}
function saveHostConfig(patch){
  const next={...loadHostConfig(),...patch};
  if(!validHostKey(next.hostKey))next.hostKey=createHostKey();
  fs.writeFileSync(configPath(),JSON.stringify(next,null,2));
  return next;
}

function sendStatus(type,message,extra={}){
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('host:status',{type,message,...extra});
}

function prepareInputHelper(){
  const source=path.join(__dirname,'input-helper.ps1');
  inputScriptPath=path.join(app.getPath('userData'),'input-helper.ps1');
  try{fs.copyFileSync(source,inputScriptPath)}catch(error){sendStatus('error','Could not prepare input bridge: '+error.message)}
}
function startInputHelper(){
  if(process.platform!=='win32')return false;
  if(inputProcess&&!inputProcess.killed)return true;
  if(!inputScriptPath)prepareInputHelper();
  try{
    inputProcess=spawn('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',inputScriptPath],{windowsHide:true,stdio:['pipe','ignore','ignore']});
    inputProcess.on('exit',()=>{inputProcess=null;if(!shuttingDown)setTimeout(startInputHelper,800)});
    return true;
  }catch(error){sendStatus('error','Input bridge failed to start: '+error.message);return false}
}
function sendInput(value){
  const message=normalizeControlMessage(value);
  if(!message)return false;
  if(!startInputHelper())return false;
  try{inputProcess.stdin.write(JSON.stringify(message)+'\n');return true}catch{return false}
}

function browserAlive(){return !!(browserProcess&&!browserProcess.killed&&browserProcess.exitCode==null)}
function launchGeForceNow(){
  if(browserAlive()){sendInput({type:'focus'});return {ok:true,alreadyRunning:true,browser:lastBrowserPath}}
  const exe=findBrowser();
  if(!exe)return {ok:false,error:'Google Chrome or Microsoft Edge was not found. Install one of them, then restart Genesis Host.'};
  lastBrowserPath=exe;
  const profileDir=path.join(app.getPath('userData'),'gfn-profile');
  fs.mkdirSync(profileDir,{recursive:true});
  try{
    browserProcess=spawn(exe,browserArgs(profileDir,GFN_URL),{windowsHide:false,detached:false,stdio:'ignore'});
    browserProcess.on('exit',(code)=>{browserProcess=null;sendStatus('gfn','GeForce NOW browser closed',{code})});
    browserProcess.on('error',(error)=>sendStatus('error','GeForce NOW browser error: '+error.message));
    setTimeout(()=>sendInput({type:'focus'}),1800);
    sendStatus('gfn','GeForce NOW launched');
    return {ok:true,alreadyRunning:false,browser:exe};
  }catch(error){return {ok:false,error:error.message}}
}

async function findGeForceSource(){
  const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
  return sources.find(source=>/geforce\s*now|nvidia\s*geforce/i.test(source.name))||null;
}

async function verifyAdminToken(token){
  const value=String(token||'').trim();
  if(value.length<30)return {ok:false,error:'Missing Genesis admin token'};
  try{
    const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${value}`},cache:'no-store'});
    if(!response.ok)return {ok:false,error:'Genesis admin authentication was rejected'};
    const user=await response.json();
    if(!user?.id)return {ok:false,error:'Genesis admin account was not found'};
    const email=String(user.email||'').trim().toLowerCase();
    if(email!==GENESIS_ADMIN_EMAIL)return {ok:false,error:'This Genesis account is not authorized for Admin VM'};
    return {ok:true,userId:user.id,email};
  }catch(error){return {ok:false,error:'Could not verify Genesis admin session: '+error.message}}
}

function createWindow(){
  mainWindow=new BrowserWindow({
    width:470,height:570,minWidth:420,minHeight:500,
    backgroundColor:'#05070c',title:'Genesis Host',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  mainWindow.loadFile(path.join(__dirname,'renderer.html'));
  mainWindow.on('closed',()=>{mainWindow=null});
}

function setupDisplayCapture(){
  session.defaultSession.setDisplayMediaRequestHandler(async(_request,callback)=>{
    try{
      const source=await findGeForceSource();
      if(!source){callback({});sendStatus('error','GeForce NOW window was not found for capture');return}
      callback({video:source,audio:'loopback'});
    }catch(error){callback({});sendStatus('error','Screen capture failed: '+error.message)}
  },{useSystemPicker:false});
}

ipcMain.handle('host:get-config',()=>{
  const config=loadHostConfig();
  return {hostKey:config.hostKey,autoLaunch:config.autoLaunch,supabaseUrl:SUPABASE_URL,supabaseAnonKey:SUPABASE_ANON_KEY,gfnUrl:GFN_URL,browserRunning:browserAlive()};
});
ipcMain.handle('host:regenerate-key',()=>{
  const config=saveHostConfig({hostKey:createHostKey()});
  return {hostKey:config.hostKey};
});
ipcMain.handle('host:set-auto-launch',(_event,value)=>saveHostConfig({autoLaunch:!!value}));
ipcMain.handle('host:copy-key',(_event,key)=>{clipboard.writeText(String(key||loadHostConfig().hostKey));return true});
ipcMain.handle('host:launch-gfn',()=>launchGeForceNow());
ipcMain.handle('host:focus-gfn',()=>sendInput({type:'focus'}));
ipcMain.handle('host:input',(_event,value)=>sendInput(value));
ipcMain.handle('host:verify-admin',(_event,token)=>verifyAdminToken(token));
ipcMain.handle('host:capture-ready',async()=>({found:!!(await findGeForceSource())}));

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus()}});
  app.whenReady().then(()=>{
    prepareInputHelper();startInputHelper();setupDisplayCapture();createWindow();
    const config=loadHostConfig();
    if(config.autoLaunch)setTimeout(()=>launchGeForceNow(),650);
  });
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
  app.on('before-quit',()=>{shuttingDown=true;try{sendInput({type:'release-all'})}catch{};try{inputProcess?.kill()}catch{};try{browserProcess?.kill()}catch{}});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
}
