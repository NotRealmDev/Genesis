import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../os.html',import.meta.url),'utf8');
test('only the canonical Fiveplay GTA 5 survives imported catalog duplicates',()=>{
  const context=vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('function isGTAFive('),html.indexOf('const gameLibrary = [')),context);
  for(const name of ['Grand Theft Auto 5','Grand Theft Auto V','GTA 5','GTA V'])assert.equal(context.isGTAFive({name}),true);
  for(const name of ['Grand Theft Auto','Grand Theft Auto 2','Grand Theft Auto Advance'])assert.equal(context.isGTAFive({name}),false);
  const start=html.indexOf('const gameLibrary = [');
  const end=html.indexOf('\n\n\nconst GAME_REQUEST_FORM',start);
  context.gameWebSearchThumb=()=>'';
  context.catalogGame=entry=>entry;
  context.GENESIS_GAME_CATALOG={games:[{id:'duplicate',name:'GTA V'},{id:'other',name:'Grand Theft Auto 2'}]};
  context.GENESIS_GAME_CATALOG_T_Z={games:[{id:'another-duplicate',name:'Grand Theft Auto 5'}]};
  vm.runInContext(html.slice(start,end)+';globalThis.games=gameLibrary;',context);
  const gta=context.games.filter(context.isGTAFive);
  assert.equal(gta.length,1);
  assert.equal(gta[0].id,'gta5-fiveplay');
  assert.equal(gta[0].src,'https://fiveplay.lol/');
  assert.ok(context.games.some(game=>game.id==='other'));
});
test('GTA opens in Games with provider URLs intact and popup/navigation restrictions set before loading',async()=>{
  const game=vm.runInNewContext('('+html.match(/\{id:"gta5-fiveplay"[^\n]+/)[0].replace(/,$/,'')+')');
  const attributes={},listeners={};
  let loaded='',markup='';
  const frame={setAttribute:(name,value)=>attributes[name]=value,addEventListener:(name,fn)=>listeners[name]=fn,
    set src(value){
      assert.equal(attributes.sandbox,'allow-scripts allow-same-origin allow-pointer-lock allow-forms');
      assert.equal(attributes.referrerpolicy,'no-referrer');
      assert.match(attributes.allow,/cross-origin-isolated/);
      loaded=value;
    }};
  const elements={gameFrame:frame,gameLoader:{classList:{add(){}}},gameLoadText:{}};
  const win={querySelector:selector=>selector==='.window-title'?{}:{set innerHTML(value){markup=value}}};
  const context=vm.createContext({gameLibrary:[game],embeddedGameUrls:{},openWindows:{games:win},
    rememberGame(){},focusWindow(){},escapeHTML:String,console,setTimeout:fn=>fn(),
    shouldConvertGameSourceToHTML:()=>false,document:{getElementById:id=>elements[id]}});
  vm.runInContext(html.slice(html.indexOf('async function unpackEmbeddedGame('),html.indexOf('function gameWebSearchThumb(')),context);
  vm.runInContext(html.slice(html.indexOf('async function openGame('),html.indexOf('function showGamesLibrary(')),context);
  await context.openGame(game.id);
  assert.equal(loaded,'https://fiveplay.lol/');
  assert.equal(frame.title,'Grand Theft Auto V, hosted on fiveplay.lol');
  assert.doesNotMatch(attributes.sandbox,/allow-popups|allow-top-navigation/);
  assert.match(markup,/Open in new tab/);
  assert.match(markup,/Popup protection on/);
  assert.doesNotMatch(html,/<div class="desktop-icon" data-app="gta5"/);
  assert.ok(readFileSync(new URL('../'+game.thumb,import.meta.url)).length>0);
});
