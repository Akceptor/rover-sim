import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rover-profile-api-'));
fs.cpSync(new URL('../config/vehicles',import.meta.url),dir,{recursive:true});
process.env.ROVER_VEHICLES_DIR=dir;
const {createProfileApi}=await import('../src/profile-api.js');
const {resolveVehicle,readProfileFiles}=await import('../src/vehicles.js');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

async function harness(over={}){
 const calls={applyLive:[],afterSave:[]};
 const ctx={activeId:()=>'mn168',transitioning:()=>false,activeVehicle:()=>resolveVehicle('mn168'),applyLive:r=>calls.applyLive.push(r),afterSave:id=>calls.afterSave.push(id),...over};
 const api=createProfileApi(ctx);
 const server=http.createServer(async(req,res)=>{if(!await api(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 const call=(method,url,body,headers={})=>new Promise((resolve,reject)=>{
  const data=body===undefined?null:typeof body==='string'?body:JSON.stringify(body);
  const req=http.request({host:'127.0.0.1',port,method,path:url,headers:Object.fromEntries(Object.entries({Origin:`http://127.0.0.1:${port}`,...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...headers}).filter(([,v])=>v!==undefined))},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,json,text});});});
  req.on('error',reject);if(data)req.write(data);req.end();
 });
 return {call,calls,close:()=>new Promise(r=>server.close(r))};
}
const using=async(fn,over)=>{const h=await harness(over);try{await fn(h);}finally{await h.close();}};
const entries=()=>fs.readdirSync(dir).sort();
const profile=(id,patch={})=>({...readProfileFiles('mn168').profile,id,...patch});

test('GET lists profiles with sitlParm and the active id',()=>using(async({call})=>{
 const r=await call('GET','/api/vehicles');assert.equal(r.status,200);assert.equal(r.json.active,'mn168');
 assert.deepEqual(r.json.profiles.map(p=>p.id).sort(),['heavy-crawler','mn168','tracked-crawler']);
 for(const p of r.json.profiles){assert.equal(p.profile.id,p.id);assert.equal(typeof p.sitlParm,'string');}
}));
test('PUT creates a new profile directory with vehicle.json and sitl.parm',()=>using(async({call,calls})=>{
 const p=profile('test-rig',{name:'Test rig'});
 const r=await call('PUT','/api/vehicles/test-rig',{profile:p,sitlParm:'SERVO1_MIN 1000\n'});
 assert.equal(r.status,200);assert.deepEqual(r.json,{ok:true,reloadNeeded:false});
 assert.equal(fs.readFileSync(path.join(dir,'test-rig/vehicle.json'),'utf8'),JSON.stringify(p,null,2)+'\n');
 assert.equal(fs.readFileSync(path.join(dir,'test-rig/sitl.parm'),'utf8'),'SERVO1_MIN 1000\n');
 assert.deepEqual(calls.afterSave,['test-rig']);assert.deepEqual(fs.readdirSync(path.join(dir,'test-rig')).sort(),['sitl.parm','vehicle.json']);
}));
test('bad ids and traversal are rejected with nothing written',()=>using(async({call,calls})=>{
 const before=entries();
 for(const bad of ['..','A','a/b','..%2Fetc','%2e%2e%2fx','-x','custom']){
  const r=await call('PUT','/api/vehicles/'+bad,{profile:profile(bad==='custom'?'custom':'x')});
  assert.equal(r.status,400,bad);assert.equal(typeof r.json.error,'string');
 }
 assert.deepEqual(entries(),before);assert.equal(calls.afterSave.length,0);
}));
test('profile id must match the URL id',()=>using(async({call})=>{
 const before=fs.readFileSync(path.join(dir,'mn168/vehicle.json'));
 const r=await call('PUT','/api/vehicles/mn168',{profile:profile('heavy-crawler')});assert.equal(r.status,400);
 assert.deepEqual(fs.readFileSync(path.join(dir,'mn168/vehicle.json')),before);
}));
test('invalid, incomplete or plain-malformed bodies leave the file byte-identical',()=>using(async({call,calls})=>{
 const file=path.join(dir,'mn168/vehicle.json'),before=fs.readFileSync(file);
 const incomplete=profile('mn168');delete incomplete.drive;
 for(const body of [{profile:profile('mn168',{mass:-1})},{profile:incomplete},{profile:{...profile('mn168'),typo:1}},{profile:{...profile('mn168'),profile:'heavy-crawler'}},{profile:profile('mn168'),sitlParm:5},{},'not json',[]]){
  const r=await call('PUT','/api/vehicles/mn168',body);assert.equal(r.status,400,JSON.stringify(body).slice(0,80));
 }
 assert.deepEqual(fs.readFileSync(file),before);assert.equal(calls.afterSave.length,0);assert.equal(calls.applyLive.length,0);
 assert.ok(!entries().some(e=>e.includes('tmp')));assert.ok(!fs.readdirSync(path.join(dir,'mn168')).some(e=>e.includes('tmp')));
}));
test('cross-origin or originless writes are rejected',()=>using(async({call,calls})=>{
 const before=entries(),p=profile('origin-test');
 assert.equal((await call('PUT','/api/vehicles/origin-test',{profile:p},{Origin:'http://evil'})).status,403);
 assert.equal((await call('PUT','/api/vehicles/origin-test',{profile:p},{Origin:undefined})).status,403);
 assert.equal((await call('POST','/api/vehicles/mn168/live',{profile:profile('mn168')},{Origin:'http://evil'})).status,403);
 assert.deepEqual(entries(),before);assert.equal(calls.applyLive.length,0);
}));
test('body over 64 KB is rejected with 413',()=>using(async({call})=>{
 const before=entries();
 const r=await call('PUT','/api/vehicles/big-one',{profile:profile('big-one'),sitlParm:'x'.repeat(70000)});
 assert.equal(r.status,413);assert.deepEqual(entries(),before);
}));
test('PUT to the active id reports reloadNeeded only for reload-class changes and applies live fields',()=>using(async({call,calls})=>{
 const file=path.join(dir,'mn168/vehicle.json'),original=fs.readFileSync(file,'utf8');
 try{
  const live=await call('PUT','/api/vehicles/mn168',{profile:profile('mn168',{engineForce:9})});
  assert.deepEqual(live.json,{ok:true,reloadNeeded:false});assert.equal(calls.applyLive.length,1);assert.equal(calls.applyLive[0].engineForce,9);
  const geom=await call('PUT','/api/vehicles/mn168',{profile:profile('mn168',{wheelbase:.31})});
  assert.deepEqual(geom.json,{ok:true,reloadNeeded:true});assert.equal(calls.applyLive.length,2);
  const other=await call('PUT','/api/vehicles/heavy-crawler',{profile:readProfileFiles('heavy-crawler').profile});
  assert.deepEqual(other.json,{ok:true,reloadNeeded:false});assert.equal(calls.applyLive.length,2);
 }finally{fs.writeFileSync(file,original);}
}));
test('POST /live: 409 for non-active ids and during transitions, otherwise applies the resolved vehicle',async()=>{
 await using(async({call,calls})=>{
  const r=await call('POST','/api/vehicles/heavy-crawler/live',{profile:readProfileFiles('heavy-crawler').profile});
  assert.equal(r.status,409);assert.equal(calls.applyLive.length,0);
 });
 await using(async({call,calls})=>{
  const r=await call('POST','/api/vehicles/mn168/live',{profile:profile('mn168')});
  assert.equal(r.status,409);assert.match(r.json.error,/in progress/);assert.equal(calls.applyLive.length,0);
 },{transitioning:()=>true});
 await using(async({call,calls})=>{
  const r=await call('POST','/api/vehicles/custom/live',{profile:profile('custom')});
  assert.equal(r.status,409);assert.match(r.json.error,/inline/);assert.equal(calls.applyLive.length,0);
 },{activeId:()=>'custom'});
 await using(async({call,calls})=>{
  const bad=await call('POST','/api/vehicles/mn168/live',{profile:profile('mn168',{mass:-1})});assert.equal(bad.status,400);assert.equal(calls.applyLive.length,0);
  const before=fs.readFileSync(path.join(dir,'mn168/vehicle.json'));
  const r=await call('POST','/api/vehicles/mn168/live',{profile:profile('mn168',{engineForce:7.5})});
  assert.deepEqual(r.json,{ok:true});assert.equal(calls.applyLive.length,1);assert.equal(calls.applyLive[0].engineForce,7.5);assert.equal(calls.applyLive[0].id,'mn168');
  assert.deepEqual(fs.readFileSync(path.join(dir,'mn168/vehicle.json')),before);
 });
});

test('backend serves the API: save appears in the cockpit init, live tuning applies, new profile is selectable',async()=>{
 const {spawn}=await import('node:child_process'),{once}=await import('node:events'),{setTimeout:delay}=await import('node:timers/promises'),{WebSocket}=await import('ws');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-backend-'));
 const config=JSON.parse(fs.readFileSync(new URL('../config/default.json',import.meta.url)));
 Object.assign(config,{osm:false,mavlink:null,httpPort:22000+Math.floor(Math.random()*10000),udpPort:32000+Math.floor(Math.random()*10000),savedLocationsDir:path.join(tmp,'saved')});
 const file=path.join(tmp,'config.json');fs.writeFileSync(file,JSON.stringify(config));
 const p=spawn(process.execPath,['src/server.js','--standalone','--flat','--config',file],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe'],env:process.env});let logs='';p.stderr.on('data',b=>logs+=b);
 const url=`http://127.0.0.1:${config.httpPort}`,send=(method,u,body)=>fetch(url+u,{method,headers:{Origin:url,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
 try{
  for(let i=0;i<100;i++){if(p.exitCode!==null)throw Error(logs);try{await fetch(url+'/api/state');break;}catch{await delay(30);}}
  const init=async()=>{const ws=new WebSocket(url.replace('http:','ws:'),{origin:url});const m=new Promise(r=>ws.once('message',d=>r(JSON.parse(d))));await once(ws,'open');const msg=await m;ws.close();return msg;};
  assert.equal((await init()).vehicles.some(v=>v.id==='backend-rig'),false);
  const rig=profile('backend-rig',{name:'Backend rig'});
  assert.equal((await send('PUT','/api/vehicles/backend-rig',{profile:rig})).status,200);
  assert.equal((await init()).vehicles.some(v=>v.id==='backend-rig'),true);
  assert.equal((await send('POST','/api/vehicles/backend-rig/live',{profile:rig})).status,409);
  assert.equal((await send('POST','/api/vehicles/mn168/live',{profile:profile('mn168',{engineForce:6})})).status,200);
  assert.equal((await fetch(url+'/api/vehicles',{method:'PUT',headers:{Origin:'http://evil'},body:'{}'})).status,405);
  const ws=new WebSocket(url.replace('http:','ws:'),{origin:url});await once(ws,'open');ws.send(JSON.stringify({type:'selectVehicle',id:'backend-rig'}));
  let state;for(let i=0;i<100;i++){state=await (await fetch(url+'/api/state')).json();if(state.selectedVehicle==='backend-rig'&&state.vehicleStatus.status==='ready')break;await delay(20);}
  assert.equal(state.selectedVehicle,'backend-rig');ws.close();
 }finally{p.kill();await once(p,'exit');fs.rmSync(tmp,{recursive:true,force:true});}
});
