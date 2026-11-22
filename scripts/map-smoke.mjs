#!/usr/bin/env node
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {overlayKey} from '../src/osm.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-map-')),group=new ProcessGroup({graceMs:2000});let browser;
try{
 const config=JSON.parse(await fs.readFile('config/default.json'));config.httpPort=8107;config.udpPort=9014;config.mavlink.port=14572;config.terrainCacheDir=path.join(temp,'terrain-cache');config.osm={cacheDir:path.join(temp,'osm-cache'),endpoint:'http://127.0.0.1:9',timeoutMs:500};
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('backend',process.execPath,['src/server.js','--mission-planner','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8107',state=()=>fetch(url+'/api/state').then(r=>r.json());
 for(let i=0;i<100;i++){try{await state();break;}catch{}await delay(50);}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});let tiles=0;
 await context.route('https://tile.openstreetmap.org/**',route=>{tiles++;return route.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});await page.goto(url);await page.waitForFunction(()=>document.querySelectorAll('#locationSelect option').length===7);
 await page.selectOption('#locationSelect','kyiv');await page.locator('#loadLocation').click();await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('ready'));
 await page.waitForFunction(()=>document.querySelector('#mapTileStatus').textContent.includes('unavailable'));
 assert.ok(await page.locator('#locationMap canvas').count(),'offline vector layer renders');
 const camera=await page.locator('#viewport').boundingBox(),map=await page.locator('#locationMap').boundingBox();
 assert.ok(map.x>camera.x+camera.width,'map beside camera');assert.ok(Math.abs(map.width-map.height)<2,'square map');assert.ok(Math.abs(camera.width/camera.height-16/9)<.02,'16:9 camera');
 assert.ok(Math.abs(camera.y-map.y)<3,`camera and map align (${camera.y}, ${map.y})`);
 await fs.mkdir('.run/map-check',{recursive:true});await page.screenshot({path:'.run/map-check/desktop.png'});
 // A real click produces arbitrary coordinates. Seed that exact local terrain/OSM fixture before Load.
 await page.locator('#locationMap').click({position:{x:map.width*.61,y:map.height*.43}});
 assert.equal(await page.locator('#locationSelect').inputValue(),'map');
 const text=await page.locator('#mapCoordinates').textContent(),coords=text.match(/Start: (-?[\d.]+), (-?[\d.]+)/);assert.ok(coords,text);
 const lat=Number(coords[1]),lon=Number(coords[2]);assert.notEqual(lat,50.3375);
 const t={version:1,name:'Map-selected fixture',home:{lat,lon,alt:100},size:33,spacing:5,heights:Array(1089).fill(0),attribution:'Synthetic test terrain'};
 await fs.mkdir(config.terrainCacheDir,{recursive:true});await fs.writeFile(path.join(config.terrainCacheDir,`${lat.toFixed(7)}_${lon.toFixed(7)}.json`),JSON.stringify(t));
 await fs.mkdir(config.osm.cacheDir,{recursive:true});const key=overlayKey(t);await fs.writeFile(path.join(config.osm.cacheDir,createHash('sha256').update(key).digest('hex')+'.json'),JSON.stringify({version:1,key,buildings:[],roads:[]}));
 assert.equal((await state()).home.lat,50.3375,'click alone does not relocate');
 await page.locator('#loadLocation').click();await page.waitForFunction(()=>document.querySelector('#landscape').textContent.includes('Map-selected fixture'));
 const selected=await state();assert.equal(selected.home.lat,lat);assert.equal(selected.home.lon,lon);assert.equal(selected.running,false);assert.equal(selected.osm.status,'empty');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#mapCoordinates').textContent.startsWith('Start:'));assert.equal(await page.locator('#locationSelect').inputValue(),'map');
 await page.setViewportSize({width:390,height:844});await delay(200);const smallCamera=await page.locator('#viewport').boundingBox(),smallMap=await page.locator('#locationMap').boundingBox();assert.ok(smallMap.y>smallCamera.y+smallCamera.height,'map stacks below FPV');assert.ok(Math.abs(smallMap.width-smallMap.height)<2);await page.screenshot({path:'.run/map-check/mobile.png',fullPage:true});const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&getComputedStyle(e).position!=='absolute';}).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).slice(0,12)}));assert.ok(overflow.scroll<=overflow.width,JSON.stringify(overflow));
 const before=tiles,output=await context.newPage();await output.setViewportSize({width:1280,height:720});await output.goto(url+'/?camera-output');await output.waitForFunction(()=>document.querySelector('#landscape').textContent.includes('Map-selected fixture'));await delay(200);
 assert.equal(await output.locator('.map-panel').isVisible(),false);const full=await output.locator('#viewport').boundingBox();assert.equal(full.width,1280);assert.equal(full.height,720);assert.equal(tiles,before,'background camera creates no map tile requests');
 assert.deepEqual(errors,[]);console.log('Map: desktop square/16:9 layout, offline roads/buildings, real click selection, exact cached origin, held physics, reconnect, mobile stack and full-size camera output passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
