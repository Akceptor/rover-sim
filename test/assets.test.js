import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

test('vehicle renderer and its model imports are served as JavaScript',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rover-model-assets-'));let proc,logs='';
 try{
  const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));
  config.savedLocationsDir=path.join(dir,'saved-locations');config.httpPort=29000+Math.floor(Math.random()*1000);config.terrain=null;config.osm=false;
  const configPath=path.join(dir,'config.json');await fs.writeFile(configPath,JSON.stringify(config));
  proc=spawn(process.execPath,['src/server.js','--standalone','--config',configPath],{stdio:['ignore','pipe','pipe']});
  proc.stdout.on('data',chunk=>logs+=chunk);proc.stderr.on('data',chunk=>logs+=chunk);
  for(let i=0;i<200&&!logs.includes('"event":"ready"');i++){assert.equal(proc.exitCode,null,logs);await delay(25);}
  assert.match(logs,/"event":"ready"/);
  const pending=[new URL(`http://127.0.0.1:${config.httpPort}/assets/vehicle.js`)],seen=new Set();
  while(pending.length){
   const url=pending.pop();if(seen.has(url.href))continue;seen.add(url.href);
   const response=await fetch(url);
   assert.equal(response.status,200,`${url.pathname} must be available to the browser`);
   assert.match(response.headers.get('content-type'),/javascript/);
   const source=await response.text();
   for(const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g))pending.push(new URL(match[1],url));
  }
 }finally{
  if(proc&&proc.exitCode===null&&proc.signalCode===null){proc.kill();await once(proc,'exit');}
  await fs.rm(dir,{recursive:true,force:true});
 }
});

test('unreadable map assets report their path and filesystem error in the server terminal',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rover-assets-'));let proc,logs='';
 try{
  const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));
  config.savedLocationsDir=path.join(dir,'saved-locations');config.httpPort=28000+Math.floor(Math.random()*1000);config.terrain=null;config.osm=false;
  const configPath=path.join(dir,'config.json'),preload=path.join(dir,'missing-assets.mjs');
  await fs.writeFile(configPath,JSON.stringify(config));
  // Exercise real HTTP handling without changing the installed dependency files.
  await fs.writeFile(preload,`import fs from 'node:fs/promises';
const read=fs.readFile;
fs.readFile=async function(file,...args){
 if(String(file).replaceAll('\\\\','/').includes('/node_modules/leaflet/dist/')){
  throw Object.assign(new Error('injected missing Leaflet asset: '+file),{code:'ENOENT'});
 }
 return read.call(this,file,...args);
};`);
  proc=spawn(process.execPath,['--import',pathToFileURL(preload).href,'src/server.js','--standalone','--location-picker','--config',configPath],{stdio:['ignore','pipe','pipe']});
  proc.stdout.on('data',chunk=>logs+=chunk);proc.stderr.on('data',chunk=>logs+=chunk);
  for(let i=0;i<200&&!logs.includes('"event":"ready"');i++){assert.equal(proc.exitCode,null,logs);await delay(25);}
  assert.match(logs,/"event":"ready"/);
  for(const asset of ['/leaflet.js','/leaflet.css']){
   const response=await fetch(`http://127.0.0.1:${config.httpPort}${asset}`);
   assert.equal(response.status,500);assert.equal(await response.text(),'asset unavailable');
  }
  for(let i=0;i<100&&!logs.includes('"asset":"/leaflet.css"');i++)await delay(10);
  const errors=logs.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).filter(entry=>entry.event==='asset-error');
  assert.deepEqual(errors.map(entry=>entry.asset),['/leaflet.js','/leaflet.css'],logs);
  for(const entry of errors){assert.equal(entry.code,'ENOENT');assert.match(entry.message,/node_modules.*leaflet.*dist/);}
 }finally{
  if(proc&&proc.exitCode===null&&proc.signalCode===null){proc.kill();await once(proc,'exit');}
  await fs.rm(dir,{recursive:true,force:true});
 }
});
