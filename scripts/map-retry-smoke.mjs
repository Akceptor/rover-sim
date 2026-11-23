#!/usr/bin/env node
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-map-retry-')),group=new ProcessGroup();let browser;
try{
 const config=JSON.parse(await fs.readFile('config/default.json'));
 Object.assign(config,{osm:false,savedLocationsDir:path.join(temp,'saved'),terrainCacheDir:path.join(temp,'terrain'),httpPort:8110,udpPort:9017});config.mavlink.port=14575;
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 const preload=path.join(temp,'offline.cjs');
 await fs.writeFile(preload,"const original=globalThis.fetch;globalThis.fetch=(url,...args)=>{if(String(url).startsWith('http://127.0.0.1:'))return original(url,...args);throw Error('Offline elevation fixture');};");
 group.start('backend',process.execPath,['src/server.js','--mission-planner','--config',path.join(temp,'config.json')],{ipc:true,env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(preload).href}`}});
 const url='http://127.0.0.1:8110',state=()=>fetch(url+'/api/state').then(r=>r.json());
 for(let i=0;i<100;i++){try{await state();break;}catch{await delay(50);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#locationSelect option[value="map"]'));
 const home={lat:48.9164579,lon:24.7467362,alt:250};
 // Send the same map selection as the picker through a same-origin browser socket.
 await page.evaluate(home=>{
  const Original=WebSocket;const socket=new Original(`ws://${location.host}`);
  socket.onopen=()=>{socket.send(JSON.stringify({type:'selectLocation',id:'map',...home}));socket.close();};
 },home);
 await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('Location load failed'));
 const failed=await state();assert.equal(failed.autopilot.armed,null);assert.equal(failed.connected,false);
 assert.ok((await page.locator('#startTerrainStatus').textContent()).length<300);
 assert.equal(await page.locator('#retryTerrain').isEnabled(),true,'map retries work before SITL starts');
 const terrain={version:1,name:'Offline map retry',home,size:5,spacing:5,heights:Array(25).fill(0),attribution:'Synthetic fixture',sources:{elevation:{gapFill:{filledCells:49,totalCells:4624,maxRadiusMetres:30,maxMissingFraction:.05}}}};
 await fs.mkdir(config.terrainCacheDir,{recursive:true});await fs.writeFile(path.join(config.terrainCacheDir,`${home.lat.toFixed(7)}_${home.lon.toFixed(7)}.json`),JSON.stringify(terrain));
 await page.locator('#retryTerrain').click();await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('ready'));
 const ready=await state();assert.deepEqual(ready.home,home);assert.equal(ready.running,false);assert.equal(await page.locator('#retryTerrain').isVisible(),false);assert.equal(await page.locator('#terrainWarning').isVisible(),true);assert.match(await page.locator('#terrainWarning').textContent(),/⚠ 1.06%/);assert.deepEqual(errors,[]);
 console.log('Map retry before SITL: concise failure, enabled retry, cached recovery and held physics passed offline');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
