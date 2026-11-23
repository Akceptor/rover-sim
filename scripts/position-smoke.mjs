import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {ProcessGroup} from '../src/process-group.js';
import {sitlArguments} from '../src/launcher.js';
const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-position-')),group=new ProcessGroup();
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.savedLocationsDir=path.join(temp,'saved-locations');config.httpPort=8100;config.udpPort=9007;config.mavlink.port=14565;
const configPath=path.join(temp,'config.json');await fs.writeFile(configPath,JSON.stringify(config));
let ws;
try{
 const url='http://127.0.0.1:8100',state=()=>fetch(url+'/api/state').then(r=>r.json());
 group.start('launcher',process.execPath,['scripts/launch.mjs','--mission-planner','--no-video','--config',configPath],{cwd:root,ipc:true});
 let before;for(let i=0;i<150;i++){try{before=await state();break;}catch{await delay(50);}}
 assert.equal(before?.startTerrain?.status,'waiting');assert.equal(before.running,false);
 // This process stands in for Mission Planner's owned SITL and --home map selection.
 const executable=process.env.ROVER_SITL??path.join(root,'.tools/ardupilot/build/sitl/bin/ardurover');
 group.start('external-sitl',executable,sitlArguments(config,{defaults:path.join(root,'config/rover.parm'),mavlinkPort:5786,home:{lat:50.3375,lon:30.475,alt:184.16}}),{cwd:temp});
 let selected;for(let i=0;i<400;i++){selected=await state();if(['ready','error'].includes(selected.startTerrain.status))break;await delay(100);}
 assert.equal(selected.startTerrain.status,'ready',JSON.stringify(selected.startTerrain));assert.equal(selected.startTerrain.cached,true);
 assert.equal(selected.home.lat,50.3375);assert.equal(selected.home.lon,30.475);assert.equal(selected.running,false);assert.ok(selected.simTime>0,'SITL sensor clock runs during terrain hold');
 assert.match(selected.environment,/Feofaniya/);assert.equal(selected.autopilot.armed,false);
 ws=new WebSocket(url.replace('http:','ws:'),{origin:url});await once(ws,'open');ws.send(JSON.stringify({type:'running',value:true}));await delay(500);
 const started=await state();assert.equal(started.running,true);assert.ok(started.wheels.every(w=>w.contact));assert.equal(started.autopilot.armed,false);
 console.log('Native selected-start: external SITL home → telemetry → exact terrain/cache → held startup → wheel contacts passed');
}finally{ws?.terminate();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
