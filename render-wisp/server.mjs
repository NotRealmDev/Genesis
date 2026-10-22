import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {server as wisp,logging} from '@mercuryworkshop/wisp-js/server';

// Keep the proxy focused on public websites rather than internal networks.
wisp.options.allow_private_ips=false;
wisp.options.allow_loopback_ips=false;
wisp.options.allow_direct_ip=false;
wisp.options.allow_udp_streams=false;
wisp.options.port_whitelist=[80,443];
wisp.options.stream_limit_total=128;
wisp.options.stream_limit_per_host=32;
wisp.options.dns_result_order='ipv4first';
logging.set_level(logging.WARN);

export function createGenesisWispServer({allowedOrigins=process.env.ALLOWED_ORIGINS||'https://genesisoss.lol'}={}){
  const origins=new Set(allowedOrigins.split(',').map(value=>new URL(value.trim()).origin));
  const server=http.createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if((req.method==='GET'||req.method==='HEAD')&&(path==='/'||path==='/health')){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?'':JSON.stringify({ok:true,service:'Genesis Wisp',websocketPath:'/wisp/'}));
    }else{res.writeHead(404);res.end('Not found')}
  });
  const sockets=new Set();
  server.on('upgrade',(req,socket,head)=>{
    socket.on('error',()=>{});
    const reject=status=>socket.end('HTTP/1.1 '+status+'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    if(new URL(req.url,'http://localhost').pathname!=='/wisp/')return reject('404 Not Found');
    if(!origins.has(req.headers.origin))return reject('403 Forbidden');
    if(sockets.size>=256)return reject('503 Service Unavailable');
    sockets.add(socket);socket.once('close',()=>sockets.delete(socket));
    wisp.routeRequest(req,socket,head);
  });
  server.shutdown=()=>{for(const socket of sockets)socket.destroy();return new Promise(resolve=>server.close(resolve))};
  return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||10000);
  const server=createGenesisWispServer();
  server.listen(port,'0.0.0.0',()=>console.log('Genesis Wisp listening on port '+port));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void server.shutdown()});
}
