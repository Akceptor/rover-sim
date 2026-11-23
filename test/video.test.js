import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {VideoRelay} from '../src/video.js';
const jpeg=Buffer.from([0xff,0xd8,1,2,3,0xff,0xd9]);
async function fixture(){
 const relay=new VideoRelay({staleMs:150});
 const server=http.createServer((req,res)=>{if(!relay.handleHttp(req,res)){res.writeHead(404);res.end();}});
 server.on('upgrade',(req,socket,head)=>relay.handleUpgrade(req,socket,head));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`;
 const source=async(origin=url)=>{const ws=new WebSocket(url.replace('http:','ws:')+'/video-source',{origin});await once(ws,'open');return ws;};
 return {relay,url,source,async close(){relay.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
test('MJPEG relay publishes framed JPEG, rejects a second source, and ends on disconnect',async()=>{
 const f=await fixture();let ws,second,reader;
 try{
  assert.equal((await fetch(f.url+'/camera.mjpg')).status,503);
  ws=await f.source();ws.send(jpeg);await delay(30);
  const response=await fetch(f.url+'/camera.mjpg');assert.match(response.headers.get('content-type'),/multipart\/x-mixed-replace; boundary=rover-frame/);
  reader=response.body.getReader();const {value}=await reader.read();const part=Buffer.from(value);
  assert.match(part.toString(),/Content-Type: image\/jpeg\r\nContent-Length: 7\r\n/);assert.ok(part.includes(jpeg));
  second=await f.source();const [code]=await once(second,'close');assert.equal(code,1008);
  ws.close();await once(ws,'close');await delay(20);assert.equal(f.relay.status().state,'idle');
  assert.equal((await reader.read()).done,true);
 }finally{await reader?.cancel();ws?.terminate();second?.terminate();await f.close();}
});
test('MJPEG relay expires a stalled source and ignores invalid frames',async()=>{
 const f=await fixture();let ws;
 try{ws=await f.source();ws.send(Buffer.from('not a jpeg'));await delay(20);assert.equal(f.relay.status().frames,0);
  ws.send(jpeg);await delay(20);assert.equal(f.relay.status().state,'streaming');
  await delay(300);assert.equal(f.relay.status().state,'waiting');assert.equal((await fetch(f.url+'/camera.mjpg')).status,503);
 }finally{ws?.terminate();await f.close();}
});
test('video source requires the same origin',async()=>{
 const f=await fixture();try{
  const ws=new WebSocket(f.url.replace('http:','ws:')+'/video-source',{origin:'http://unrelated.invalid'});
  const [error]=await once(ws,'error');assert.match(error.message,/403/);
 }finally{await f.close();}
});
test('MJPEG relay advertises and accepts 25 fps',async()=>{
 const f=await fixture();let ws;
 try{ws=new WebSocket(f.url.replace('http:','ws:')+'/video-source',{origin:f.url});const [ready]=await once(ws,'message');assert.equal(JSON.parse(ready).fps,25);
  for(let i=0;i<5;i++){ws.send(jpeg);await delay(45);}
  assert.equal(f.relay.status().frames,5);
 }finally{ws?.terminate();await f.close();}
});
