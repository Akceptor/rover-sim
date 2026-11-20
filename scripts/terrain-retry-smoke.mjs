import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dgram from 'node:dgram';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-retry-')),group=new ProcessGroup(),udp=dgram.createSocket('udp4');
const config=JSON.parse(await fs.readFile('config/default.json'));config.httpPort=8102;config.udpPort=9009;config.mavlink.port=14567;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));let browser;
const send=hex=>new Promise((resolve,reject)=>udp.send(Buffer.from(hex,'hex'),config.mavlink.port,'127.0.0.1',e=>e?reject(e):resolve()));
const disarmed='fd0900000001010000000f0000000a030104037547';
try{
 group.start('backend',process.execPath,['src/server.js','--mission-planner','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8102',state=()=>fetch(url+'/api/state').then(r=>r.json());
 for(let i=0;i<100;i++){try{await state();break;}catch{await delay(50);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('Waiting'));
 assert.equal(await page.getByRole('button',{name:'Retry terrain',exact:true}).isDisabled(),true);
 await send('fd2c0000000101a400000000000000000000000000000000000000000000c3f51cc100000000000000000000000000621132b01d2a1201a2');
 await send('fd0f0000000101210000e803000000621132b01d2a12a086014e9b');await send(disarmed);
 await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('Terrain load failed'));
 assert.ok((await page.locator('#startTerrainStatus').textContent()).length<300,'UI presents a readable failure instead of command/stack details');
 assert.equal(await page.getByRole('button',{name:'Retry terrain',exact:true}).isEnabled(),true);
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await send('fd2c0000000101a400000000000000000000000000000000000000000000c3f51cc100000000000000000000000098e4001eb01d2a1253ae');
 await send('fd0f0000000101210000e803000098e4001eb01d2a1260cf026c8f');await send(disarmed);
 await page.getByRole('button',{name:'Retry terrain',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('Terrain ready'));
 const ready=await state();assert.equal(ready.running,false);assert.equal(ready.home.lat,50.3375);assert.equal(await page.locator('#retryTerrain').isVisible(),false);assert.equal(await page.locator('#run').isEnabled(),true);
 assert.deepEqual(errors,[]);console.log('Terrain retry UI: failure, readable error, disarmed retry button, narrow layout, loaded terrain and held physics passed without page/backend restart');
}finally{udp.close();await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
