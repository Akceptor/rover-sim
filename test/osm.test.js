import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {osm,terrain} from './fixtures/osm.js';
import {processOsm,buildingHeight,overlayGeometry,overlayOccupies,overlayKey,terrainProjection} from '../src/osm.js';
import {loadOsmOverlay} from '../src/osm-cache.js';
import {terrainHeight,terrainObjects} from '../src/terrain.js';

test('OSM uses importer projection: +X north, +Z east at the exact terrain origin',()=>{
 const project=terrainProjection({lat:50,lon:30});
 assert.ok(Math.hypot(...project(50,30))<1e-6);
 const north=project(50.001,30),east=project(50,30.001);
 assert.ok(Math.abs(north[0]-111.229)<.01&&Math.abs(north[1])<.01);
 assert.ok(Math.abs(east[1]-71.696)<.01&&Math.abs(east[0])<.01);
});
test('height precedence handles metres/feet, levels, invalid values and configured default',()=>{
 assert.equal(buildingHeight({height:'4.5 m','building:levels':'9'},8),4.5);
 assert.equal(buildingHeight({height:'20 ft'},8),6.096);
 assert.equal(buildingHeight({height:'oops','building:levels':'2'},8),6);
 assert.equal(buildingHeight({height:'-1','building:levels':'no'},8),8);
});
test('split and reversed multipolygon members preserve courtyard and suppress member duplicates',()=>{
 const o=processOsm(osm,terrain);assert.equal(o.buildings.length,2);
 const b=o.buildings.find(b=>b.id==='relation/20');assert.equal(b.holes.length,1);assert.equal(b.height,6);
 assert.equal(overlayOccupies({...o,roads:[]},9,0,0),false,'courtyard stays empty');
 assert.equal(overlayOccupies({...o,roads:[]},6,0,0),true,'building wall footprint occupied');
 assert.equal(overlayOccupies({...o,roads:[]},-12,-12,0),false,'concave notch stays empty');
});
test('roads select supported classes, skip bridges/tunnels and retain width and surface',()=>{
 const o=processOsm(osm,terrain);assert.deepEqual(o.roads.map(r=>r.highway),['residential','track','footway']);
 assert.equal(o.roads[0].width,5);assert.equal(o.roads[0].paved,true);assert.equal(o.roads[1].paved,false);
});
test('building mesh and prisms preserve holes; roads lie exactly above terrain triangles on slopes',()=>{
 const t={...terrain,heights:terrain.heights.map((_,i)=>{const x=Math.floor(i/33)-16,z=i%33-16;return x*z*.02;})};
 const o=processOsm(osm,t),g=overlayGeometry(o,t),b=g.buildings[0];
 assert.ok(b.prisms.length>0);assert.ok(b.vertices.length>0);
 for(const prism of b.prisms){const [a,c,d]=[0,3,6].map(i=>[prism[i],prism[i+2]]);const centre=[(a[0]+c[0]+d[0])/3,(a[1]+c[1]+d[1])/3];assert.ok(!(centre[0]>7.01&&centre[0]<11.99&&Math.abs(centre[1])<3.99));}
 for(const road of g.roads)for(let i=0;i<road.vertices.length;i+=3){const [x,y,z]=road.vertices.slice(i,i+3);assert.ok(Math.abs(y-terrainHeight(t,x,z)-.035)<1e-6);}
 for(let i=0;i<b.vertices.length;i+=3)if(b.vertices[i+1]===b.bottom)assert.ok(b.bottom<=terrainHeight(t,b.vertices[i],b.vertices[i+2]));
});
test('generated trees and rocks respect footprint and road clearance; no-overlay behavior remains deterministic',()=>{
 const o=processOsm(osm,terrain);const plain=terrainObjects(terrain),filtered=terrainObjects(terrain,o);
 assert.ok(filtered.length<plain.length);assert.deepEqual(terrainObjects(terrain),plain);
 for(const v of filtered.filter(v=>v.kind==='tree'||v.kind==='rock'))assert.equal(overlayOccupies(o,v.position[0],v.position[2],v.kind==='tree'?v.size[1]*.32:Math.max(...v.size)),false);
});
test('separate validated overlay cache reuses data offline and keys origin, bounds and schema',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-cache-'));let calls=0;
 try{
 const fetcher=async()=>{calls++;return new Response(JSON.stringify(osm));};
 const first=await loadOsmOverlay(terrain,{cacheDir:dir,fetcher});assert.equal(first.status,'ready');assert.equal(first.cached,false);
 const second=await loadOsmOverlay(terrain,{cacheDir:dir,fetcher:()=>{throw Error('offline');}});assert.equal(second.cached,true);assert.deepEqual(first.overlay,second.overlay);assert.equal(calls,1);
 assert.notEqual(overlayKey(terrain),overlayKey({...terrain,spacing:6}));assert.notEqual(overlayKey(terrain),overlayKey({...terrain,home:{...terrain.home,lon:1}}));assert.notEqual(overlayKey(terrain),overlayKey(terrain,2));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('failed/limited/partial downloads leave terrain usable, do not poison cache and allow retry; empty is valid',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-fail-'));
 try{
 for(const response of [()=>{throw Error('offline');},()=>new Response('busy',{status:429}),()=>new Response('bad',{status:504}),()=>new Response('{'),()=>new Response(JSON.stringify({elements:[],remark:'runtime error: timed out'}))]){
 const result=await loadOsmOverlay(terrain,{cacheDir:dir,fetcher:response});assert.equal(result.status,'error');assert.equal(result.overlay,null);
 assert.deepEqual(await fs.readdir(dir),[]);
 }
 const empty=await loadOsmOverlay(terrain,{cacheDir:dir,fetcher:async()=>new Response('{"elements":[]}')});assert.equal(empty.status,'empty');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('solid footprint colliders stop the driven rover at the rendered wall and leave courtyard/notch empty',async()=>{
 const {Physics}=await import('../src/physics.js');const {loadConfig}=await import('../src/config.js');
 const o=processOsm(osm,terrain),p=await Physics.create(loadConfig().vehicle,false,terrain,o);
 try{
 for(let i=0;i<900;i++)p.step(.01,1,0);
 assert.ok(p.state().position.x<4.9,'rover stopped by the wall at north=5');assert.ok(p.state().position.x>4,'rover reached building');
 // Raycasts in the empty courtyard and concave notch must hit terrain, not a roof or solid box.
 const R=(await import('@dimforge/rapier3d-compat')).default;
 for(const [x,z]of [[9,0],[-12,-12]]){const hit=p.world.castRay(new R.Ray({x,y:20,z},{x:0,y:-1,z:0}),30,true);assert.ok(hit.timeOfImpact>19.9);}
 }finally{p.free();}
});

test('a mapped gap in a concave courtyard building permits driving inside before hitting the back wall',async()=>{
 const {Physics}=await import('../src/physics.js'),{loadConfig}=await import('../src/config.js');
 const o={version:1,roads:[],buildings:[{id:'gap',outer:[[5,-5],[15,-5],[15,5],[5,5],[5,2],[12,2],[12,-2],[5,-2]],holes:[],height:6}]};
 const p=await Physics.create(loadConfig().vehicle,false,terrain,o);
 try{for(let i=0;i<1600;i++)p.step(.01,1,0);assert.ok(p.state().position.x>11&&p.state().position.x<12,'open courtyard remains accessible');}finally{p.free();}
});
test('download timeout returns a retryable error without caching partial data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-timeout-'));
 try{const result=await loadOsmOverlay(terrain,{cacheDir:dir,timeoutMs:5,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('unbounded download')),1000);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});})});assert.equal(result.status,'error');assert.match(result.message,/time/i);assert.deepEqual(await fs.readdir(dir),[]);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('configured fallback height has its own cache entry, so changing it takes effect offline only for matching settings',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-height-'));
 const response={elements:[...osm.elements.filter(e=>e.type==='node'),{type:'way',id:99,nodes:[1,2,3,4,1],tags:{building:'yes'}}]};
 try{const a=await loadOsmOverlay(terrain,{cacheDir:dir,defaultHeight:6,fetcher:async()=>new Response(JSON.stringify(response))});const b=await loadOsmOverlay(terrain,{cacheDir:dir,defaultHeight:9,fetcher:async()=>new Response(JSON.stringify(response))});assert.equal(a.overlay.buildings[0].height,6);assert.equal(b.overlay.buildings[0].height,9);assert.equal(b.cached,false);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
