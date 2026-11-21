import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {sitlArguments} from '../src/launcher.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-selector-'));
let logs='',browser,sitl;const group=new ProcessGroup({log:line=>{logs+=line+'\n';}});
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.httpPort=8104;config.udpPort=9011;config.mavlink.port=14569;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
const url='http://127.0.0.1:8104',state=()=>fetch(url+'/api/state').then(r=>r.json());
async function until(check){let s;for(let i=0;i<500;i++){try{s=await state();if(check(s))return s;}catch{}await delay(100);}assert.fail(JSON.stringify(s)+'\n'+logs);}
async function start(home={lat:-35.3651858,lon:149.1339324,alt:584}){
 sitl=new ProcessGroup({log:line=>{logs+=line+'\n';}});
 sitl.start('external-sitl',path.resolve(process.env.ROVER_SITL??'.tools/ardupilot/build/sitl/bin/ardurover'),sitlArguments(config,{defaults:path.resolve('config/rover.parm'),mavlinkPort:5798,home}),{cwd:temp});
}
try{
 group.start('backend',process.execPath,['src/server.js','--mission-planner','--config',path.join(temp,'config.json')],{ipc:true});await until(()=>true);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(10000);await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#locationPicker').hidden,{},{timeout:10000});
 assert.equal(await page.locator('#locationSelect option').count(),6);assert.equal(await page.locator('#locationSelect').inputValue(),'custom');
 await page.selectOption('#locationSelect','lima');await page.locator('#loadLocation').click();
 await until(s=>s.startTerrain.status==='ready');await start();
 const lima=await until(s=>s.autopilot?.position&&Math.abs(s.autopilot.position.lat+12.026)<.00002&&Math.abs(s.autopilot.position.lon+77.028)<.00002);
 assert.equal(lima.home.lat,-12.026);assert.equal(lima.weather.timeZone,'America/Lima');assert.ok(Math.abs(lima.autopilot.position.alt-lima.home.alt)<2);assert.equal(lima.running,false);
 // A live selection must hold the old GPS until a new SITL session starts.
 await page.selectOption('#locationSelect','lviv');await page.locator('#loadLocation').click();await until(s=>s.startTerrain.status==='restart');
 await page.waitForFunction(()=>document.querySelector('#run').disabled,{},{timeout:10000});await delay(1200);
 assert.ok(Math.abs((await state()).autopilot.position.lat+12.026)<.00002);
 await sitl.stop();await delay(config.timeoutMs+100);await start();
 const lviv=await until(s=>s.startTerrain.status==='ready'&&s.autopilot?.position&&Math.abs(s.autopilot.position.lat-49.88)<.00002);
 assert.ok(Math.abs(lviv.autopilot.position.lon-24.055)<.00002);assert.equal(lviv.weather.timeZone,'Europe/Kyiv');
 await page.locator('#run').click();await delay(600);assert.ok((await state()).wheels.every(w=>w.contact));await page.locator('#run').click();
 // Returning to Custom must stop overriding GPS and read the next MP start.
 await page.selectOption('#locationSelect','custom');await page.locator('#loadLocation').click();await until(s=>s.startTerrain.status==='restart');
 await sitl.stop();await delay(config.timeoutMs+100);await start({lat:50.3375,lon:30.475,alt:184.16});
 const custom=await until(s=>s.startTerrain.status==='ready'&&s.selectedLocation==='custom');assert.equal(custom.home.lat,50.3375);
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const hint=await page.locator('#locationHint').boundingBox(),select=await page.locator('#locationSelect').boundingBox();
 assert.ok(hint.y>=select.y+select.height,'location description wraps below the controls rather than being squeezed beside them');
 await page.screenshot({path:path.join(os.tmpdir(),'rover-terrain-selector.png')});assert.deepEqual(errors,[]);
 console.log('External terrain selector: six options, Australian start overridden to Lima GPS/altitude, live Lviv selection held until restart, Custom restores MP start, collisions and mobile layout passed');
}catch(error){console.error(logs);throw error;}
finally{await browser?.close();await sitl?.stop();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
