import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {createGenesisWispServer} from './server.mjs';

test('Render health check and Genesis Wisp handshake work; other origins and routes are rejected',async()=>{
  const server=createGenesisWispServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await (await fetch(origin+'/health')).json()).ok,true);
    assert.equal((await fetch(origin+'/other')).status,404);
    const wsUrl=origin.replace('http:','ws:');
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket(wsUrl+'/wisp/',{origin:'https://genesisoss.lol'});
      const timer=setTimeout(()=>{ws.terminate();reject(Error('No Wisp handshake'))},3000);
      ws.once('message',data=>{assert.ok(data.length>=5);clearTimeout(timer);ws.close();resolve()});
      ws.once('error',reject);
    });
    for(const [path,headers,expected] of [['/wisp/',{origin:'https://other.example'},403],['/wisp/',{},403],['/wrong/',{origin:'https://genesisoss.lol'},404]]){
      await new Promise((resolve,reject)=>{
        const ws=new WebSocket(wsUrl+path,headers);
        ws.once('unexpected-response',(_,response)=>{assert.equal(response.statusCode,expected);response.resume();resolve()});
        ws.once('open',()=>{ws.close();reject(Error('Unexpected proxy access'))});
        ws.once('error',reject);
      });
    }
  }finally{await server.shutdown()}
});
