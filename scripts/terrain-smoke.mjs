#!/usr/bin/env node
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {checkPorts} from '../src/launcher.js';
import {loadEnvironment} from '../src/environment.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),group=new ProcessGroup({graceMs:2000});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-terrain-browser-'));let browser;
try{
 await checkPorts([{kind:'tcp',host:'127.0.0.1',port:8096,name:'Terrain smoke'}]);
 const config=JSON.parse(await fs.readFile(path.join(root,'config/default.json')));config.osm=false;config.httpPort=8096;
 const terrain=loadEnvironment(config).terrain;await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('terrain-backend',process.execPath,[path.join(root,'src/server.js'),'--standalone','--config',path.join(temp,'config.json')],{cwd:root,ipc:true});
 const url='http://127.0.0.1:8096';
 let ready=false;for(let i=0;i<100;i++){group.controller.signal.throwIfAborted();try{if((await fetch(url+'/api/state')).ok){ready=true;break;}}catch{}await delay(50);}
 assert.ok(ready,'backend ready');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');
 assert.match(await page.locator('#landscape').textContent(),/Feofaniya/);
 assert.match(await page.locator('#terrainAttribution').textContent(),/Google.*Copernicus/);
 const rendered=await page.evaluate(async()=>{const {fpvOutput}=await import('/app.js');const mesh=fpvOutput.scene.getObjectByName('real-terrain');return {vertices:Array.from(mesh.geometry.attributes.position.array),indices:Array.from(mesh.geometry.index.array),colours:mesh.geometry.attributes.color.count};});
 const {terrainMesh}=await import('../src/terrain.js');const geometry=terrainMesh(terrain);
 assert.deepEqual(rendered.vertices,Array.from(geometry.vertices));assert.deepEqual(rendered.indices,Array.from(geometry.indices));assert.equal(rendered.colours,terrain.size*terrain.size);
 await page.getByRole('button',{name:'Chase',exact:true}).click();await delay(400);
 await page.screenshot({path:path.join(root,'docs/terrain.png')});
 const state=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
 assert.ok((await state()).wheels.every(w=>w.contact));
 await page.locator('#viewport').click();const before=await state();
 await page.keyboard.down('w');await delay(2500);await page.keyboard.up('w');
 assert.ok((await state()).position.x-before.position.x>.5,'drives on terrain');
 await page.getByRole('button',{name:'Reset vehicle',exact:true}).click();await delay(200);assert.ok(Math.abs((await state()).position.x)<.01);
 await page.setViewportSize({width:390,height:844});await delay(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 console.log('Real terrain: exact rendered/collision mesh, satellite colours, attribution, contacts, drive, reset and narrow layout passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
