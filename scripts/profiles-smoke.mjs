import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-profiles-')),group=new ProcessGroup();
const profiles=path.join(temp,'vehicles');await fs.cp('config/vehicles',profiles,{recursive:true});
const config=JSON.parse(await fs.readFile('config/default.json'));Object.assign(config,{osm:false,mavlink:null,savedLocationsDir:path.join(temp,'saved'),httpPort:8139,udpPort:9052});await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));let browser;
try{
 group.start('backend',process.execPath,['src/server.js','--standalone','--flat','--config',path.join(temp,'config.json')],{env:{...process.env,ROVER_VEHICLES_DIR:profiles},ipc:true});
 const url='http://127.0.0.1:8139';for(let i=0;i<150;i++){try{await fetch(url+'/api/state');break;}catch{await delay(60);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/profiles.html');await page.waitForSelector('#modelPreview canvas',{timeout:10000});
 const input=p=>page.locator(`[data-path="${p}"]`);
 assert.equal(await page.locator('#form > fieldset').count(),3);
 assert.equal(await page.locator('[data-path="collisionBoxes"]').count(),0);
 await page.waitForFunction(async()=>{const {preview}=await import('/profiles.js');return preview?.renderer.info.render.triangles>0;});
 const angle=()=>page.evaluate(async()=>{const {preview}=await import('/profiles.js');return preview.controls.getAzimuthalAngle();});
 const a=await angle();await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await delay(500);assert.ok(Math.abs(await angle()-a)>.001,'slow rotation');
 const canvas=page.locator('#modelPreview canvas'),box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,box.y+box.height*.6,{steps:8});await page.mouse.up();assert.ok(Math.abs(await angle()-a)>.1,'drag orbits');
 assert.match(await page.locator('#modelPath').textContent(),/MN-168.js/);assert.equal((await fetch(url+await page.locator('#modelPath').getAttribute('href'))).status,200);
 await page.locator('summary').filter({hasText:'Mass distribution'}).click();await input('centerOfGravity.x').locator('..').locator('.pe-help').focus();assert.match(await page.locator('.pe-tooltip:visible').textContent(),/forward/i);
 for(const id of ['heavy-crawler','tracked-crawler','mn168']){await page.selectOption('#profileSelect',id);await page.waitForFunction(async id=>{const {preview}=await import('/profiles.js');return preview.vehicleId===id;},id);assert.equal(await input('trackGeometry.length').isVisible(),false);if(id==='tracked-crawler'){await page.locator('summary').filter({hasText:'Track geometry'}).click();assert.equal(await input('trackGeometry.length').isVisible(),true);assert.equal(await input('maxSteer').isVisible(),false);}}
 await input('fpvFov').fill('90');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Rover running unsaved tuning'));await page.click('#revert');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Saved');assert.equal(await input('fpvFov').inputValue(),'85');
 await input('drivetrain').selectOption('tracked');await page.waitForFunction(()=>document.querySelector('#modelPath').textContent==='assets/vehicle.js');assert.equal(await page.evaluate(async()=>{const {preview}=await import('/profiles.js');return preview.scene.getObjectByName('mn168').children.filter(x=>x.name.startsWith('track-')).length;}),2);await page.click('#revert');
 const parm=await input('@sitl').inputValue();await input('@sitl').fill(parm+'\n# profile smoke\n');
 await input('length').fill('0.6');await page.click('#save');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved'));
 const saved=JSON.parse(await fs.readFile(path.join(profiles,'mn168/vehicle.json')));assert.match(await fs.readFile(path.join(profiles,'mn168/sitl.parm'),'utf8'),/# profile smoke/);assert.equal(saved.length,.6);assert.equal(saved.collisionBoxes[0].size[0],.6);
 await input('length').fill('0.7');await page.click('#revert');assert.equal(await input('length').inputValue(),'0.6');
 page.once('dialog',d=>d.accept('preview-copy'));await page.click('#duplicate');await page.click('#save');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Saved'));assert.equal(JSON.parse(await fs.readFile(path.join(profiles,'preview-copy/vehicle.json'))).id,'preview-copy');
 await page.selectOption('#profileSelect','mn168');await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await delay(150);await page.screenshot({path:path.join(temp,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await delay(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile has no horizontal overflow');await input('cameraMount.z').locator('..').locator('.pe-help').focus();const tip=await page.locator('.pe-tooltip:visible').boundingBox();assert.ok(tip.x>=0&&tip.x+tip.width<=390,'mobile tooltip fits viewport');await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:path.join(temp,'mobile.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#rotateModel').textContent==='Resume rotation');await delay(500);const still=await angle();await delay(250);assert.ok(Math.abs(await angle()-still)<.001,'reduced motion stops rotation');
 assert.deepEqual(errors,[]);console.log('Profiles browser passed: rendering, rotation, orbit, source links, help, profile switching, collision resizing, save/revert/duplicate, responsive layout.');console.log('Screenshots: '+temp);
}finally{await browser?.close();await group.stop();}
