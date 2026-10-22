import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../os.html',import.meta.url),'utf8');
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
