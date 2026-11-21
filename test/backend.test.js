import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {once} from 'node:events';import dgram from 'node:dgram';
import {WebSocket} from 'ws';
async function launch(mode){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rover-test-'));const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));config.osm=false;config.httpPort=22000+Math.floor(Math.random()*10000);config.udpPort=32000+Math.floor(Math.random()*10000);config.timeoutMs=150;if(mode==='mission-planner')config.mavlink.port=42000+Math.floor(Math.random()*10000);else config.mavlink=null;await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
 const proc=spawn(process.execPath,['src/server.js',...(mode==='mission-planner'?['--mission-planner']:mode==='location-picker'?['--location-picker']:['--flat']),'--config',path.join(dir,'config.json'),...(mode==='standalone'?['--standalone']:[])],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});let logs='';proc.stdout.on('data',v=>logs+=v);proc.stderr.on('data',v=>logs+=v);
 const url=`http://127.0.0.1:${config.httpPort}`;
 const state=async()=>{const r=await fetch(url+'/api/state');return r.json();};
 for(let i=0;i<100;i++){if(proc.exitCode!==null)throw Error(logs);try{await state();break;}catch{await delay(30);}}
 const socket=async()=>{const w=new WebSocket(url.replace('http:','ws:'),{origin:url});await once(w,'open');return w;};
 return {config,url,state,socket,async close(){proc.kill();await once(proc,'exit');await fs.rm(dir,{recursive:true,force:true});}};
}
test('standalone neutral tab releases ownership; disconnect clears driving',async()=>{
 const s=await launch('standalone');let a,b;
 try{a=await s.socket();b=await s.socket();a.send(JSON.stringify({type:'keys',steering:0,throttle:0}));await delay(20);b.send(JSON.stringify({type:'keys',steering:0,throttle:1}));await delay(70);assert.equal((await s.state()).inputs.throttle,1);a.send(JSON.stringify({type:'keys',steering:0,throttle:0}));await delay(30);assert.equal((await s.state()).inputs.throttle,1);b.close();await delay(50);assert.equal((await s.state()).inputs.throttle,0);}finally{a?.terminate();b?.terminate();await s.close();}
});
test('startup dropdown loads a preset before SITL connects and keeps it locked after selection',async()=>{
 const s=await launch('location-picker'),unexpectedSITL=dgram.createSocket('udp4');let ws;
 try{
  const initial=await s.state();assert.equal(initial.startTerrain.status,'selecting');assert.equal(initial.running,false);assert.equal(initial.connected,false);
  ws=await s.socket();ws.send(JSON.stringify({type:'selectLocation',id:'invalid'}));await delay(75);assert.equal((await s.state()).startTerrain.status,'selecting');
  unexpectedSITL.bind(0,'127.0.0.1');await once(unexpectedSITL,'listening');
  const packet=Buffer.alloc(40);packet.writeUInt16LE(18458);packet.writeUInt16LE(100,2);packet.writeUInt32LE(1,4);
  const reply=once(unexpectedSITL,'message',{signal:AbortSignal.timeout(2000)});unexpectedSITL.send(packet,s.config.udpPort,'127.0.0.1');await reply;
  ws.send(JSON.stringify({type:'selectLocation',id:'kyiv'}));await delay(50);assert.equal((await s.state()).startTerrain.status,'selecting','a live SITL cannot be relocated by the picker');
  await delay(s.config.timeoutMs);
  ws.send(JSON.stringify({type:'selectLocation',id:'kyiv'}));
  let ready;for(let i=0;i<100;i++){ready=await s.state();if(ready.startTerrain.status==='ready')break;await delay(20);}
  assert.equal(ready.startTerrain.status,'ready');assert.equal(ready.selectedLocation,'kyiv');assert.equal(ready.home.lat,50.3375);assert.equal(ready.weather.timeZone,'Europe/Kyiv');assert.equal(ready.running,false);
  ws.send(JSON.stringify({type:'selectLocation',id:'lima'}));await delay(50);assert.equal((await s.state()).selectedLocation,'kyiv','selected origin cannot change while launcher may be starting SITL');
 }finally{ws?.terminate();unexpectedSITL.close();await s.close();}
});
test('Mission Planner selected start waits for disarm, loads matching terrain and keeps physics held',async()=>{
 const s=await launch('mission-planner'),udp=dgram.createSocket('udp4');let ws;
 const send=hex=>new Promise((resolve,reject)=>udp.send(Buffer.from(hex,'hex'),s.config.mavlink.port,'127.0.0.1',e=>e?reject(e):resolve()));
 try{
  assert.equal((await s.state()).startTerrain.status,'waiting');
  assert.equal((await s.state()).running,false);
  await send('fd2c0000000101a400000000000000000000000000000000000000000000c3f51cc100000000000000000000000098e4001eb01d2a1253ae');
  await send('fd0f0000000101210000e803000098e4001eb01d2a1260cf026c8f');
  await send('fe0900010100000000000a038104035d04');await delay(50);assert.equal((await s.state()).startTerrain.status,'waiting','armed telemetry cannot trigger loading');
  await send('fd0900000001010000000f0000000a030104037547');
  let state;for(let i=0;i<100;i++){state=await s.state();if(state.startTerrain.status==='ready')break;await delay(20);}
  assert.equal(state.startTerrain.status,'ready');assert.equal(state.startTerrain.cached,true);assert.equal(state.home.lat,50.3375);assert.equal(state.home.alt,184.16);assert.equal(state.running,false);assert.match(state.environment,/Feofaniya/);
  const packet=Buffer.alloc(40);packet.writeUInt16LE(18458);packet.writeUInt16LE(100,2);packet.writeUInt32LE(1,4);
  const reply=once(udp,'message',{signal:AbortSignal.timeout(2000)});udp.send(packet,s.config.udpPort,'127.0.0.1');await reply;
  ws=await s.socket();ws.send(JSON.stringify({type:'selectLocation',id:'custom'}));await delay(50);
  assert.equal((await s.state()).startTerrain.status,'restart','reloading Custom must restart the estimator rather than resetting physics under a live session');
 }finally{ws?.terminate();udp.close();await s.close();}
});
test('external preset changes reject armed or unknown telemetry and hold physics until restart',async()=>{
 const s=await launch('mission-planner'),udp=dgram.createSocket('udp4');let ws;
 const send=hex=>new Promise((resolve,reject)=>udp.send(Buffer.from(hex,'hex'),s.config.mavlink.port,'127.0.0.1',e=>e?reject(e):resolve()));
 const select=id=>ws.send(JSON.stringify({type:'selectLocation',id}));
 try{
  ws=await s.socket();select('lima');
  for(let i=0;i<100&&(await s.state()).startTerrain.status!=='ready';i++)await delay(20);
  assert.equal((await s.state()).selectedLocation,'lima');
  // The JSON stream can be alive even while heartbeat freshness is unknown.
  const packet=Buffer.alloc(40);packet.writeUInt16LE(18458);packet.writeUInt16LE(100,2);packet.writeUInt32LE(1,4);
  const reply=once(udp,'message',{signal:AbortSignal.timeout(2000)});udp.send(packet,s.config.udpPort,'127.0.0.1');await reply;
  select('lviv');await delay(40);assert.equal((await s.state()).selectedLocation,'lima');
  await send('fe0900010100000000000a038104035d04');await delay(20);select('custom');await delay(40);
  assert.equal((await s.state()).selectedLocation,'lima','armed requests are refused by the backend, not just disabled UI');
  await send('fd0900000001010000000f0000000a030104037547');await delay(20);select('lviv');
  for(let i=0;i<100&&(await s.state()).startTerrain.status!=='restart';i++)await delay(20);
  const held=await s.state();assert.equal(held.selectedLocation,'lviv');assert.equal(held.startTerrain.status,'restart');assert.equal(held.running,false);
  ws.send(JSON.stringify({type:'running',value:true}));await delay(40);assert.equal((await s.state()).running,false);
  select('custom');await delay(40);assert.equal((await s.state()).startTerrain.status,'restart');
  select('custom');await delay(40);assert.equal((await s.state()).startTerrain.status,'restart','reloading Custom must not reuse the previous SITL session');
 }finally{ws?.terminate();udp.close();await s.close();}
});
test('failed terrain can be retried through the browser without restarting the backend',async()=>{
 const s=await launch('mission-planner'),udp=dgram.createSocket('udp4');let ws;
 const send=hex=>new Promise((resolve,reject)=>udp.send(Buffer.from(hex,'hex'),s.config.mavlink.port,'127.0.0.1',e=>e?reject(e):resolve()));
 const waitFor=async status=>{let state;for(let i=0;i<100;i++){state=await s.state();if(state.startTerrain.status===status)return state;await delay(25);}assert.fail(JSON.stringify(state.startTerrain));};
 try{
  // Latitude 84 is outside the importer's coverage: deterministic failure before any network request.
  await send('fd2c0000000101a400000000000000000000000000000000000000000000c3f51cc100000000000000000000000000621132b01d2a1201a2');
  await send('fd0f0000000101210000e803000000621132b01d2a12a086014e9b');
  await send('fd0900000001010000000f0000000a030104037547');
  const failed=await waitFor('error');assert.equal(failed.running,false);
  ws=await s.socket();
  await send('fe0900010100000000000a038104035d04');
  for(let i=0;i<100&&(await s.state()).autopilot.armed!==true;i++)await delay(10);
  assert.equal((await s.state()).autopilot.armed,true);
  ws.send(JSON.stringify({type:'retryTerrain'}));await delay(75);assert.equal((await s.state()).startTerrain.status,'error','armed retry must be refused');
  await send('fd2c0000000101a400000000000000000000000000000000000000000000c3f51cc100000000000000000000000098e4001eb01d2a1253ae');
  await send('fd0f0000000101210000e803000098e4001eb01d2a1260cf026c8f');
  await send('fd0900000001010000000f0000000a030104037547');
  for(let i=0;i<100&&(await s.state()).autopilot.armed!==false;i++)await delay(10);
  assert.equal((await s.state()).startTerrain.status,'error','failure must remain visible until explicit retry');
  ws.send(JSON.stringify({type:'retryTerrain'}));
  const ready=await waitFor('ready');assert.equal(ready.home.lat,50.3375);assert.equal(ready.running,false);
 }finally{ws?.terminate();udp.close();await s.close();}
});
test('UDP cached duplicates, malformed packets, timeout and counter restart without browser',async()=>{
 const s=await launch('sitl'),udp=dgram.createSocket('udp4');udp.bind(0,'127.0.0.1');await once(udp,'listening');
 const packet=n=>{const b=Buffer.alloc(40);b.writeUInt16LE(18458);b.writeUInt16LE(100,2);b.writeUInt32LE(n,4);b.writeUInt16LE(1500,10);b.writeUInt16LE(1750,14);return b;};
 const exchange=async b=>{const reply=once(udp,'message',{signal:AbortSignal.timeout(2000)});udp.send(b,s.config.udpPort,'127.0.0.1');return (await reply)[0];};
 try{const first=await exchange(packet(1));assert.deepEqual(await exchange(packet(1)),first);for(let i=2;i<30;i++)await exchange(packet(i));const moving=await s.state();assert.ok(moving.position.x>0);udp.send(Buffer.from('bad'),s.config.udpPort,'127.0.0.1');await delay(220);const frozen=await s.state();assert.equal(frozen.connected,false);assert.equal(frozen.position.x,moving.position.x);assert.equal(frozen.stats.malformed,1);assert.ok(frozen.stats.duplicates>=1);const restarted=JSON.parse((await exchange(packet(0))).toString());assert.ok(restarted.timestamp<.02);assert.equal((await s.state()).connected,true);const ws=await s.socket();ws.send(JSON.stringify({type:'keys',steering:1,throttle:-1}));await exchange(packet(1));assert.equal((await s.state()).inputs.throttle,.5);ws.terminate();}finally{udp.close();await s.close();}
});
