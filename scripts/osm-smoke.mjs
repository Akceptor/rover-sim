#!/usr/bin/env node
// All Overpass traffic goes to a local fixture server. Live data must be downloaded separately.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {osm,terrain as fixture} from '../test/fixtures/osm.js';
import {terrainHeight} from '../src/terrain.js';
const group=new ProcessGroup({graceMs:2000}),temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-osm-browser-'));
let browser,overpass;
const live=process.env.ROVER_OSM_TERRAIN;
try{
 overpass=http.createServer((req,res)=>{req.resume();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(osm));});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const t=live?JSON.parse(await fs.readFile(live)): {...fixture,heights:fixture.heights.map((_,i)=>(Math.floor(i/33)-16)*(i%33-16)*.02)};
 const file=path.join(temp,'terrain.json');await fs.writeFile(file,JSON.stringify(t));
 const config=JSON.parse(await fs.readFile('config/default.json'));config.savedLocationsDir=path.join(temp,'saved-locations');config.httpPort=8106;config.mavlink=null;config.terrain=file;
 config.osm={endpoint:`http://127.0.0.1:${overpass.address().port}`,cacheDir:live?path.resolve('.run/osm-cache'):path.join(temp,'osm-cache')};
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8106';let state;
 for(let i=0;i<200;i++){try{state=await fetch(url+'/api/state').then(r=>r.json());if(state.osm.status==='ready')break;}catch{}await delay(50);}
 assert.equal(state?.osm.status,'ready',JSON.stringify(state?.osm));
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#osmAttribution').hidden);
 assert.equal(await page.locator('#osmAttribution a').getAttribute('href'),'https://www.openstreetmap.org/copyright');
 await page.waitForFunction(async()=>{const {fpvOutput}=await import('/app.js');const buildings=[];fpvOutput.scene.traverse(o=>{if(o.name.startsWith('osm-building:'))buildings.push(o);});return buildings.length&&buildings.every(o=>o.geometry.attributes.uv?.count===o.geometry.attributes.position.count&&o.material.every(m=>m.map?.userData.photoReady));});
 const geometry=await page.evaluate(async()=>{const {fpvOutput}=await import('/app.js');const roads=[],buildings=[];fpvOutput.scene.traverse(o=>{if(o.name.startsWith('osm-road:'))roads.push(Array.from(o.geometry.attributes.position.array));if(o.name.startsWith('osm-building:'))buildings.push({name:o.name,vertices:o.geometry.attributes.position.count,groups:o.geometry.groups.length});});return {roads,buildings};});
 assert.ok(geometry.roads.length&&geometry.buildings.length);assert.ok(geometry.buildings.every(b=>b.groups===3),'separate facade, roof and foundation materials');
 for(const vertices of geometry.roads)for(let i=0;i<vertices.length;i+=3){const [x,y,z]=vertices.slice(i,i+3);assert.ok(Math.abs(y-terrainHeight(t,x,z)-.035)<.001,'road follows exact terrain surface');}
 await page.screenshot({path:live?'.run/osm-town/fpv.png':'.run/osm-fixture-fpv.png'});
 if(!live){
  await page.locator('#viewport').click();await page.keyboard.down('w');await delay(9500);await page.keyboard.up('w');
  const stopped=await fetch(url+'/api/state').then(r=>r.json());assert.ok(stopped.position.x>4&&stopped.position.x<4.9,JSON.stringify(stopped.position));
  await page.screenshot({path:'.run/osm-fixture-wall.png'});
 }
 // Separate overhead render for visual inspection, preserving the actual terrain and overlay meshes.
 const overview=await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js'),T=await import('/three.js');const c=new T.PerspectiveCamera(55,16/9,.1,3000);c.position.set(0,liveExtent(),.001);c.up.set(1,0,0);c.lookAt(0,0,0);function liveExtent(){const a=f.scene.getObjectByName('real-terrain').geometry.attributes.position;return Math.max(70,Math.abs(a.getX(0))*2.2);}const fog=f.scene.fog;f.scene.fog=null;const light=new T.AmbientLight(0xffffff,2);f.scene.add(light);f.renderer.render(f.scene,c);const result=f.canvas.toDataURL('image/png').split(',')[1];f.scene.remove(light);f.scene.fog=fog;return result;});
 await fs.writeFile(live?'.run/osm-town/overview.png':'.run/osm-fixture-overview.png',Buffer.from(overview,'base64'));
 assert.deepEqual(errors,[]);console.log(`OSM browser: ${geometry.buildings.length} buildings, ${geometry.roads.length} roads; terrain alignment, linked attribution, ${live?'cached town visual check':'FPV wall collision'} passed`);
}finally{await browser?.close();await group.stop();if(overpass){overpass.closeAllConnections();await new Promise(r=>overpass.close(r));}await fs.rm(temp,{recursive:true,force:true});}
