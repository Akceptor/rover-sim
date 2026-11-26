import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {landcoverOsm,terrain} from '../test/fixtures/landcover.js';
import {terrainMesh} from '../src/terrain.js';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-landcover-')),group=new ProcessGroup();let browser,overpass;
try{
 overpass=http.createServer((req,res)=>{req.resume();res.end(JSON.stringify(landcoverOsm));});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const t={...terrain,colors:Array.from({length:terrain.heights.length*3},(_,i)=>110+i%25)};
 const file=path.join(temp,'terrain.json');await fs.writeFile(file,JSON.stringify(t));
 const config=JSON.parse(await fs.readFile('config/default.json'));
 Object.assign(config,{httpPort:8112,terrain:file,savedLocationsDir:path.join(temp,'saved'),osm:{endpoint:`http://127.0.0.1:${overpass.address().port}`,cacheDir:path.join(temp,'osm'),bundledDir:null}});
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8112';let state;
 for(let i=0;i<150;i++){try{state=await fetch(url+'/api/state').then(r=>r.json());if(state.osm.status==='ready')break;}catch{}await delay(50);}
 assert.equal(state?.osm.status,'ready','landcover-only patch is ready');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());
 await page.addInitScript(()=>{
  const Original=WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='init')window.worldInit=m;}catch{}});}};
  const fill=CanvasRenderingContext2D.prototype.fillText;window.capturedCredits=[];
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(String(text).includes('OpenStreetMap'))window.capturedCredits.push(text);return fill.call(this,text,...args);};
 });
 await page.goto(url);await page.waitForFunction(()=>window.worldInit?.overlay?.landcover?.length&&!document.querySelector('#osmAttribution').hidden);
 const inspect=()=>page.evaluate(async()=>{
  const {fpvOutput:f}=await import('/app.js'),T=await import('/three.js'),{computeTerrainVertexColors}=await import('/terrain-shading.js');
  const mesh=f.scene.getObjectByName('real-terrain'),positions=[],matrix=new T.Matrix4();
  f.scene.traverse(o=>{if(o.name==='instanced-tree')for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);positions.push([matrix.elements[12],matrix.elements[13],matrix.elements[14]].map(v=>Math.round(v*1e4)/1e4));}});
  const expected=window.worldInit.world.filter(o=>o.kind==='tree').map(o=>o.position.map(v=>Math.round(Math.fround(v)*1e4)/1e4));
  return {positions:positions.sort(),expected:expected.sort(),source:window.worldInit.terrain.colors,vertices:Array.from(mesh.geometry.attributes.position.array),indices:Array.from(mesh.geometry.index.array),tinted:Array.from(mesh.geometry.attributes.color.array),plain:Array.from(computeTerrainVertexColors(window.worldInit.terrain)),areas:window.worldInit.overlay.landcover.length,buildings:window.worldInit.overlay.buildings.length,roads:window.worldInit.overlay.roads.length};
 });
 const before=await inspect();assert.ok(before.positions.length>10);assert.deepEqual(before.positions,before.expected,'instanced tree positions equal backend collision objects');
 assert.equal(before.areas,5);assert.equal(before.buildings,0);assert.equal(before.roads,0);assert.notDeepEqual(before.tinted,before.plain);
 assert.deepEqual(before.source,t.colors);const geometry=terrainMesh(t);assert.deepEqual(before.vertices,Array.from(geometry.vertices));assert.deepEqual(before.indices,Array.from(geometry.indices));
 assert.equal(await page.locator('#osmAttribution a').getAttribute('href'),'https://www.openstreetmap.org/copyright');
 await page.locator('#settings').click();await page.locator('#videoToggle').click();await page.waitForFunction(()=>window.capturedCredits.length>0);assert.match(await page.evaluate(()=>window.capturedCredits[0]),/OpenStreetMap.*copyright/);await page.locator('#videoToggle').click();await page.locator('#closeSettings').click();
 await fs.mkdir('.run/landcover',{recursive:true});
 const overview=await page.evaluate(async()=>{
  const {fpvOutput:f}=await import('/app.js'),T=await import('/three.js'),c=new T.PerspectiveCamera(55,16/9,.1,1000);
  c.position.set(0,190,.001);c.up.set(1,0,0);c.lookAt(0,0,0);const fog=f.scene.fog;f.scene.fog=null;
  const light=new T.AmbientLight(0xffffff,2);f.scene.add(light);f.renderer.render(f.scene,c);const png=f.canvas.toDataURL().split(',')[1];f.scene.remove(light);f.scene.fog=fog;return png;
 });await fs.writeFile('.run/landcover/overview.png',Buffer.from(overview,'base64'));
 await page.reload();await page.waitForFunction(()=>window.worldInit?.overlay?.landcover?.length&&!document.querySelector('#osmAttribution').hidden);
 assert.deepEqual((await inspect()).positions,before.positions,'reload is deterministic');
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log(`Landcover: ${before.positions.length} shared tree instances, open fields, imagery tint, browser/FPV attribution, deterministic reload and mobile passed`);
}finally{await browser?.close();await group.stop();if(overpass){overpass.closeAllConnections();await new Promise(r=>overpass.close(r));}await fs.rm(temp,{recursive:true,force:true});}
