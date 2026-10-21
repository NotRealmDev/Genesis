import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../genesis-messages.js',import.meta.url),'utf8');
const user='10000000-0000-4000-8000-000000000001';
const fileId='20000000-0000-4000-8000-000000000002';
function setup(){
  const calls=[];
  const context={URL,AbortSignal,Uint8Array,crypto:{randomUUID:()=>fileId},
    localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},
    GENESIS_BACKEND:{url:'https://test.supabase.co',anonKey:'test-publishable-key-long-enough'},
    GenesisAuth:{token:async()=> 'verified-token',verify:async()=>({id:user})},
    fetch:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,json:async()=>({signedURL:'/object/sign/genesis-message-gifs/'+user+'/'+fileId+'.gif?token=fixture'})};
    }
  };
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(source.replace('  global.GenesisMessages=Object.freeze({','  global.gifTest={uploadGif,receivedMedia};\n  global.GenesisMessages=Object.freeze({'),context);
  return {context,calls};
}
function gif(size){return new File(['GIF89a',new Uint8Array(size-6)],'animation.gif',{type:'image/gif'})}
test('a full 2 MiB GIF uploads unchanged and becomes a small refreshable attachment',async()=>{
  const {context,calls}=setup();const file=gif(2*1024*1024);
  const media=await context.gifTest.uploadGif(file);
  assert.equal(calls.length,2);assert.equal(calls[0].options.body,file);
  assert.equal(calls[0].options.headers.Authorization,'Bearer verified-token');
  assert.equal(calls[0].options.headers['Content-Type'],'image/gif');
  assert.equal(media.type,'gif');assert.equal(media.storagePath,user+'/'+fileId+'.gif');
  assert.match(media.url,/^https:\/\/test.supabase.co\/storage\/v1\/object\/sign\//);
  assert.ok(JSON.stringify(media).length<1000);
  assert.equal(context.gifTest.receivedMedia(media).storagePath,media.storagePath);
});
test('GIFs above 2 MiB and files without a GIF signature are rejected before upload',async()=>{
  const {context,calls}=setup();
  await assert.rejects(context.gifTest.uploadGif(gif(2*1024*1024+1)),/2 MB/);
  await assert.rejects(context.gifTest.uploadGif(new File(['notgif'],'fake.gif',{type:'image/gif'})),/valid GIF/);
  assert.equal(calls.length,0);
});
test('receiver rejects fabricated storage paths while preserving existing GIF links',()=>{
  const {context}=setup();
  const media=context.gifTest.receivedMedia({type:'gif',url:'https://example.test/a.gif',storagePath:'../private/file.gif'});
  assert.equal(media.url,'https://example.test/a.gif');assert.equal(media.storagePath,undefined);
});
