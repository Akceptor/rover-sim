import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-vehicles-')),group=new ProcessGroup();
const config=JSON.parse(await fs.readFile('config/default.json'));Object.assign(config,{osm:false,savedLocationsDir:path.join(temp,'saved'),httpPort:8129,udpPort:9042});config.mavlink.port=14592;await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));let browser;
try{
 group.start('backend',process.execPath,['src/server.js','--standalone','--flat','--config',path.join(temp,'config.json')],{ipc:true});const url='http://127.0.0.1:8129';for(let i=0;i<150;i++){try{await fetch(url+'/api/state');break;}catch{await delay(60);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.stack);});await page.addInitScript(()=>{const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);window.testSocket=this;}};});await page.goto(url);console.log('Page loaded');await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active',null,{timeout:15000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
 assert.equal(await page.locator('#activeVehicle').getAttribute('data-vehicle'),'mn168');assert.equal(await page.locator('#run').first().textContent(),'Stop physics','default launch runs without selection');
 for(const id of ['heavy-crawler','tracked-crawler','mn168']){
  await page.selectOption('#vehicleSelect',id);await page.click('#loadVehicle');await page.waitForFunction(id=>document.querySelector('#activeVehicle').dataset.vehicle===id,id);await page.waitForFunction(()=>document.querySelector('#vehicleStatus').dataset.state==='ready');await page.waitForFunction(()=>document.querySelector('#run').textContent==='Start physics');await page.locator('#run').first().click();await page.waitForFunction(()=>document.querySelector('#run').textContent==='Stop physics');
  await page.locator('#viewport').click();await page.keyboard.down('w');await page.keyboard.down('d');await delay(700);await page.keyboard.up('w');await page.keyboard.up('d');
  // Stop rendering movement while comparing the exact latest backend sample.
  const visual=await page.evaluate(async()=>{const {fpvOutput:o}=await import('/app.js');const rover=o.scene.children.find(x=>x.userData.vehicleRevision!==undefined);const model=rover.children[0];return {name:model.name,wheels:model.children.filter(o=>o.name.startsWith('wheel-')).map(w=>({position:w.position.toArray(),steer:w.rotation.y,spin:w.children[0].rotation.z})),tracks:['left','right'].map(side=>model.getObjectByName('tread-'+side)?.instanceMatrix.array.slice(0,16)),mount:document.querySelector('#mountY').value,revision:rover.userData.vehicleRevision};});
  assert.equal(visual.name,id==='mn168'?'MN-168':id);assert.ok(visual.revision>=1);
  await page.evaluate(()=>window.testSocket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'state',vehicleRevision:-1,position:{x:999,y:999,z:999}})})));await delay(40);assert.notEqual(await page.evaluate(async()=>{const {fpvOutput:o}=await import('/app.js');return o.scene.children.find(x=>x.userData.vehicleRevision!==undefined).position.x;}),999,'stale vehicle revision ignored');
  if(id==='tracked-crawler'){assert.equal(visual.wheels.length,0);assert.ok(visual.tracks.every(Boolean));assert.notDeepEqual(visual.tracks[0],visual.tracks[1],'independent track animation');}
  else{assert.equal(visual.wheels.length,4);assert.ok(visual.wheels.every(w=>w.position.every(Number.isFinite)));assert.ok(visual.wheels.some(w=>Math.abs(w.spin)>.01));assert.ok(Math.abs(visual.wheels[0].steer)>.01);assert.equal(visual.wheels[2].steer,0);}
 }
 await page.evaluate(()=>{document.querySelector('#mountY').value='.321';window.testSocket.close();});await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('reconnecting'));await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');assert.equal(await page.locator('#mountY').inputValue(),'.321','same profile reconnect preserves mount tweak');assert.deepEqual(errors,[]);console.log('Vehicle browser: default launch, three selections, HUD, revision, wheel steering/spin and independent tracks passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
