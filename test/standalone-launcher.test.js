import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';

const root=new URL('..',import.meta.url);
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function start(t,{args=[],openBrowser,openerError,mission=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'standalone-launcher-'));
 const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));
 Object.assign(config,{osm:false,httpPort:await freePort(),terrainCacheDir:path.join(dir,'terrain'),savedLocationsDir:path.join(dir,'saved')});
 if(mission){config.udpPort=await freePort();config.mavlink.port=await freePort();}
 else config.mavlink=null;
 const file=path.join(dir,'backend.json'),settings=path.join(dir,'launcher.json'),marker=path.join(dir,'spawns.jsonl'),preload=path.join(dir,'opener.cjs');
 await fs.writeFile(file,JSON.stringify(config));await fs.writeFile(settings,JSON.stringify({backendConfig:file,...(openBrowser===undefined?{}:{openBrowser})}));
 // Intercept only the OS opener. The actual launcher and backend still run,
 // including their startup, picker, location loading and shutdown lifecycle.
 await fs.writeFile(preload,`const cp=require('node:child_process'),fs=require('node:fs'),{EventEmitter}=require('node:events');
const original=cp.spawn;
cp.spawn=function(command,args,options){
 fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({command,args})+'\\n');
 if(['open','cmd.exe','xdg-open'].includes(command)){
  if(${JSON.stringify(openerError)}==='throw')throw Error('test opener failure');
  const child=new EventEmitter();child.unref=()=>child;
  if(${JSON.stringify(openerError)}==='error')queueMicrotask(()=>child.emit('error',Error('test opener failure')));
  else if(${JSON.stringify(openerError)}==='exit')queueMicrotask(()=>child.emit('exit',7,null));
  return child;
 }
 return original.apply(this,arguments);
};require('node:module').syncBuiltinESMExports();`);
 const child=spawn(process.execPath,['scripts/launch.mjs',...(mission?['--mission-planner']:['--standalone','--choose-location']),'--no-video','--launcher-config',settings,...args],{cwd:root,env:{...process.env,CI:'1',NODE_OPTIONS:`--import=${pathToFileURL(preload).href}`},stdio:['ignore','pipe','pipe','ipc']});
 let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>logs+=bytes);
 const exit=once(child,'exit');
 const url=`http://127.0.0.1:${config.httpPort}`;
 const state=async()=>{const response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(1000)});return response.json();};
 const wait=async predicate=>{for(let i=0;i<150;i++){if(child.exitCode!==null)assert.fail(`Launcher exited: ${logs}`);if(await predicate())return;await delay(20);}assert.fail(`Launcher did not reach expected state: ${logs}`);};
 const spawns=async()=>fs.readFile(marker,'utf8').then(s=>s.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),error=>{if(error.code==='ENOENT')return [];throw error;});
 const opened=async()=>{const entries=await spawns();return entries.filter(e=>['open','cmd.exe','xdg-open'].includes(e.command));};
 t.after(async()=>{
  if(child.exitCode===null){if(child.connected)child.send({type:'shutdown'});else child.kill('SIGTERM');}
  let timer;
  try{
   const [code]=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Launcher did not stop its services'));},8000);})]);
   assert.equal(code,0,logs);
   await assert.rejects(fetch(url+'/api/state',{signal:AbortSignal.timeout(1000)}),'backend port is released after launcher shutdown');
  }finally{clearTimeout(timer);await fs.rm(dir,{recursive:true,force:true});}
 });
 await wait(()=>logs.includes(mission?'[launcher] READY':'and choose a location'));
 return {child,url,state,wait,opened,spawns,logs:()=>logs};
}

test('standalone npm script launches the picker with background video disabled',async()=>{
 const {scripts}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url)));
 assert.match(scripts.standalone,/node scripts\/launch\.mjs --standalone --choose-location --no-video/);
});

test('standalone opens its HUD before location selection even with non-TTY CI output and opens only once',async t=>{
 const s=await start(t),initial=await s.state();assert.equal(initial.mode,'standalone');assert.equal(initial.startTerrain.status,'selecting');assert.equal(initial.running,false);
 const opened=await s.opened();assert.equal(opened.length,1,'HUD opens before waiting for a location');assert.ok(opened[0].args.includes(s.url));
 const ws=new WebSocket(s.url.replace('http:','ws:'),{origin:s.url});await once(ws,'open');t.after(()=>ws.terminate());
 ws.send(JSON.stringify({type:'selectLocation',id:'kyiv'}));await s.wait(()=>s.logs().includes('[launcher] READY'));
 assert.equal((await s.state()).startTerrain.status,'ready');assert.equal((await s.opened()).length,1,'location readiness must not open a second HUD');
 assert.equal((await s.spawns()).some(e=>e.args.some(a=>typeof a==='string'&&(a.endsWith('camera-stream.mjs')||a==='--model'))),false,'no background camera or SITL');
});

test('no-open suppresses the standalone HUD even with configured auto-open and explicit open',async t=>{
 const s=await start(t,{args:['--open','--no-open'],openBrowser:true});assert.equal((await s.opened()).length,0);assert.equal((await s.state()).startTerrain.status,'selecting');
});

test('configured false suppresses the standalone HUD',async t=>{
 const s=await start(t,{openBrowser:false});assert.equal((await s.opened()).length,0);
});

test('explicit open overrides configured false before the picker waits',async t=>{
 const s=await start(t,{args:['--open'],openBrowser:false});assert.equal((await s.opened()).length,1);assert.equal((await s.state()).startTerrain.status,'selecting');
});

for(const openerError of ['throw','error','exit'])test(`opener ${openerError} failure is reported while the standalone picker remains available`,async t=>{
 const s=await start(t,{args:['--open'],openerError});await s.wait(()=>s.logs().includes('Could not open browser'));assert.equal(s.child.exitCode,null);assert.equal((await s.state()).startTerrain.status,'selecting');
});

test('ordinary launch retains its non-TTY browser policy',async t=>{
 const s=await start(t,{mission:true});assert.equal((await s.opened()).length,0);
});

test('ordinary launch still honors configured auto-open',async t=>{
 const s=await start(t,{mission:true,openBrowser:true});assert.equal((await s.opened()).length,1);
});
