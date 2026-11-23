import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import dgram from 'node:dgram';
import {osm,terrain} from './fixtures/osm.js';
async function until(fn){for(let i=0;i<250;i++){const v=await fn();if(v)return v;await delay(20);}throw Error('Timed out');}
async function launch({picker=false,missionPlanner=false,osmEnabled=true}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-world-'));let respond,requests=0;
 const overpass=http.createServer((req,res)=>{requests++;respond=res;req.resume();});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));config.savedLocationsDir=path.join(dir,'saved-locations');config.httpPort=23000+Math.floor(Math.random()*5000);config.mavlink=missionPlanner?{...config.mavlink,port:43000+Math.floor(Math.random()*5000)}:null;
 config.terrain=path.join(dir,'terrain.json');config.osm={bundledDir:null,endpoint:`http://127.0.0.1:${overpass.address().port}`,cacheDir:path.join(dir,'osm-cache'),timeoutMs:1000};
 if(!osmEnabled)config.osm=false;
 await fs.writeFile(config.terrain,JSON.stringify(terrain));await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
 const proc=spawn(process.execPath,['src/server.js',...(missionPlanner?['--mission-planner']:['--standalone']),...(picker?['--location-picker']:[]),'--config',path.join(dir,'config.json')],{stdio:['ignore','pipe','pipe']});let logs='';proc.stdout.on('data',v=>logs+=v);proc.stderr.on('data',v=>logs+=v);
 const url=`http://127.0.0.1:${config.httpPort}`,state=async()=>{const r=await fetch(url+'/api/state');return r.json();};
 await until(async()=>{if(proc.exitCode!==null)throw Error(logs);try{return await state();}catch{return false;}});
 const ws=new WebSocket(url.replace('http:','ws:'),{origin:url});const inits=[],messages=[];ws.on('message',v=>{const m=JSON.parse(v);messages.push(m);if(m.type==='init')inits.push(m);});await once(ws,'open');
 return {state,config,dir,inits,messages,send:m=>ws.send(JSON.stringify(m)),requests:()=>requests,reply:(status=200,data=osm)=>{respond.writeHead(status,{'Content-Type':'application/json'});respond.end(JSON.stringify(data));},async close(){ws.terminate();proc.kill();await once(proc,'exit');overpass.closeAllConnections();await new Promise(r=>overpass.close(r));await fs.rm(dir,{recursive:true,force:true});}};
}
test('OSM settings reject busy and invalid updates; save and retry persists new endpoint without changing the world',async()=>{
 const s=await launch();let replacement,received=0;
 try{
  const beforeFile=await fs.readFile(path.join(s.dir,'config.json'),'utf8');
  await until(()=>s.requests()===1);
  const settings={server:'custom',endpoint:s.config.osm.endpoint,timeoutMs:2000};
  s.send({type:'saveOsmSettings',settings,requestId:'busy'});
  const busy=await until(()=>s.messages.find(m=>m.type==='osmSettingsResult'&&m.requestId==='busy'));assert.equal(busy.ok,false);assert.match(busy.message,/loading/i);
  s.reply(504);await until(async()=>(await s.state()).osm.status==='error');const before=await s.state();
  s.send({type:'saveOsmSettings',settings:{...settings,endpoint:'file:///tmp/no'},requestId:'bad'});
  assert.equal((await until(()=>s.messages.find(m=>m.requestId==='bad'&&m.type==='osmSettingsResult'))).ok,false);
  replacement=http.createServer((req,res)=>{received++;req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(osm));});replacement.listen(0,'127.0.0.1');await once(replacement,'listening');
  settings.endpoint=`http://127.0.0.1:${replacement.address().port}/interpreter`;
  s.send({type:'saveOsmSettings',settings,retry:true,requestId:'saved'});
  const saved=await until(()=>s.messages.find(m=>m.type==='osmSettingsResult'&&m.requestId==='saved'));assert.equal(saved.ok,true);
  await until(async()=>(await s.state()).osm.status==='deferred');assert.equal(received,1);assert.equal(s.requests(),1);
  const after=await s.state();assert.equal(after.worldRevision,before.worldRevision);assert.deepEqual(after.osmSettings.settings,settings);assert.equal(after.osmSettings.resolved.endpoint,settings.endpoint);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(s.dir,'config.json.osm-settings.local.json'),'utf8')),settings);
  assert.equal(await fs.readFile(path.join(s.dir,'config.json'),'utf8'),beforeFile);
 }finally{if(replacement){replacement.closeAllConnections();await new Promise(r=>replacement.close(r));}await s.close();}
});
test('a failed OSM settings write is reported and does not change the active settings or retry',async()=>{
 const s=await launch();try{
  await until(()=>s.requests()===1);s.reply(504);await until(async()=>(await s.state()).osm.status==='error');
  const before=(await s.state()).osmSettings.settings;await fs.mkdir(path.join(s.dir,'config.json.osm-settings.local.json'));
  s.send({type:'saveOsmSettings',settings:{server:'global',endpoint:'',timeoutMs:45000},retry:true,requestId:'failed'});
  const result=await until(()=>s.messages.find(m=>m.type==='osmSettingsResult'&&m.requestId==='failed'));assert.equal(result.ok,false);
  assert.deepEqual((await s.state()).osmSettings.settings,before);assert.equal(s.requests(),1);
 }finally{await s.close();}
});
test('OSM settings cannot enable downloads when the backend explicitly disables OSM',async()=>{
 const s=await launch({osmEnabled:false});try{
  s.send({type:'saveOsmSettings',settings:{server:'auto',endpoint:'',timeoutMs:30000},retry:true,requestId:'disabled'});
  const result=await until(()=>s.messages.find(m=>m.type==='osmSettingsResult'&&m.requestId==='disabled'));assert.equal(result.ok,false);assert.match(result.message,/disabled/i);assert.equal(s.requests(),0);
 }finally{await s.close();}
});
test('startup waits for OSM with physics held; browser gets geometry that actually blocks rover',async()=>{
 const s=await launch();try{
 assert.equal((await s.state()).running,false);assert.equal((await s.state()).osm.status,'loading');await until(()=>s.requests()===1);s.reply();
 await until(async()=>(await s.state()).osm.status==='ready');assert.equal((await s.state()).running,true);
 await until(()=>s.inits.some(i=>i.overlay?.buildings.length===2));
 assert.equal(s.inits.at(-1).overlay.buildings[0].id,'relation/20');
 for(let i=0;i<45;i++){s.send({type:'keys',throttle:1,steering:0});await delay(200);}
 const state=await s.state();assert.ok(state.position.x>4&&state.position.x<4.9,JSON.stringify(state.position));
 }finally{await s.close();}
});
test('failed OSM leaves terrain usable; retry after physics starts caches but defers colliders even if paused',async()=>{
 const s=await launch();try{
 await until(()=>s.requests()===1);s.reply(429);await until(async()=>(await s.state()).osm.status==='error');assert.equal((await s.state()).running,true);
 s.send({type:'running',value:false});s.send({type:'retryOsm'});await until(()=>s.requests()===2);s.reply();
 await until(async()=>(await s.state()).osm.status==='deferred');assert.equal(s.inits.some(i=>i.overlay?.buildings.length),false);
 assert.equal((await fs.readdir(s.config.osm.cacheDir)).length,1);
 }finally{await s.close();}
});
test('retry before first Start physics installs overlay while held and allows starting afterward',async()=>{
 const s=await launch({picker:true});try{
 s.send({type:'selectLocation',id:'kyiv'});await until(()=>s.requests()===1);s.reply(504);
 await until(async()=>(await s.state()).startTerrain.status==='ready');assert.equal((await s.state()).running,false);
 s.send({type:'retryOsm'});await until(()=>s.requests()===2);s.send({type:'running',value:true});await delay(50);assert.equal((await s.state()).running,false);
 s.reply(200,{elements:[]});await until(async()=>(await s.state()).osm.status==='empty');assert.equal((await s.state()).running,false);
 s.send({type:'running',value:true});await until(async()=>(await s.state()).running);
 }finally{await s.close();}
});
test('Custom Mission Planner uses the selected terrain origin and rejects arming during delayed OSM loading',async()=>{
 const s=await launch({missionPlanner:true}),udp=dgram.createSocket('udp4');let armed=false;
 const heartbeat=()=>udp.send(Buffer.from(armed?'fe0900010100000000000a038104035d04':'fd0900000001010000000f0000000a030104037547','hex'),s.config.mavlink.port,'127.0.0.1');
 const telemetry=()=>{
  udp.send(Buffer.from('fd2c0000000101a400000000000000000000000000000000000000000000c3f51cc100000000000000000000000098e4001eb01d2a1253ae','hex'),s.config.mavlink.port,'127.0.0.1');
  udp.send(Buffer.from('fd0f0000000101210000e803000098e4001eb01d2a1260cf026c8f','hex'),s.config.mavlink.port,'127.0.0.1');heartbeat();
 };
 const timer=setInterval(telemetry,100);telemetry();
 try{
  await until(()=>s.requests()===1);assert.equal((await s.state()).running,false);
  armed=true;heartbeat();await until(async()=>(await s.state()).autopilot.armed===true);s.reply(200,{elements:[]});
  await until(async()=>(await s.state()).startTerrain.status==='error');assert.equal((await s.state()).environment,'Test playground');
  armed=false;telemetry();await until(async()=>(await s.state()).autopilot.armed===false);s.send({type:'retryTerrain'});
  // The rejected installation still cached the valid empty response; retry must reuse it offline.
  const ready=await until(async()=>{const state=await s.state();return state.startTerrain.status==='ready'&&state;});
  assert.equal(ready.home.lat,50.3375);assert.equal(ready.home.lon,30.475);assert.equal(ready.running,false);assert.equal(ready.osm.status,'empty');assert.equal(ready.osm.cached,true);assert.equal(s.requests(),1);
 }finally{clearInterval(timer);udp.close();await s.close();}
});
