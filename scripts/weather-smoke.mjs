import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-weather-')),group=new ProcessGroup();
const shots=path.resolve('.run/weather-controls');await fs.mkdir(shots,{recursive:true});
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.savedLocationsDir=path.join(temp,'saved-locations');config.httpPort=8098;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
let browser,selectedHome=null,scenario={hour:10,code:0,cloudCover:0,rainMm:0,snowCm:0,status:'current'};
const fixture=()=>{const now=Date.parse(`2026-06-21T${String(scenario.hour).padStart(2,'0')}:00:00Z`);return {now,observedAt:now,fetchedAt:now+scenario.code,timeZone:'Europe/Kyiv',status:scenario.status,ageMs:0,conditions:scenario.status==='unavailable'?null:{temperatureC:20,code:scenario.code,cloudCover:scenario.cloudCover,rainMm:scenario.rainMm,snowCm:scenario.snowCm}};};
try{
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8098';
 let actual;for(let i=0;i<100;i++){try{actual=await fetch(url+'/api/state').then(r=>r.json());break;}catch{await delay(50);}}
 assert.ok(actual?.weather);assert.ok(Number.isFinite(actual.weather.now));assert.deepEqual(actual.home.lat,50.3375);
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Keep the real init, physics and controls, changing only weather to cover every condition deterministically.
 await page.context().routeWebSocket(url.replace('http:','ws:')+'/',ws=>{const server=ws.connectToServer();server.onMessage(raw=>{const m=JSON.parse(raw);if(m.type==='state'){m.weather=fixture();if(selectedHome)m.home=selectedHome;}ws.send(JSON.stringify(m));});});
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('Clear'));
 const visual=()=>page.evaluate(async()=>{const {fpvOutput:o}=await import('/app.js'),{Color}=await import('/three.js');return {...o.scene.userData.weather,particles:o.scene.getObjectByName('weather-precipitation').visible,sky:o.renderer.getClearColor(new Color()).getHex(),fog:o.scene.fog.far};});
 const clear=await visual();assert.ok(clear.sunIntensity>2.5);assert.match(await page.locator('#localTime').textContent(),/13:00:00.*Europe\/Kyiv/);
 scenario={...scenario,hour:22};await page.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('01:00:00'));
 const night=await visual();assert.ok(night.ambientIntensity<clear.ambientIntensity);assert.notEqual(night.sky,clear.sky);
 scenario={hour:10,code:61,cloudCover:100,rainMm:2,snowCm:0,status:'current'};
 await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('Rain'));const rain=await visual();assert.equal(rain.precipitation,'rain');assert.equal(rain.particles,true);assert.ok(rain.fog<clear.fog);
 scenario={...scenario,code:73,rainMm:0,snowCm:1};await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('Snow'));assert.equal((await visual()).precipitation,'snow');
 scenario={...scenario,code:45,snowCm:0};await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('Fog'));assert.equal((await visual()).fog,85);
 scenario={...scenario,status:'stale'};await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('stale'));
 scenario={...scenario,status:'unavailable'};await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('unavailable'));assert.equal((await visual()).particles,false);assert.ok((await visual()).sunIntensity>0);
 // Manual weather works even when the provider is unavailable; time remains independent.
 await page.selectOption('#weatherMode','manual');
 for(const [preset,precipitation,visibility] of [['Clear',null,650],['Cloudy',null,650],['Fog',null,85],['Rain','rain',280],['Snow','snow',280]]){
  await page.selectOption('#weatherPreset',preset);await page.waitForFunction(p=>document.querySelector('#weatherStatus').textContent.includes(p+' · clouds')&&document.querySelector('#weatherStatus').dataset.state==='manual',preset);
  const v=await visual();assert.equal(v.precipitation,precipitation);assert.equal(v.visibility,visibility);
 }
 await page.selectOption('#timeMode','manual');
 await page.locator('[data-time-preset="480"]').click();await page.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('08:00:00'));
 const morning=await visual();assert.equal(morning.precipitation,'snow');
 await page.locator('[data-time-preset="0"]').click();await page.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('00:00:00'));assert.ok((await visual()).elevationDeg<0);
 await page.locator('#sunsetTime').click();await page.waitForFunction(()=>Math.abs(document.querySelector('#selectedMinute').textContent.slice(0,2)-21)<2);
 await delay(100);assert.ok(Math.abs((await visual()).elevationDeg+.833)<.3);
 await page.screenshot({path:path.join(shots,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(shots,'narrow.png'),fullPage:true});await page.setViewportSize({width:1440,height:900});
 await page.locator('#timeMinute').fill('123');await page.locator('#timeMinute').dispatchEvent('input');
 await page.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('02:03:00'));
 await delay(1100);assert.match(await page.locator('#localTime').textContent(),/02:03:00/,'manual minute is frozen');
 const oldElevation=(await visual()).elevationDeg;selectedHome={lat:40,lon:-74};
 await page.waitForFunction(async previous=>{const {fpvOutput:o}=await import('/app.js');return Math.abs(o.scene.userData.weather.elevationDeg-previous)>1;},oldElevation);
 assert.match(await page.locator('#localTime').textContent(),/02:03:00/,'location change preserves local minute');
 selectedHome={lat:90,lon:0};await page.waitForFunction(()=>document.querySelector('#sunsetTime').disabled);assert.equal(await page.locator('#sunsetUnavailable').isVisible(),true);selectedHome=null;
 await page.reload();await page.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('02:03:00'));assert.equal(await page.locator('#weatherPreset').inputValue(),'Snow');
 // Camera pages share persisted values and receive storage events from the cockpit.
 const cameraPage=await page.context().newPage();await cameraPage.goto(url+'/?camera-output');
 await cameraPage.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('02:03:00'));
 assert.equal(await cameraPage.locator('.environment-controls').isVisible(),false);
 // A dedicated MJPEG browser uses an isolated profile with no shared localStorage.
 const isolatedContext=await browser.newContext({viewport:{width:960,height:540}}),isolatedCamera=await isolatedContext.newPage();
 await isolatedContext.routeWebSocket(url.replace('http:','ws:')+'/',ws=>{const server=ws.connectToServer();server.onMessage(raw=>{const m=JSON.parse(raw);if(m.type==='state')m.weather=fixture();ws.send(JSON.stringify(m));});});
 await isolatedCamera.goto(url+'/?camera-output');
 await isolatedCamera.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('02:03:00')&&document.querySelector('#weatherStatus').textContent.includes('Snow'));
 assert.equal(await isolatedCamera.locator('#timeMode').inputValue(),'manual');assert.equal(await isolatedCamera.locator('#weatherMode').inputValue(),'manual');

 await page.selectOption('#weatherPreset','Rain');await cameraPage.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('Rain'));await isolatedCamera.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('Rain'));
 await page.selectOption('#weatherMode','auto');await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('unavailable'));await isolatedCamera.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('unavailable'));
 assert.match(await page.locator('#localTime').textContent(),/02:03:00/,'manual time with automatic weather');
 await page.selectOption('#timeMode','auto');await cameraPage.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('13:00:00'));await isolatedCamera.waitForFunction(()=>document.querySelector('#localTime').textContent.includes('13:00:00'));await isolatedContext.close();
 await cameraPage.close();
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(url+'/?camera-output');await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('unavailable'));
 assert.equal(await page.locator('.environment-status').isVisible(),false);assert.ok((await visual()).sunIntensity>0,'background video uses the same time lighting');
 assert.deepEqual(errors,[]);console.log('Weather: automatic conditions, all manual presets, independent modes, sunset, frozen local minute, location changes, persistence, cross-tab and isolated-profile camera sync, offline fallback and narrow layout passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
