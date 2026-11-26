import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {barriersOsm,terrain,node} from '../test/fixtures/barriers.js';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-barriers-')),group=new ProcessGroup();let browser,overpass,data=structuredClone(barriersOsm),backend;
try{
 overpass=http.createServer((req,res)=>{req.resume();res.end(JSON.stringify(data));});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const file=path.join(temp,'terrain.json');await fs.writeFile(file,JSON.stringify({...terrain,colors:Array(terrain.heights.length*3).fill(130)}));
 const config=JSON.parse(await fs.readFile('config/default.json'));
 Object.assign(config,{httpPort:8113,terrain:file,savedLocationsDir:path.join(temp,'saved'),osm:{endpoint:`http://127.0.0.1:${overpass.address().port}`,bundledDir:null,cacheDir:path.join(temp,'cache0')}});
 const url='http://127.0.0.1:8113',state=()=>fetch(url+'/api/state').then(r=>r.json());
 async function start(i){
  config.osm.cacheDir=path.join(temp,`cache${i}`);await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
  backend=group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
  for(let n=0;n<100;n++){try{if((await state()).osm.status==='ready')return;}catch{}await delay(50);}assert.fail('barrier fixture not ready');
 }
 await start(0);browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());
 await page.addInitScript(()=>{const Original=WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='init')window.worldInit=m;}catch{}});}};});
 await page.goto(url);await page.waitForFunction(()=>window.worldInit?.overlay?.barriers?.length&&!document.querySelector('#osmAttribution').hidden);
 const shared=await page.evaluate(async()=>{
  const {fpvOutput:f}=await import('/app.js'),T=await import('/three.js'),matrix=new T.Matrix4(),actual=[];
  const round=v=>Math.round(Math.fround(v)*1e5)/1e5;
  f.scene.traverse(o=>{if(o.name.startsWith('osm-barriers:')){o.geometry.addEventListener('dispose',()=>window.barrierDisposed=true);for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);actual.push(Array.from(matrix.elements).map(round));}}});
  const expected=window.worldInit.overlay.barriers.map(b=>{const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-b.angle);return Array.from(new T.Matrix4().compose(new T.Vector3(...b.position),q,new T.Vector3(...b.size)).elements).map(round);});
  return {actual:actual.sort(),expected:expected.sort(),map:window.worldInit.map.barriers.length};
 });assert.deepEqual(shared.actual,shared.expected,'barrier meshes use exact collider transforms');assert.ok(shared.map>5);
 await page.locator('#viewport').click();await page.keyboard.down('w');await delay(9000);await page.keyboard.up('w');assert.ok((await state()).position.x>5.3,'rover passes through rendered narrow open gate');
 await fs.mkdir('.run/barriers',{recursive:true});await page.getByRole('button',{name:'Chase',exact:true}).click();await page.screenshot({path:'.run/barriers/open-gate.png'});
 await group.stopChild(backend);data.elements.push(node(999,0,.22,{barrier:'bollard'}));await start(1);
 await page.waitForFunction(()=>window.worldInit?.overlay?.barrierFeatures?.some(b=>b.id==='node/999'));
 assert.equal((await state()).osm.spawnWarning,'','small vehicle clears nearby bollard');
 assert.equal(await page.evaluate(()=>window.barrierDisposed),true,'old barrier meshes dispose on world replacement');
 await page.selectOption('#vehicleSelect','heavy-crawler');await page.locator('#loadVehicle').click();
 await page.waitForFunction(()=>document.querySelector('#osmStatus').textContent.includes('intersects a mapped barrier'),null,{timeout:4000});
 assert.match((await state()).osm.spawnWarning,/mapped barrier/);
 await page.selectOption('#vehicleSelect','mn168');await page.locator('#loadVehicle').click();
 await page.waitForFunction(()=>!document.querySelector('#osmStatus').textContent.includes('intersects a mapped barrier'),null,{timeout:4000});
 assert.equal((await state()).osm.spawnWarning,'','old warning clears when switching back');
 await group.stopChild(backend);data={elements:[node(1,5,0,{barrier:'entrance'})]};await start(2);
 await page.waitForFunction(()=>window.worldInit?.overlay?.barrierFeatures?.length===1&&window.worldInit.overlay.barrierFeatures[0].type==='entrance');
 assert.equal(await page.locator('#osmAttribution').isVisible(),true,'entrance-only patches retain attribution');
 assert.equal(await page.evaluate(()=>window.worldInit.overlay.barriers.length),0,'entrances have no invented solid geometry');
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Barriers: shared transforms, map vectors, narrow-gate drive, spawn warning, live disposal, entrance-only attribution and mobile passed');
}finally{await browser?.close();await group.stop();if(overpass){overpass.closeAllConnections();await new Promise(r=>overpass.close(r));}await fs.rm(temp,{recursive:true,force:true});}
