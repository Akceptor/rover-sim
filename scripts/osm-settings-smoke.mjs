#!/usr/bin/env node
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {terrain,osm} from '../test/fixtures/osm.js';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'osm-settings-browser-')),url='http://127.0.0.1:8110';
let group,browser,overpass,hold=false,reply,requests=0;
const state=()=>fetch(url+'/api/state').then(r=>r.json());
try{
 overpass=http.createServer((req,res)=>{requests++;req.resume();if(hold){reply=()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(osm));};}else{res.writeHead(504);res.end('fixture unavailable');}});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const endpoint=`http://127.0.0.1:${overpass.address().port}/interpreter`,config=JSON.parse(await fs.readFile('config/default.json'));
 Object.assign(config,{httpPort:8110,mavlink:null,terrain:path.join(temp,'terrain.json'),savedLocationsDir:path.join(temp,'saved'),osm:{endpoint,timeoutMs:2000,bundledDir:null,cacheDir:path.join(temp,'cache')}});
 const configPath=path.join(temp,'config.json');await fs.writeFile(config.terrain,JSON.stringify(terrain));await fs.writeFile(configPath,JSON.stringify(config));
 const start=async()=>{group=new ProcessGroup({graceMs:2000});group.start('backend',process.execPath,['src/server.js','--standalone','--config',configPath],{ipc:true});for(let i=0;i<150;i++){try{const s=await state();if(s.osm.status!=='loading')return;}catch{}await delay(50);}throw Error('Backend did not become ready');};await start();
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('https://**/*',r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);await page.goto(url);
 await page.locator('#configureOsm').waitFor({state:'visible'});await page.locator('#configureOsm').click();
 assert.equal(await page.locator('#settingsDialog').isVisible(),true);assert.equal(await page.locator('#osmServer').inputValue(),'custom');assert.equal(await page.locator('#osmEndpoint').inputValue(),endpoint);
 await page.selectOption('#osmServer','auto');assert.match(await page.locator('#osmResolvedServer').textContent(),/Africa/);await page.locator('#osmTimeout').fill('45');await page.locator('#osmSave').click();await page.waitForFunction(()=>document.querySelector('#osmSettingsStatus').textContent.startsWith('Saved'));
 assert.equal((await state()).osmSettings.settings.server,'auto');assert.equal(requests,1,'Save does not retry');
 await page.selectOption('#osmServer','south-america');assert.match(await page.locator('#osmResolvedServer').textContent(),/api-sa\/interpreter/);
 // Reconnecting/other tabs must not overwrite unsaved edits.
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url);await second.locator('#settings').click();await second.selectOption('#osmServer','europe');await second.locator('#osmSave').click();await second.waitForFunction(()=>document.querySelector('#osmSettingsStatus').textContent.startsWith('Saved'));
 assert.equal(await page.locator('#osmServer').inputValue(),'south-america');await page.selectOption('#osmServer','custom');await page.locator('#osmEndpoint').fill(endpoint);await page.locator('#osmTimeout').fill('12');
 hold=true;const before=await state();await page.locator('#osmSaveRetry').click();await page.waitForFunction(()=>document.querySelector('#osmSaveRetry').disabled);for(let i=0;i<100&&!reply;i++)await delay(30);assert.ok(reply,'retry reaches configured server');reply();
 await page.waitForFunction(()=>document.querySelector('#osmSettingsStatus').textContent.includes('next location load'));
 assert.equal((await state()).worldRevision,before.worldRevision);assert.equal((await state()).osm.status,'deferred');assert.equal(requests,2);
 await second.waitForFunction(()=>document.querySelector('#osmServer').value==='custom');assert.equal(await second.locator('#osmTimeout').inputValue(),'12');
 await fs.mkdir('.run/osm-settings-check',{recursive:true});await page.screenshot({path:'.run/osm-settings-check/desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('#osmSettingsSection').scrollIntoViewIfNeeded();await page.screenshot({path:'.run/osm-settings-check/mobile.png'});assert.equal(await page.evaluate(()=>document.querySelector('#settingsDialog').scrollWidth<=document.querySelector('#settingsDialog').clientWidth),true);
 await group.stop();await page.waitForFunction(()=>document.querySelector('#osmSettingsStatus').textContent.includes('offline'));assert.equal(await page.locator('#osmSave').isDisabled(),true);
 await start();await page.reload();await page.locator('#settings').click();await page.waitForFunction(()=>document.querySelector('#osmServer').value==='custom');assert.equal(await page.locator('#osmEndpoint').inputValue(),endpoint);assert.equal(await page.locator('#osmTimeout').inputValue(),'12');assert.equal(requests,2,'restart uses cached OSM');assert.deepEqual(JSON.parse(await fs.readFile(configPath)),config);
 assert.deepEqual(errors,[]);console.log('OSM settings: presets, automatic/manual preview, save/retry, safe defer, two-tab edits, offline feedback, restart persistence and mobile passed');
}finally{await browser?.close();await group?.stop();if(overpass){overpass.closeAllConnections();await new Promise(r=>overpass.close(r));}await fs.rm(temp,{recursive:true,force:true});}
