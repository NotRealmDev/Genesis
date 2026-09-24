import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../genesis-browser-extras.js',import.meta.url),'utf8');
function fixture(){const context={URL,console,location:{pathname:'/test'},document:{readyState:'complete'},localStorage:{getItem:()=>null}};context.window=context;vm.createContext(context);vm.runInContext(source,context);return context.GenesisBrowserExtras}
test('Browser no longer rewrites Roblox addresses or installs a now.gg shortcut',()=>{
  assert.doesNotMatch(source,/now\.gg|routeRoblox|textContent='Roblox'/i);
  assert.match(source,/navigate\.call\(this,url,/);
});
test('Bookmarks reject executable schemes, deduplicate and cap saved entries',()=>{
  const api=fixture();assert.equal(api.validUrl('javascript:alert(1)'), '');assert.equal(api.validUrl('data:text/html,test'),'');
  const marks=api.cleanBookmarks([{url:'https://example.com',title:'Example'},{url:'https://example.com/'},{url:'javascript:alert(1)'}]);assert.equal(marks.length,1);assert.equal(marks[0].url,'https://example.com/');
  assert.equal(api.cleanBookmarks(Array.from({length:250},(_,i)=>({url:`https://example.com/${i}`}))).length,200);
});
test('Aurora customization is clamped and survives malformed storage',()=>{
  const api=fixture();const value=api.cleanTheme({enabled:false,hue:999,second:-20,brightness:900,speed:NaN});assert.equal(value.enabled,false);assert.equal(value.hue,360);assert.equal(value.second,0);assert.equal(value.brightness,100);assert.equal(value.speed,35);assert.equal(api.cleanTheme(null).enabled,true);
});
test('Browser typing uses the global UI sound engine without a mute button',()=>{
  assert.match(source,/GenesisUI\?\.sound\?\.\('key'\)/);assert.doesNotMatch(source,/genesisBrowserSoundsV1|genesisBrowserSound|Toggle browser sounds/);
});
test('Browser has a quick fullscreen control with a visible exit state',()=>{
  assert.match(source,/id='genesisBrowserFullscreen'/);assert.match(source,/requestFullscreen/);assert.match(source,/exitFullscreen/);assert.match(source,/active\?'Exit fullscreen':'Fullscreen browser'/);
});
test('Published C–S Games catalog contains no dandy entries',()=>{
  const catalog=readFileSync(new URL('../games-c-s.js',import.meta.url),'utf8');assert.doesNotMatch(catalog,/dandy/i);
});
