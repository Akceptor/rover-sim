#!/usr/bin/env node
// Real services, isolated ports and disposable EEPROM; never uses launcher.local.json.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import net from 'node:net';
import {checkPorts} from '../src/launcher.js';
import {loadEnvironment} from '../src/environment.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{sitl:{type:'string'},'no-video':{type:'boolean'}}});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rover-launcher-smoke-'));
const config=JSON.parse(await fs.readFile(path.join(root,'config/default.json'),'utf8'));config.savedLocationsDir=path.join(dir,'saved-locations');config.osm=false;
Object.assign(config,{httpPort:8095,udpPort:9005});config.mavlink.port=14563;
const ports=[{kind:'tcp',host:'127.0.0.1',port:8095,name:'HTTP'},{kind:'udp',host:'127.0.0.1',port:9005,name:'Physics'},{kind:'udp',host:'127.0.0.1',port:14563,name:'HUD'},{kind:'tcp',host:'0.0.0.0',port:5774,name:'MP'},{kind:'tcp',host:'0.0.0.0',port:5776,name:'Companion'}];
let child,output='',closed;
function start(args){
 output='';child=spawn(process.execPath,[path.join(root,'scripts/launch.mjs'),...args],{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
 closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;});
 return child;
}
async function waitFor(fn,timeout=60000){
 const end=Date.now()+timeout;
 while(Date.now()<end){if(await fn())return;if(child.exitCode!==null||child.signalCode)throw Error(output);await delay(100);}
 throw Error(`Launcher timeout:\n${output}`);
}
async function exitWithin(){return Promise.race([closed,delay(16000,undefined,{ref:false}).then(()=>{throw Error(`Shutdown timeout:\n${output}`);})]);}
try{
 await checkPorts(ports);
 await fs.writeFile(path.join(dir,'backend.json'),JSON.stringify(config));
 const settings={sitlExe:path.resolve(values.sitl??path.join(root,'.tools/ardupilot/build/sitl/bin/ardurover')),backendConfig:'./backend.json'};
 const launcherFile=path.join(dir,'launcher.json');
 await fs.writeFile(launcherFile,JSON.stringify(settings));
 const args=['--launcher-config',launcherFile,'--run-dir',path.join(dir,'sitl'),'--mavlink-port','5774',...(values['no-video']?['--no-video']:[])];
 for(const method of ['IPC','SIGINT']){
  if(method==='SIGINT'&&process.platform==='win32')continue;
  start(args);await waitFor(()=>output.includes('[launcher] READY'));
  const state=await fetch('http://127.0.0.1:8095/api/state').then(r=>r.json());
  assert.equal(state.connected,true);assert.ok(state.simTime>0);
  const environment=loadEnvironment(config);assert.deepEqual(state.home,environment.home);
  assert.equal(state.environment,environment.terrain?.name??'Test playground');
  assert.match(output,new RegExp(`Home: ${state.home.lat.toFixed(6).replaceAll('.','\\.')} ${state.home.lon.toFixed(6).replaceAll('.','\\.')}`));
  if(!values['no-video']){
   const video=await fetch('http://127.0.0.1:8095/api/video').then(r=>r.json());assert.equal(video.state,'streaming');
   const response=await fetch('http://127.0.0.1:8095/camera.mjpg',{signal:AbortSignal.timeout(5000)});
   assert.equal(response.status,200);const reader=response.body.getReader();const {value}=await reader.read();assert.ok(value.length>0);await reader.cancel();
  }
  if(method==='IPC')child.send({type:'shutdown'});else child.kill('SIGINT');
  assert.equal((await exitWithin()).code,0,output);await checkPorts(ports);
  console.log(`${method}: backend + SITL${values['no-video']?'':' + camera'} ready, shutdown released all ports`);
 }
 await fs.writeFile(launcherFile,JSON.stringify({...settings,sitlExe:path.join(dir,'missing-exe')}));
 start(args);assert.equal((await exitWithin()).code,1);assert.match(output,/SITL executable not found/);assert.doesNotMatch(output,/\[backend\]/);await checkPorts(ports);
 await fs.writeFile(launcherFile,JSON.stringify(settings));
 const outsider=net.createServer();outsider.listen(8095,'127.0.0.1');await once(outsider,'listening');
 try{start(args);assert.equal((await exitWithin()).code,1);assert.match(output,/in use/);assert.doesNotMatch(output,/\[backend\]/);assert.ok(outsider.listening);}
 finally{await new Promise(resolve=>outsider.close(resolve));}
 start(args);child.send({type:'shutdown'});assert.equal((await exitWithin()).code,0);await checkPorts(ports);
 assert.deepEqual(JSON.parse(await fs.readFile(launcherFile,'utf8')),settings);
 console.log('Missing executable, busy port, immediate cancellation and config preservation passed');
} catch(error){console.error(output);throw error;}
finally{
 if(child&&child.exitCode===null&&!child.signalCode){if(child.connected)child.send({type:'shutdown'});else child.kill('SIGTERM');await exitWithin();}
 await fs.rm(dir,{recursive:true,force:true});
}
