import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../genesis-ui-polish.js',import.meta.url),'utf8');
const os=readFileSync(new URL('../os.html',import.meta.url),'utf8');
const config=readFileSync(new URL('../supabase-config.js',import.meta.url),'utf8');

test('Genesis loads one global UI polish and sound layer',()=>{
  assert.match(config,/genesis-ui-polish\.js\?build=ui-polish-r1/);
  assert.match(ui,/global\.GenesisUI=\{sound,startMusic\}/);
  assert.match(ui,/createOscillator\(\)/);
  assert.match(ui,/prefers-reduced-motion:reduce/);
});

test('Music starts automatically when allowed and retries on first interaction',()=>{
  assert.match(ui,/startMusic\(\)/);
  assert.match(ui,/document\.addEventListener\('pointerdown',startOnGesture,true\)/);
  assert.match(ui,/await player\.play\(\)/);
  assert.match(os,/audio\.preload = "auto"/);
  assert.match(os,/audio\.loop = true/);
  assert.match(os,/: 0\.07;/);
});

test('Browser keeps primary actions visible and moves secondary actions into one menu',()=>{
  assert.match(os,/id="browserMore"/);
  assert.match(os,/id="browserMenu"/);
  assert.match(os,/class="browser-menu"/);
  assert.match(os,/More browser actions/);
  assert.doesNotMatch(os,/id="browserProfile"/);
  assert.doesNotMatch(os,/Open Genesis Tab|browserOpenDirect|openGenesisTab/);
});

test('Sidebar account menu animates and logout closes the OS session',()=>{
  assert.match(os,/id="genesisAccountButton"/);
  assert.match(os,/id="genesisAccountPopover"/);
  assert.match(os,/function initGenesisAccountMenu\(/);
  assert.match(os,/function genesisLogout\(/);
  assert.match(os,/localStorage\.removeItem\("genesisLogin"\)/);
  assert.match(os,/setTimeout\(\(\)=>location\.replace\("index\.html"\),240\)/);
  assert.match(os,/\.account-popover\.open\{opacity:1;transform:none;pointer-events:auto\}/);
});
