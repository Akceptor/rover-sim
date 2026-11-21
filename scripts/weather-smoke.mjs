import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-weather-')),group=new ProcessGroup();
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.httpPort=8098;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
let browser,scenario={hour:10,code:0,cloudCover:0,rainMm:0,snowCm:0,status:'current'};
const fixture=()=>{const now=Date.parse(`2026-06-21T${String(scenario.hour).padStart(2,'0')}:00:00Z`);return {now,observedAt:now,fetchedAt:now+scenario.code,timeZone:'Europe/Kyiv',status:scenario.status,ageMs:0,conditions:scenario.status==='unavailable'?null:{temperatureC:20,code:scenario.code,cloudCover:scenario.cloudCover,rainMm:scenario.rainMm,snowCm:scenario.snowCm}};};
try{
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8098';
 let actual;for(let i=0;i<100;i++){try{actual=await fetch(url+'/api/state').then(r=>r.json());break;}catch{await delay(50);}}
 assert.ok(actual?.weather);assert.ok(Number.isFinite(actual.weather.now));assert.deepEqual(actual.home.lat,50.3375);
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Keep the real init, physics and controls, changing only weather to cover every condition deterministically.
 await page.routeWebSocket(url.replace('http:','ws:')+'/',ws=>{const server=ws.connectToServer();server.onMessage(raw=>{const m=JSON.parse(raw);if(m.type==='state')m.weather=fixture();ws.send(JSON.stringify(m));});});
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
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(url+'/?camera-output');await page.waitForFunction(()=>document.querySelector('#weatherStatus').textContent.includes('unavailable'));
 assert.equal(await page.locator('.environment-status').isVisible(),false);assert.ok((await visual()).sunIntensity>0,'background video uses the same time lighting');
 assert.deepEqual(errors,[]);console.log('Weather: live API state, daytime/night lighting, rain, snow, fog, stale/offline fallback, local time, narrow layout and background camera passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
