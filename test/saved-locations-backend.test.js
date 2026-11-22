import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import dgram from 'node:dgram';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {processOsm,overlayKey} from '../src/osm.js';
import {SavedLocations} from '../src/saved-locations.js';
const terrain={version:1,name:'Exact offline map',home:{lat:12.3456789,lon:23.4567891,alt:123.45},size:5,spacing:5,heights:Array(25).fill(0),colors:Array(75).fill(137),attribution:'Synthetic imagery'};
const overlay=processOsm({elements:[]},terrain);
overlay.buildings.push({id:'way/offline',outer:[[5,-5],[10,-5],[10,5],[5,5]],holes:[],height:6});
overlay.roads.push({id:'way/road',points:[[-8,-8],[-8,8]],width:2,paved:true});
async function until(fn){let value;for(let i=0;i<200;i++){value=await fn();if(value)return value;await delay(20);}throw Error('Timed out');}
async function fixture({imagery=true,osm=true,badDirectory=false,osmError=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'saved-backend-'));
 let requests=0;const overpass=http.createServer((req,res)=>{requests++;req.resume();if(osmError)res.statusCode=503;res.end(JSON.stringify({elements:[]}));});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));
 config.httpPort=23000+Math.floor(Math.random()*8000);config.udpPort=33000+Math.floor(Math.random()*8000);config.mavlink={...config.mavlink,port:43000+Math.floor(Math.random()*8000)};config.timeoutMs=150;config.mavlink.timeoutMs=250;
 config.savedLocationsDir=path.join(dir,'favorites');config.terrainCacheDir=path.join(dir,'terrain-cache');config.osm=osm?{bundledDir:null,cacheDir:path.join(dir,'osm-cache'),endpoint:`http://127.0.0.1:${overpass.address().port}`,timeoutMs:100}:false;
 const t=structuredClone(terrain);if(!imagery)delete t.colors;
 await fs.mkdir(config.terrainCacheDir);await fs.writeFile(path.join(config.terrainCacheDir,`${t.home.lat.toFixed(7)}_${t.home.lon.toFixed(7)}.json`),JSON.stringify(t));
 if(osm&&!osmError){await fs.mkdir(config.osm.cacheDir);await fs.writeFile(path.join(config.osm.cacheDir,createHash('sha256').update(overlayKey(t)).digest('hex')+'.json'),JSON.stringify(overlay));}
 if(badDirectory)await fs.writeFile(config.savedLocationsDir,'not a directory');
 await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));
 // Inherited by the terrain importer child too: any accidental download fails locally.
 await fs.writeFile(path.join(dir,'offline.cjs'),"const original=globalThis.fetch;globalThis.fetch=async(url,...args)=>{if(String(url).startsWith('http://127.0.0.1:'))return original(url,...args);throw Error('External network forbidden');};const fs=require('node:fs/promises');const write=fs.writeFile;fs.writeFile=async(file,...args)=>{if(String(file).includes('.tmp-')&&String(file).endsWith('manifest.json'))await new Promise(r=>setTimeout(r,120));return write(file,...args);};\n");
 const launches=[];
 async function launch({mission=true}={}){
  const proc=spawn(process.execPath,['src/server.js',...(mission?['--mission-planner']:['--standalone','--location-picker']),'--config',path.join(dir,'config.json')],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(path.join(dir,'offline.cjs')).href}`},stdio:['ignore','pipe','pipe']});let logs='';proc.stdout.on('data',v=>logs+=v);proc.stderr.on('data',v=>logs+=v);
  const url=`http://127.0.0.1:${config.httpPort}`,state=async()=>{const r=await fetch(url+'/api/state');return r.json();};
  await until(async()=>{if(proc.exitCode!==null)throw Error(logs);try{return await state();}catch{return false;}});
  const messages=[],ws=new WebSocket(url.replace('http:','ws:'),{origin:url});ws.on('message',v=>messages.push(JSON.parse(v)));await once(ws,'open');await until(()=>messages.some(m=>m.type==='init'));
  const s={state,messages,send:m=>ws.send(JSON.stringify(m)),select:()=>ws.send(JSON.stringify({type:'selectLocation',id:'map',...terrain.home})),async close(){if(proc.exitCode!==null)return;ws.terminate();proc.kill();await once(proc,'exit');}};launches.push(s);return s;
 }
 return {dir,config,launch,requests:()=>requests,store:new SavedLocations({directory:config.savedLocationsDir}),async close(){for(const s of launches)await s.close();overpass.closeAllConnections();await new Promise(r=>overpass.close(r));await fs.rm(dir,{recursive:true,force:true});}};
}
const ready=s=>until(async()=>{const v=await s.state();return v.startTerrain.status==='ready'&&v;});
const message=(s,type)=>until(()=>s.messages.find(m=>m.type===type));

test('save broadcasts list only, preserves pose, and reloads exact RGB/OSM offline after ordinary caches disappear',async()=>{
 const f=await fixture();try{
  const s=await f.launch();assert.deepEqual((await message(s,'init')).favorites,[]);s.select();const state=await ready(s);assert.equal(state.canSaveLocation,true);assert.equal(state.running,false);
  const inits=s.messages.filter(m=>m.type==='init').length;
  s.send({type:'saveLocation',name:' My map ',worldRevision:state.worldRevision});const saved=await message(s,'favorites');assert.equal(saved.favorites[0].name,'My map');assert.equal(saved.savedId,saved.favorites[0].id);
  assert.deepEqual((await s.state()).position,state.position);assert.equal(s.messages.filter(m=>m.type==='init').length,inits);
  const pkg=await f.store.read(saved.savedId);assert.deepEqual(pkg.terrain,terrain);assert.deepEqual(pkg.overlay,overlay);assert.equal(pkg.manifest.timeZone,null);
  await s.close();await fs.rm(f.config.terrainCacheDir,{recursive:true});await fs.rm(f.config.osm.cacheDir,{recursive:true});
  const restarted=await f.launch({mission:false});assert.equal((await message(restarted,'init')).favorites[0].id,saved.savedId);restarted.send({type:'selectLocation',id:saved.savedId});const loaded=await ready(restarted);
  assert.deepEqual(loaded.home,terrain.home);assert.equal(loaded.running,false);const init=restarted.messages.filter(m=>m.type==='init').at(-1);assert.deepEqual(init.terrain,terrain);assert.equal(init.overlay.buildings[0].id,'way/offline');assert.equal(init.overlay.roads[0].id,'way/road');assert.equal(f.requests(),0);
  restarted.send({type:'selectLocation',id:'kyiv'});await delay(60);assert.equal((await restarted.state()).selectedLocation,saved.savedId);
 }finally{await f.close();}
});
test('incomplete, stale, invalid name and invalid removal requests return requester errors',async()=>{
 const f=await fixture();try{const s=await f.launch();s.send({type:'saveLocation',name:'Before',worldRevision:0});assert.match((await message(s,'error')).message,/load|ready|terrain/i);s.messages.length=0;s.select();const state=await ready(s);
 for(const request of [{type:'saveLocation',name:'Old',worldRevision:state.worldRevision-1},{type:'saveLocation',name:' ',worldRevision:state.worldRevision},{type:'removeLocation',id:'../escape'}]){s.messages.length=0;s.send(request);assert.equal((await message(s,'error')).type,'error');assert.equal(s.messages.some(m=>m.type==='favorites'),false);}
 }finally{await f.close();}
});
for(const options of [{imagery:false},{osm:false},{osmError:true}])test(`save eligibility rejects incomplete offline content ${JSON.stringify(options)}`,async()=>{
 const f=await fixture(options);try{const s=await f.launch();s.select();const state=await ready(s);assert.equal(state.canSaveLocation,false);assert.ok(state.saveLocationHint);s.send({type:'saveLocation',name:'No',worldRevision:state.worldRevision});await message(s,'error');assert.deepEqual(await f.store.list(),[]);}finally{await f.close();}
});
test('storage startup failure keeps cockpit alive',async()=>{const f=await fixture({badDirectory:true});try{const s=await f.launch();assert.deepEqual((await message(s,'init')).favorites,[]);assert.equal((await s.state()).running,false);}finally{await f.close();}});
test('saved selection retains safety guards and selected descriptor after deletion and GPS restart',async()=>{
 const f=await fixture(),udp=dgram.createSocket('udp4');try{
  const saved=await f.store.save({name:'Saved held',terrain,overlay});const s=await f.launch();s.send({type:'selectLocation',id:saved.id});await ready(s);
  const packet=n=>{const b=Buffer.alloc(40);b.writeUInt16LE(18458);b.writeUInt16LE(100,2);b.writeUInt32LE(n,4);return b;};
  const exchange=async n=>{const reply=once(udp,'message',{signal:AbortSignal.timeout(2000)});udp.send(packet(n),f.config.udpPort,'127.0.0.1');return (await reply)[0];};await exchange(2);
  const heartbeat=armed=>udp.send(Buffer.from(armed?'fe0900010100000000000a038104035d04':'fd0900000001010000000f0000000a030104037547','hex'),f.config.mavlink.port,'127.0.0.1');
  s.messages.length=0;s.send({type:'selectLocation',id:saved.id});await message(s,'error');heartbeat(true);await until(async()=>(await s.state()).autopilot.armed===true);s.messages.length=0;s.send({type:'selectLocation',id:saved.id});await message(s,'error');
  heartbeat(false);await until(async()=>(await s.state()).autopilot.armed===false);await delay(270);await exchange(3);s.messages.length=0;s.send({type:'selectLocation',id:saved.id});await message(s,'error');assert.equal((await s.state()).autopilot.armed,null);heartbeat(false);await until(async()=>(await s.state()).autopilot.armed===false);s.send({type:'selectLocation',id:saved.id});await until(async()=>(await s.state()).startTerrain.status==='restart');
  const before=await s.state(),inits=s.messages.filter(m=>m.type==='init').length;s.send({type:'removeLocation',id:saved.id});const removed=await message(s,'favorites');assert.equal(removed.removedId,saved.id);assert.deepEqual(removed.favorites,[]);assert.deepEqual((await s.state()).position,before.position);assert.equal(s.messages.filter(m=>m.type==='init').length,inits);
  await delay(f.config.timeoutMs+20);const sensors=JSON.parse((await exchange(0)).toString());assert.ok(Math.abs(sensors.latitude-terrain.home.lat)<.0001);assert.equal((await s.state()).startTerrain.status,'verifying');assert.equal((await s.state()).running,false);
  // GPS path must use the retained descriptor after the package is deleted.
  function frame(id,payload,extra){const header=Buffer.from([0xfd,payload.length,0,0,0,1,1,id&255,id>>8&255,id>>16&255]);let crc=65535;for(const byte of Buffer.concat([header.subarray(1),payload,Buffer.from([extra])])){let t=byte^(crc&255);t^=t<<4&255;crc=(crc>>8^t<<8^t<<3^t>>4)&65535;}const sum=Buffer.alloc(2);sum.writeUInt16LE(crc);return Buffer.concat([header,payload,sum]);}
  const sim=Buffer.alloc(44);sim.writeInt32LE(Math.round(terrain.home.lat*1e7),36);sim.writeInt32LE(Math.round(terrain.home.lon*1e7),40);
  const global=Buffer.alloc(28);global.writeInt32LE(Math.round(terrain.home.lat*1e7),4);global.writeInt32LE(Math.round(terrain.home.lon*1e7),8);global.writeInt32LE(Math.round(terrain.home.alt*1000),12);
  heartbeat(false);udp.send(frame(164,sim,154),f.config.mavlink.port,'127.0.0.1');udp.send(frame(33,global,104),f.config.mavlink.port,'127.0.0.1');await ready(s);assert.match((await s.state()).startTerrain.message,/Saved held/);
  s.send({type:'selectLocation',id:saved.id});await until(async()=>(await s.state()).startTerrain.status==='error');assert.match((await s.state()).startTerrain.message,/location load failed/i);
 }finally{udp.close();await f.close();}
});

test('save captures the installed pair before concurrent world selection and preserves stored overlay settings',async()=>{
 const f=await fixture();try{
  const tallOverlay=processOsm({elements:[]},terrain,{defaultHeight:9});const favorite=await f.store.save({name:'Nine metres',terrain,overlay:tallOverlay,defaultHeight:9});
  const s=await f.launch();s.send({type:'selectLocation',id:favorite.id});const before=await ready(s);
  s.send({type:'saveLocation',name:'Copy',worldRevision:before.worldRevision});
  const nextTerrain={...structuredClone(terrain),name:'Different map',home:{...terrain.home,lat:13.1234567},colors:Array(75).fill(42)};const nextOverlay=processOsm({elements:[]},nextTerrain);
  await fs.writeFile(path.join(f.config.terrainCacheDir,`${nextTerrain.home.lat.toFixed(7)}_${nextTerrain.home.lon.toFixed(7)}.json`),JSON.stringify(nextTerrain));
  await fs.writeFile(path.join(f.config.osm.cacheDir,createHash('sha256').update(overlayKey(nextTerrain)).digest('hex')+'.json'),JSON.stringify(nextOverlay));
  s.send({type:'selectLocation',id:'map',...nextTerrain.home});
  const update=await message(s,'favorites');const copy=await f.store.read(update.savedId);assert.equal(copy.manifest.defaultHeight,9);assert.deepEqual(copy.overlay,tallOverlay);assert.deepEqual(copy.terrain,terrain);await ready(s);assert.equal((await s.state()).home.lat,nextTerrain.home.lat);
 }finally{await f.close();}
});

test('retry installs current OSM settings and a new save records the installed overlay height',async()=>{
 const f=await fixture();try{
  const tall=processOsm({elements:[]},terrain,{defaultHeight:9});const favorite=await f.store.save({name:'Tall',terrain,overlay:tall,defaultHeight:9});
  const s=await f.launch();s.send({type:'selectLocation',id:favorite.id});await ready(s);s.send({type:'retryOsm'});
  await until(()=>s.messages.filter(m=>m.type==='init').length===3);const state=await s.state();s.send({type:'saveLocation',name:'Retried',worldRevision:state.worldRevision});
  const result=await until(()=>s.messages.find(m=>['error','favorites'].includes(m.type)));assert.equal(result.type,'favorites',result.message);assert.equal((await f.store.read(result.savedId)).manifest.defaultHeight,6);
 }finally{await f.close();}
});
test('save/remove correlate optional request IDs including requester errors',async()=>{
 const f=await fixture();try{
  const s=await f.launch();s.send({type:'saveLocation',name:'Wait',worldRevision:0,requestId:'early'});assert.equal((await message(s,'error')).requestId,'early');s.messages.length=0;s.select();const state=await ready(s);
  s.send({type:'saveLocation',name:'Correlated',worldRevision:state.worldRevision,requestId:'save-1'});const saved=await message(s,'favorites');assert.equal(saved.requestId,'save-1');s.messages.length=0;
  s.send({type:'removeLocation',id:saved.savedId,requestId:'delete-1'});assert.equal((await message(s,'favorites')).requestId,'delete-1');s.messages.length=0;
  s.send({type:'removeLocation',id:'invalid',requestId:'bad-delete'});assert.equal((await message(s,'error')).requestId,'bad-delete');
 }finally{await f.close();}
});

test('favorite loads offline with explicitly disabled OSM and refuses saving incomplete installed world',async()=>{
 const f=await fixture({osm:false});try{const saved=await f.store.save({name:'Disabled OSM',terrain,overlay});const s=await f.launch();s.send({type:'selectLocation',id:saved.id});const state=await ready(s);assert.deepEqual(state.home,terrain.home);assert.equal(state.osm.status,'disabled');assert.equal(state.canSaveLocation,false);assert.equal(s.messages.filter(m=>m.type==='init').at(-1).overlay,null);assert.equal(f.requests(),0);}finally{await f.close();}
});
test('corrupted favorite is rejected without importer or Overpass fallback',async()=>{
 const f=await fixture();try{const saved=await f.store.save({name:'Corrupt',terrain,overlay});const s=await f.launch();await fs.writeFile(path.join(f.config.savedLocationsDir,saved.id.slice(6),'manifest.json'),'{}');s.send({type:'selectLocation',id:saved.id});await until(async()=>(await s.state()).startTerrain.status==='error');assert.match((await s.state()).startTerrain.message,/Invalid saved location manifest/);assert.equal(f.requests(),0);assert.equal((await s.state()).environment,'Test playground');}finally{await f.close();}
});
