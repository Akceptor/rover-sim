import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import dgram from 'node:dgram';
import {once} from 'node:events';import {WebSocket} from 'ws';
async function launch(mode='standalone'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vehicle-backend-'));const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));Object.assign(config,{osm:false,httpPort:22000+Math.floor(Math.random()*10000),udpPort:32000+Math.floor(Math.random()*10000),savedLocationsDir:path.join(dir,'saved'),mavlink:mode==='standalone'?null:{host:'127.0.0.1',port:42000+Math.floor(Math.random()*10000),systemId:1,timeoutMs:3000},timeoutMs:150});
 const file=path.join(dir,'config.json');await fs.writeFile(file,JSON.stringify(config));const p=spawn(process.execPath,['src/server.js',...(mode==='standalone'?['--standalone']:[]),'--flat','--config',file],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});let logs='';p.stderr.on('data',b=>logs+=b);
 const url=`http://127.0.0.1:${config.httpPort}`,state=async()=>{const r=await fetch(url+'/api/state');return r.json()};
 for(let i=0;i<100;i++){if(p.exitCode!==null)throw Error(logs);try{await state();break}catch{await delay(30)}}
 const ws=new WebSocket(url.replace('http:','ws:'),{origin:url});await once(ws,'open');
 return {config,ws,state,async close(){ws.terminate();p.kill();await once(p,'exit');await fs.rm(dir,{recursive:true,force:true})}};
}
test('standalone vehicle replacement publishes matching revision and leaves map/weather intact',async()=>{
 const s=await launch();try{
  const initial=await s.state();assert.equal(initial.selectedVehicle,'mn168');assert.equal(initial.vehicleStatus.status,'ready');
  s.ws.send(JSON.stringify({type:'keys',throttle:1,steering:0}));await delay(30);
  s.ws.send(JSON.stringify({type:'selectVehicle',id:'tracked-crawler'}));let next;
  for(let i=0;i<100;i++){next=await s.state();if(next.selectedVehicle==='tracked-crawler'&&next.vehicleStatus.status==='ready')break;await delay(20)}
  assert.equal(next.selectedVehicle,'tracked-crawler');assert.equal(next.vehicleRevision,initial.vehicleRevision+1);assert.deepEqual(next.home,initial.home);assert.equal(next.weather.latitude,initial.weather.latitude);assert.equal(next.running,false);assert.equal(next.inputs.throttle,0);
  s.ws.send(JSON.stringify({type:'running',value:true}));await delay(30);assert.equal((await s.state()).running,true);
 }finally{await s.close()}
});

test('SITL rejects unknown/armed selection, stages disarmed selection, holds until reboot and actual mapping validation',async()=>{
 const s=await launch('sitl'),udp=dgram.createSocket('udp4');udp.bind(0,'127.0.0.1');await once(udp,'listening');
 const packet=count=>{const b=Buffer.alloc(40);b.writeUInt16LE(18458);b.writeUInt16LE(100,2);b.writeUInt32LE(count,4);for(let i=0;i<16;i++)b.writeUInt16LE(1500,8+i*2);return b};
 const exchange=async count=>{const response=once(udp,'message',{signal:AbortSignal.timeout(2000)});udp.send(packet(count),s.config.udpPort,'127.0.0.1');await response};
 const select=()=>s.ws.send(JSON.stringify({type:'selectVehicle',id:'tracked-crawler'}));
 const sendTelemetry=hex=>udp.send(Buffer.from(hex,'hex'),s.config.mavlink.port,'127.0.0.1');
 try{
  await exchange(10);select();await delay(30);assert.equal((await s.state()).vehicleStatus.status,'ready');
  sendTelemetry('fe0900010100000000000a038104035d04');await delay(20);select();await delay(30);assert.equal((await s.state()).vehicleStatus.status,'ready');
  sendTelemetry('fd0900000001010000000f0000000a030104037547');await delay(20);select();
  for(let i=0;i<100&&(await s.state()).vehicleStatus.status!=='restart';i++)await delay(10);
  const pending=await s.state();assert.equal(pending.selectedVehicle,'mn168');assert.equal(pending.vehicleStatus.pendingId,'tracked-crawler');
  s.ws.send(JSON.stringify({type:'running',value:true}));s.ws.send(JSON.stringify({type:'reset'}));await exchange(11);assert.equal((await s.state()).selectedVehicle,'mn168');assert.equal((await s.state()).running,false);
  await delay(200);await exchange(0);const fresh=await s.state();assert.equal(fresh.selectedVehicle,'tracked-crawler');assert.equal(fresh.vehicleStatus.status,'loading');assert.equal(fresh.vehicleRevision,1);
  s.ws.send(JSON.stringify({type:'running',value:true}));await delay(20);assert.equal((await s.state()).running,false);
  // The simulated MAVLink return endpoint now sends a conflicting saved function.
  const b=Buffer.alloc(33);b.set([254,25,0,1,1,22]);b.writeFloatLE(26,6);b.writeUInt16LE(1,10);b.write('SERVO2_FUNCTION',14);b[30]=9;
  let crc=65535;for(const byte of [...b.subarray(1,31),220]){let x=byte^(crc&255);x^=(x<<4)&255;crc=((crc>>8)^(x<<8)^(x<<3)^(x>>4))&65535;}b.writeUInt16LE(crc,31);udp.send(b,s.config.mavlink.port,'127.0.0.1');await delay(20);
  const conflict=await s.state();assert.equal(conflict.vehicleStatus.status,'error');assert.match(conflict.vehicleStatus.message,/SERVO2_FUNCTION=26.*requires 73/);assert.equal(conflict.running,false);
 }finally{udp.close();await s.close()}
});
