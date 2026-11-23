import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-locations-'));let logs='';
const group=new ProcessGroup({log:line=>{logs+=line+'\n';}});
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.savedLocationsDir=path.join(temp,'saved-locations');config.httpPort=8103;config.udpPort=9010;config.mavlink.port=14568;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));let browser;
try{
 group.start('launcher',process.execPath,['scripts/launch.mjs','--choose-location','--no-video','--sitl',path.resolve(process.env.ROVER_SITL??'.tools/ardupilot/build/sitl/bin/ardurover'),'--config',path.join(temp,'config.json'),'--run-dir',path.join(temp,'eeprom'),'--mavlink-port','5794'],{ipc:true});
 const url='http://127.0.0.1:8103',state=()=>fetch(url+'/api/state').then(r=>r.json());
 let initial;for(let i=0;i<150;i++){try{initial=await state();break;}catch{await delay(50);}}
 assert.equal(initial?.startTerrain.status,'selecting',logs);assert.equal(initial.connected,false);assert.equal(initial.running,false);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#locationPicker').hidden===false);
 assert.equal(await page.locator('#locationSelect option').count(),6);assert.match(await page.locator('#locationSelect').textContent(),/Kyiv.*Lviv.*Lima.*Cusco.*Andes/);
 await page.selectOption('#locationSelect','lima');assert.match(await page.locator('#locationHint').textContent(),/131 m.*bundled offline/);
 await page.getByRole('button',{name:'Load location',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('Lima')&&document.querySelector('#locationSelect').disabled);
 let selected;for(let i=0;i<400;i++){selected=await state();if(selected.connected)break;await delay(100);}
 assert.equal(selected.connected,true,logs);assert.equal(selected.home.lat,-12.026);assert.equal(selected.home.lon,-77.028);assert.equal(selected.weather.timeZone,'America/Lima');assert.equal(selected.running,false);
 assert.match(logs,/Home: -12\.026000 -77\.028000/,'real SITL starts in the selected region');
 assert.equal(await page.locator('#locationSelect').inputValue(),'lima','selection survives world reinitialization');
 await page.getByRole('button',{name:'Start physics',exact:true}).click();await delay(600);assert.ok((await state()).wheels.every(w=>w.contact));
 await page.getByRole('button',{name:'Chase',exact:true}).click();await delay(400);await page.screenshot({path:'docs/locations.png'});
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Location picker: five bundled presets, Lima selection, actual native SITL home, timezone, wheel contacts and narrow layout passed');
}catch(error){console.error(logs);throw error;}
finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
