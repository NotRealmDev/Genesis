import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../genesis-browser-extras.js',import.meta.url),'utf8');
function fixture(){const context={URL,console,location:{pathname:'/test'},document:{readyState:'complete'},localStorage:{getItem:()=>null}};context.window=context;vm.createContext(context);vm.runInContext(source,context);return context.GenesisBrowserExtras}
test('Roblox routes separately to the supplied now.gg player',()=>{
  const api=fixture();for(const input of ['roblox','roblox.com','https://www.roblox.com/games/123'])assert.equal(api.routeRoblox(input),'https://now.gg/apps/a/19900/b.html');
  assert.equal(api.routeRoblox('https://play.geforcenow.com/'),'https://play.geforcenow.com/');
  assert.equal(api.routeRoblox('https://roblox.com.example.com/'),'https://roblox.com.example.com/');
});
test('Bookmarks reject executable schemes, deduplicate and cap saved entries',()=>{
  const api=fixture();assert.equal(api.validUrl('javascript:alert(1)'), '');assert.equal(api.validUrl('data:text/html,test'),'');
  const marks=api.cleanBookmarks([{url:'https://example.com',title:'Example'},{url:'https://example.com/'},{url:'javascript:alert(1)'}]);assert.equal(marks.length,1);assert.equal(marks[0].url,'https://example.com/');
  assert.equal(api.cleanBookmarks(Array.from({length:250},(_,i)=>({url:`https://example.com/${i}`}))).length,200);
});
test('Aurora customization is clamped and survives malformed storage',()=>{
  const api=fixture();const value=api.cleanTheme({enabled:false,hue:999,second:-20,brightness:900,speed:NaN});assert.equal(value.enabled,false);assert.equal(value.hue,360);assert.equal(value.second,0);assert.equal(value.brightness,100);assert.equal(value.speed,35);assert.equal(api.cleanTheme(null).enabled,true);
});
test('Published C–S Games catalog contains no dandy entries',()=>{
  const catalog=readFileSync(new URL('../games-c-s.js',import.meta.url),'utf8');assert.doesNotMatch(catalog,/dandy/i);
});
