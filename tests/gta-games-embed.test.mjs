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
test('GTA stays in Games and navigates its own iframe through the proxy',async()=>{
  const game=vm.runInNewContext('('+html.match(/\{id:"gta5-fiveplay"[^\n]+/)[0].replace(/,$/,'')+')');
  const opened=[],navigations=[],attributes={};
  let markup='';
  const frame={setAttribute:(key,value)=>attributes[key]=value,addEventListener(){},set src(value){throw Error('Unexpected direct navigation: '+value)}};
  const win={querySelector:selector=>selector==='.window-title'?{}:{set innerHTML(value){markup=value}}};
  const elements={gameFrame:frame,gameLoader:{classList:{add(){}}},gameLoadText:{}};
  const openWindows={};
  const context=vm.createContext({gameLibrary:[game],openWindows,escapeHTML:String,console,
    rememberGame(){},stopGameAdRemoval(){},openApp:name=>{opened.push(name);openWindows[name]=win},
    focusWindow:target=>assert.equal(target,win),document:{getElementById:id=>elements[id]},
    unpackEmbeddedGame:async()=>game.src,
    ensureGenesisPrismRuntime:async()=>({protectGameFrame:element=>assert.equal(element,frame),createFrame:async element=>{
      assert.equal(element,frame);
      assert.equal(attributes.sandbox,'allow-scripts allow-same-origin allow-pointer-lock allow-forms');
      assert.equal(attributes.referrerpolicy,'no-referrer');
      return {go:url=>navigations.push(url)};
    }})});
  vm.runInContext(html.slice(html.indexOf('async function openGame('),html.indexOf('function showGamesLibrary(')),context);
  await context.openGame(game.id);
  await context.openGame(game.id);
  assert.deepEqual(opened,['games']);
  assert.deepEqual(navigations,['https://fiveplay.lol/','https://fiveplay.lol/']);
  assert.match(markup,/id="gameFrame"/);
  assert.match(markup,/HTTPS through proxy · Ad removal on/);
  assert.equal(openWindows.browser,undefined);
  assert.doesNotMatch(html,/<div class="desktop-icon" data-app="gta5"/);
  assert.ok(readFileSync(new URL('../'+game.thumb,import.meta.url)).length>0);
});
