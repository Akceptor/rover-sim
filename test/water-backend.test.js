import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {terrain} from './fixtures/osm.js';
import {processOsm} from '../src/osm.js';
import {SavedLocations} from '../src/saved-locations.js';

test('OSM retry preserves saved crossing threshold and backend locks out submerged controls',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'water-backend-'));let child,ws,overpass,timer,requests=0,logs='';
 const node=(id,x,z)=>({type:'node',id,lat:x/110574.2758,lon:z/111319.4908});
 const raw={elements:[node(1,3,-8),node(2,3,8),{type:'way',id:10,nodes:[1,2],tags:{waterway:'stream',width:'2',depth:'0.15'}}]};
 try{
  const t={...terrain,colors:Array(terrain.heights.length*3).fill(120)},store=new SavedLocations({directory:path.join(dir,'saved')}),saved=await store.save({name:'Saved water threshold',terrain:t,overlay:processOsm(raw,t),waterSettings:{maxCrossingDepth:.1}});
  overpass=http.createServer((req,res)=>{requests++;req.resume();res.end(JSON.stringify(raw));});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
  const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));Object.assign(config,{httpPort:22000+Math.floor(Math.random()*10000),savedLocationsDir:path.join(dir,'saved'),osm:{endpoint:`http://127.0.0.1:${overpass.address().port}`,bundledDir:null,cacheDir:path.join(dir,'cache'),water:{maxCrossingDepth:.4}}});
  const file=path.join(dir,'config.json');await fs.writeFile(file,JSON.stringify(config));
  child=spawn(process.execPath,['src/server.js','--standalone','--location-picker','--config',file],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const url=`http://127.0.0.1:${config.httpPort}`,state=()=>fetch(url+'/api/state').then(r=>r.json());
  const wait=async predicate=>{for(let i=0;i<500;i++){if(child.exitCode!==null)assert.fail(logs);try{const s=await state();if(predicate(s))return s;}catch{}await delay(20);}assert.fail('water backend timeout: '+logs);};
  await wait(s=>s.mode==='standalone');ws=new WebSocket(url.replace('http:','ws:'),{origin:url});let init;
  ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='init')init=m;});await once(ws,'open');
  ws.send(JSON.stringify({type:'selectLocation',id:saved.id}));await wait(s=>s.startTerrain.status==='ready');
  assert.equal(init.overlay.waterSettings.maxCrossingDepth,.1);
  ws.send(JSON.stringify({type:'retryOsm'}));await wait(s=>requests>0&&s.osm.status==='ready');
  assert.equal(init.overlay.waterSettings.maxCrossingDepth,.1,'retry retains saved policy');
  ws.send(JSON.stringify({type:'running',value:true}));timer=setInterval(()=>ws.send(JSON.stringify({type:'keys',throttle:1,steering:0})),100);
  await wait(s=>s.water.controlsDisabled);clearInterval(timer);timer=null;
  ws.send(JSON.stringify({type:'keys',throttle:-1,steering:1}));await delay(100);assert.equal((await state()).inputs.throttle,0);
  ws.send(JSON.stringify({type:'reset'}));await wait(s=>!s.water.controlsDisabled);assert.ok((await state()).position.y>0);
 }finally{
  clearInterval(timer);ws?.terminate();if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  if(overpass){overpass.closeAllConnections();await new Promise(r=>overpass.close(r));}await fs.rm(dir,{recursive:true,force:true});
 }
});
