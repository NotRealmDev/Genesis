import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let base=process.env.GENESIS_HOSTING_URL;
if(!base){
  let domain='';try{domain=readFileSync(new URL('../CNAME',import.meta.url),'utf8').trim()}catch(error){if(error.code!=='ENOENT')throw error}
  base=domain?`https://${domain}/`:'https://notrealmdev.github.io/Genesis/';
}
const results=[];
for(const [path,marker,type] of [
  ['',/Genesis/i,/text\/html/],
  ['os.html',/supabase-config\.js/,/text\/html/],
  ['supabase-config.js',/mode:\s*"host"/,/(?:javascript|text\/plain)/],
  ['genesis-vm.js',/GenesisVM/,/(?:javascript|text\/plain)/],
  ['genesis-host-vm.js',/GenesisHostVM/,/(?:javascript|text\/plain)/],
  ['servy.js',/Scramjet|scramjet/,/(?:javascript|text\/plain)/]
]){
  const url=new URL(path,base);url.searchParams.set('hosting-check',Date.now().toString());
  const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,`${url.pathname} returned HTTP ${response.status} at ${response.url}`);
  assert.match(response.headers.get('content-type')||'',type,`${url.pathname} has the wrong content type`);
  assert.match(await response.text(),marker,`${url.pathname} did not return the Genesis file`);
  results.push({path:url.pathname,status:response.status});
}
console.log(JSON.stringify({base,files:results},null,2));
