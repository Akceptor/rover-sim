import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
async function until(fn){for(let i=0;i<200;i++){const value=await fn();if(value)return value;await delay(20);}throw Error('Timed out');}
test('volatile preference relay sanitizes changes, broadcasts, and initializes fresh camera clients',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'weather-relay-')),clients=[];let proc;
 try{
  const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));config.osm=false;config.httpPort=24000+Math.floor(Math.random()*5000);config.savedLocationsDir=path.join(dir,'saved');
  const configFile=path.join(dir,'config.json');await fs.writeFile(configFile,JSON.stringify(config));
  proc=spawn(process.execPath,['src/server.js','--standalone','--config',configFile],{cwd:new URL('..',import.meta.url),stdio:['ignore','ignore','ignore']});
  const url=`http://127.0.0.1:${config.httpPort}`;await until(async()=>{try{return (await fetch(url+'/api/state')).ok;}catch{return false;}});
  async function connect(){const messages=[],ws=new WebSocket(url.replace('http:','ws:'),{origin:url});clients.push(ws);ws.on('message',bytes=>messages.push(JSON.parse(bytes)));await once(ws,'open');await until(()=>messages.some(m=>m.type==='init'));return {ws,messages};}
  const cockpit=await connect();assert.equal(cockpit.messages.find(m=>m.type==='init').environmentPreferences,null);
  cockpit.ws.send(JSON.stringify({type:'environmentPreferences',preferences:{timeMode:'manual',weatherMode:'manual',minute:123,preset:'Snow',secret:'discard'}}));
  const expected={timeMode:'manual',weatherMode:'manual',minute:123,preset:'Snow'};
  await until(()=>cockpit.messages.some(m=>m.type==='environmentPreferences'));assert.deepEqual(cockpit.messages.find(m=>m.type==='environmentPreferences').preferences,expected);
  const camera=await connect();assert.deepEqual(camera.messages.find(m=>m.type==='init').environmentPreferences,expected);
  camera.ws.send(JSON.stringify({type:'environmentPreferences',seed:true,preferences:{timeMode:'auto'}}));
  await until(()=>camera.messages.some(m=>m.type==='environmentPreferences'));assert.deepEqual(camera.messages.find(m=>m.type==='environmentPreferences').preferences,expected);
  camera.messages.length=0;
  cockpit.ws.send(JSON.stringify({type:'environmentPreferences',preferences:{timeMode:'invalid',minute:1440,preset:'bad'}}));
  await until(()=>camera.messages.some(m=>m.type==='environmentPreferences'));assert.deepEqual(camera.messages.find(m=>m.type==='environmentPreferences').preferences,{timeMode:'auto',weatherMode:'auto',minute:720,preset:'Clear'});
 }finally{for(const ws of clients)ws.terminate();if(proc&&proc.exitCode===null){proc.kill();await once(proc,'exit');}await fs.rm(dir,{recursive:true,force:true});}
});
