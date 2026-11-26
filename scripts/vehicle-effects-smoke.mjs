import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-effects-')),group=new ProcessGroup();
let browser;
try{
 const config=JSON.parse(await fs.readFile('config/default.json'));Object.assign(config,{terrain:null,osm:false,httpPort:8098,savedLocationsDir:path.join(temp,'saved')});
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8098';for(let i=0;i<100;i++){try{await fetch(url+'/api/state');break;}catch{await delay(50);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');
 const result=await page.evaluate(async()=>{
  const T=await import('/three.js'),{createVehicleEffects}=await import('/vehicle-effects.js');
  const parent=new T.Group(),effects=createVehicleEffects(parent,{groundHeight:(x,z)=>2+x*.1,track:.4});
  const p=new T.Vector3(0,2.3,0),q=new T.Quaternion(),matrix=new T.Matrix4();
  effects.update(p,q,1,1/60,true);p.x=.3;effects.update(p,q,1,1/60,true);
  effects.tracks.getMatrixAt(0,matrix);const trackY=matrix.elements[13];
  p.x=.6;effects.update(p,q,1,1/60,true);
  effects.update(p,q,0,.1,true);const coasting=effects.dust.visible;
  for(let i=0;i<20;i++)effects.update(p,q,0,.1,true);
  const expired=!effects.dust.visible;
  let instanceDisposed=false;effects.tracks.addEventListener('dispose',()=>{instanceDisposed=true;});
  effects.dispose();const disposed=parent.children.length===0;
  const reverse=createVehicleEffects(parent);reverse.update(p,q,-1,1/60,true);p.x-=.3;reverse.update(p,q,-1,1/60,true);
  reverse.tracks.getMatrixAt(0,matrix);const reversing=matrix.elements[0]!==0||matrix.elements[1]!==0;reverse.dispose();
  const slow=createVehicleEffects(parent);p.set(0,.3,0);slow.update(p,q,1,1/60,true);
  for(let i=0;i<6;i++){p.x+=.05;slow.update(p,q,1,1/60,true);slow.update(p,q,1,1/60,true);}
  slow.tracks.getMatrixAt(0,matrix);const packetGaps=matrix.elements[0]!==0;slow.dispose();
  const materials={};
  for(const surface of ['asphalt','gravel','mud','sand','grass']){
   const effect=createVehicleEffects(parent,{groundHeight:()=>0});p.set(0,.3,0);
   const contacts=[{position:{x:2,y:0,z:3},surface}];
   effect.update(p,q,1,.1,true,contacts);p.x=.4;effect.update(p,q,1,.1,true,contacts);
   effect.tracks.getMatrixAt(0,matrix);
   materials[surface]={marks:Math.abs(matrix.elements[0])>0,x:matrix.elements[12],y:matrix.elements[13],z:matrix.elements[14],dust:effect.dust.visible};
   effect.dispose();
  }
  const roof=createVehicleEffects(parent);p.set(0,3,0);roof.update(p,q,1,.1,true,[]);p.x=.4;roof.update(p,q,1,.1,true,[]);
  roof.tracks.getMatrixAt(0,matrix);const roofClear=matrix.elements[0]===0&&!roof.dust.visible;roof.dispose();
  return {trackY,coasting,expired,disposed,reversing,packetGaps,instanceDisposed,materials,roofClear};
 });
 assert.ok(Math.abs(result.trackY-2.035)<.01,JSON.stringify(result));
 assert.ok(result.packetGaps,'distance accumulates between telemetry packets');
 assert.equal(result.materials.asphalt.marks,false,'asphalt has no soil tracks');assert.equal(result.materials.asphalt.dust,false,'asphalt has no earth dust');
 assert.equal(result.materials.mud.marks,true);assert.equal(result.materials.mud.dust,false,'mud has no dry dust');
 for(const surface of ['gravel','sand'])assert.equal(result.materials[surface].dust,true,`${surface} emits dust`);
 assert.equal(result.materials.mud.x,2);assert.equal(result.materials.mud.z,3);assert.ok(Math.abs(result.materials.mud.y-.04)<.001,'marks sit above the draped road');
 assert.ok(result.roofClear,'authoritative empty terrain contacts suppress roof effects');
 assert.ok(result.coasting,'dust remains visible while existing particles expire');assert.ok(result.expired);assert.ok(result.disposed);assert.ok(result.instanceDisposed);assert.ok(result.reversing,'reverse produces tracks');
 const effectsState=()=>page.evaluate(async()=>{const {fpvOutput}=await import('/app.js'),tracks=fpvOutput.scene.getObjectByName('tire-tracks');return {count:fpvOutput.scene.getObjectsByProperty('name','tire-tracks').length,version:tracks?.instanceMatrix.version};});
 const initial=await effectsState();assert.equal(initial.count,1,'effects installed in actual scene');
 await page.locator('#viewport').click();await page.keyboard.down('w');await delay(1500);await page.keyboard.up('w');
 assert.ok((await effectsState()).version>initial.version,'driving updates track instances');
 await fs.mkdir('.run/vehicle-effects',{recursive:true});await page.getByRole('button',{name:'Chase',exact:true}).click();await page.screenshot({path:'.run/vehicle-effects/chase.png'});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');assert.equal((await effectsState()).count,1);
 assert.deepEqual(errors,[]);console.log('Vehicle effects: ground placement, reverse, dust lifetime, disposal, live driving and reload passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
