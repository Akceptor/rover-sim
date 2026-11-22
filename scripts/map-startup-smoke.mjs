#!/usr/bin/env node
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-map-startup-'));let browser,group;
try{
 const config=JSON.parse(await fs.readFile('config/default.json'));config.httpPort=8108;config.udpPort=9015;config.mavlink.port=14573;config.terrain=null;config.osm=false;
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 const url='http://127.0.0.1:8108';
 browser=await chromium.launch({channel:'chrome',headless:true});
 const failures=[];
 for(const fault of ['none','missing-library','partial-init','setWorld','select','setPicking','update']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],diagnostics=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  if(fault==='missing-library')await context.route(/\/leaflet\.(js|css)$/,route=>route.fulfill({status:500,body:'asset unavailable'}));
  else if(fault!=='none')await context.route('**/location-map.js',async route=>{
   const response=await route.fetch(),source=await response.text();
   const marker=fault==='partial-init'?'const attribution=':fault==='select'?'function select(point,pan=true){':fault==='setWorld'?'setWorld(data){':fault==='setPicking'?'setPicking(enabled,message){':'update(state){';
   assert.ok(source.includes(marker));
   const injection=`throw new Error('injected ${fault} failure');`;
   await route.fulfill({response,body:source.replace(marker,fault==='partial-init'?injection+marker:marker+injection)});
  });
  try{
   group=new ProcessGroup({graceMs:2000});
   group.start('backend',process.execPath,['src/server.js','--standalone','--location-picker','--config',path.join(temp,'config.json')],{ipc:true});
   for(let i=0;i<100;i++){try{await fetch(url+'/api/state');break;}catch{}await delay(50);}
   await page.goto(url);
   await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active',null,{timeout:5000});
   await page.waitForFunction(()=>document.querySelectorAll('#locationSelect option').length===6);
   await page.selectOption('#locationSelect','kyiv');await page.locator('#loadLocation').click();
   await page.waitForFunction(()=>document.querySelector('#startTerrainStatus').textContent.includes('ready'));
   assert.notEqual(await page.locator('#landscape').textContent(),'Loading landscape');
   assert.match(await page.locator('#landscape').textContent(),/960 m/);
   await page.getByRole('button',{name:'Start physics',exact:true}).click();
   await page.waitForFunction(()=>Number(document.querySelector('#time').textContent)>0);
   await page.getByRole('button',{name:'Settings',exact:true}).click();
   await page.getByRole('button',{name:'Start video',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Streaming'),null,{timeout:5000});
   const video=()=>fetch(url+'/api/video').then(r=>r.json()),before=(await video()).frames;
   await delay(300);assert.ok((await video()).frames>before,'camera produces fresh frames');
   await page.getByRole('button',{name:'Stop video',exact:true}).click();await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Chase',exact:true}).click();
   assert.equal(await page.locator('#camera').inputValue(),'chase');
   if(fault==='none')assert.equal(await page.locator('.leaflet-control-zoom').count(),1);
   else{
    assert.match(await page.locator('#mapTileStatus').textContent(),/Map unavailable.*reload/i);
    assert.equal(await page.locator('#recenterMap').isDisabled(),true);
    assert.equal(await page.locator('.leaflet-control-zoom').count(),0,'failed map resources are removed');
    assert.ok(diagnostics.some(message=>message.includes('Location map failed')),diagnostics.join('\n'));
   }
   assert.deepEqual(errors,[]);
   console.log(`${fault}: live backend, preset loading, timing, camera stream and controls passed`);
  }catch(error){
   const status=await page.locator('#connection').textContent();
   console.error(`${fault}: ${error.message}\nconnection: ${status}\npage errors: ${[...new Set(errors)].join('; ')}`);
   failures.push(fault);
  }finally{await context.close();await group?.stop();}
 }
 assert.deepEqual(failures,[],'map faults must not stop cockpit startup or rendering');
}finally{await browser?.close();await group?.stop();await fs.rm(temp,{recursive:true,force:true});}
