import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {landcoverOsm,terrain} from './fixtures/landcover.js';
import {processOsm,overlayGeometry,overlayOccupies} from '../src/osm.js';
import {terrainObjects} from '../src/terrain.js';
import {loadOsmOverlay,validateOsmOverlay,overpassQuery} from '../src/osm-cache.js';
import {createRoadIndex} from '../src/road-index.js';
import {SavedLocations} from '../src/saved-locations.js';

test('landcover importer retains reversed multipolygon holes and mapped tree/row points',()=>{
 const o=processOsm(landcoverOsm,terrain);
 assert.equal(o.landcover?.length,5);
 assert.equal(o.landcover.find(a=>a.id==='relation/301').holes.length,1);
 assert.ok(o.trees.some(t=>t.id==='node/151'&&t.height===8));
 assert.ok(o.trees.some(t=>t.source==='row'));
 assert.deepEqual(overlayGeometry(o,terrain).landcover,o.landcover);
 assert.match(overpassQuery(terrain),/tree_row/);assert.match(overpassQuery(terrain),/farmland/);
});

test('polygon lookup respects holes, open-area priority and patch boundaries',async()=>{
 const {createLandcoverIndex}=await import('../src/landcover.js');
 const o=processOsm(landcoverOsm,terrain);
 for(const areas of [o.landcover,[...o.landcover].reverse()]){
  const at=createLandcoverIndex(areas,terrain);
  assert.equal(at(50,-30).kind,'forest');assert.equal(at(20,0),null);
  assert.equal(at(-30,30).kind,'farmland');assert.equal(at(50,30).kind,'water');
  assert.equal(at(-30,-30).kind,'scrub');assert.equal(at(0,30).kind,'grass');assert.equal(at(81,0),null);
 }
});

test('vegetation is deterministic, capped and clear of roads/buildings/spawn, fields and water',()=>{
 const o=processOsm(landcoverOsm,terrain);
 o.roads.push({id:'road',points:[[-75,0],[75,0]],width:6,paved:true});
 o.buildings.push({id:'house',outer:[[35,-50],[55,-50],[55,-35],[35,-35]],holes:[],height:6});
 const a=terrainObjects(terrain,o),b=terrainObjects(terrain,structuredClone(o));assert.deepEqual(a,b);
 const trees=a.filter(t=>t.kind==='tree');assert.ok(trees.some(t=>t.vegetation==='forest'),'mapped forest is populated');
 assert.ok(trees.some(t=>t.vegetation==='scrub'),'mapped scrub is populated');assert.ok(trees.length<=512);
 const explicit=trees.filter(t=>t.osmId);assert.ok(explicit.some(t=>t.osmId==='node/151'));
 assert.equal(explicit.some(t=>t.osmId==='node/152'),false,'nearby mapped duplicates suppressed');
 for(const t of trees){
  const [x,,z]=t.position;assert.ok(Math.hypot(x,z)>=8);
  assert.equal(overlayOccupies(o,x,z,t.size[1]*.32),false);
  if(!t.osmId){assert.ok(!(x>-65&&x<-10&&z>10&&z<65),'field stays open');assert.ok(!(x>40&&x<65&&z>20&&z<60),'water stays open');}
 }
});

test('landcover-only downloads and saved packages remain ready offline; optional fields are validated',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'landcover-'));
 try{
  const result=await loadOsmOverlay(terrain,{cacheDir:path.join(dir,'cache'),bundledDir:null,fetcher:async()=>new Response(JSON.stringify(landcoverOsm))});
  assert.equal(result.status,'ready');assert.ok(result.overlay.landcover.length);
  const offline=await loadOsmOverlay(terrain,{cacheDir:path.join(dir,'cache'),bundledDir:null,fetcher:()=>assert.fail('no network')});assert.deepEqual(offline.overlay,result.overlay);
  const store=new SavedLocations({directory:path.join(dir,'saved')}),t={...terrain,colors:Array(terrain.heights.length*3).fill(123)};
  const saved=await store.save({name:'Mapped forest',terrain:t,overlay:result.overlay});assert.deepEqual((await store.read(saved.id)).overlay,result.overlay);
  for(const patch of [{landcover:{}},{trees:'bad'},{landcover:[{id:'bad',kind:'forest',outer:[[0,0]],holes:[]}]},{trees:[{id:'bad',point:[NaN,0],height:4,source:'node'}]}])assert.throws(()=>validateOsmOverlay({...result.overlay,...patch},terrain),/cache/i);
  const old={...result.overlay};delete old.landcover;delete old.trees;assert.equal(validateOsmOverlay(old,terrain),old);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('land cover supplies off-road material while mapped roads take precedence',()=>{
 const grass={id:'grass',kind:'grass',outer:[[-70,-70],[70,-70],[70,70],[-70,70]],holes:[]};
 const o={landcover:[grass],roads:[{id:'road',surface:'asphalt',paved:true,width:4,points:[[-70,0],[70,0]]}]};
 const at=createRoadIndex(o,terrain);assert.equal(at(20,0).id,'asphalt');assert.equal(at(20,20).id,'grass');
 assert.equal(createRoadIndex({landcover:[{...grass,kind:'farmland'}],roads:[]},terrain)(20,20).id,'dirt');
});

test('mapped vegetation has physical trunks and landcover contacts use terrain height for effects',async()=>{
 const {Physics}=await import('../src/physics.js'),{resolveVehicle}=await import('../src/vehicles.js'),R=(await import('@dimforge/rapier3d-compat')).default;
 const o=processOsm(landcoverOsm,terrain),objects=terrainObjects(terrain,o),p=await Physics.create(resolveVehicle('mn168'),true,terrain,o);
 try{
  for(let i=0;i<2;i++)p.step(.005,0,0);
  const tree=objects.find(o=>o.osmId==='node/151'),[x,y,z]=tree.position;
  const hit=p.world.castRay(new R.Ray({x,y:45,z},{x:0,y:-1,z:0}),50,true);
  assert.ok(Math.abs(hit.timeOfImpact-(45-y-tree.size[1]/2))<.02,'collider top matches rendered trunk');
  p.body.setTranslation({x:0,y:p.spawnHeight(),z:30},true);
  for(let i=0;i<300;i++)p.step(.005,0,0);
  const contacts=p.state().groundContacts;assert.ok(contacts.length);assert.ok(contacts.every(c=>c.surface==='grass'&&c.offset===0));
 }finally{p.free();}
});

test('large forests and crossing tree rows are bounded; incomplete polygons stay open',()=>{
 const t={...terrain,size:257,spacing:100,heights:Array(257**2).fill(0)};
 const o={buildings:[],roads:[],trees:[],landcover:[{id:'forest',kind:'forest',outer:[[-20000,-20000],[20000,-20000],[20000,20000],[-20000,20000]],holes:[]}]};
 assert.equal(terrainObjects(t,o).filter(o=>o.kind==='tree').length,512);
 const data=structuredClone(landcoverOsm);data.elements.push({type:'way',id:900,nodes:[101,102,103],tags:{landuse:'forest'}});
 assert.equal(processOsm(data,terrain).landcover.length,5,'open way is not artificially closed');
 data.elements.push({type:'node',id:901,lat:0,lon:-9},{type:'node',id:902,lat:0,lon:9},{type:'way',id:903,nodes:[901,902],tags:{natural:'tree_row'}});
 const trees=processOsm(data,terrain).trees.filter(t=>t.id.startsWith('row/903/'));assert.ok(trees.length>20&&trees.length<30);assert.ok(trees.every(t=>Math.abs(t.point[1])<=80));
});

test('a standalone mapped tree counts as nonempty while legacy empty overlays preserve scenery',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mapped-tree-'));
 try{
  const node=landcoverOsm.elements.find(e=>e.id===151),result=await loadOsmOverlay(terrain,{cacheDir:dir,bundledDir:null,fetcher:async()=>new Response(JSON.stringify({elements:[node]}))});
  assert.equal(result.status,'ready');assert.equal(result.overlay.trees.length,1);assert.equal(result.overlay.landcover.length,0);
  const baseline=terrainObjects(terrain),empty={roads:[],buildings:[]};assert.deepEqual(terrainObjects(terrain,empty),baseline);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('tree rows keep six-metre spacing across short segments',()=>{
 const nodes=Array.from({length:11},(_,i)=>({type:'node',id:1000+i,lat:40/110574.2758,lon:(-40+i*2)/111319.4908}));
 const o=processOsm({elements:[...nodes,{type:'way',id:1100,nodes:nodes.map(n=>n.id),tags:{natural:'tree_row'}}]},terrain);
 assert.equal(o.trees.length,4);for(let i=1;i<o.trees.length;i++)assert.ok(Math.abs(Math.hypot(...o.trees[i].point.map((v,j)=>v-o.trees[i-1].point[j]))-6)<.01);
});

test('nearby distinct mapped trees are retained even when their crowns overlap',()=>{
 const data=structuredClone(landcoverOsm),node=structuredClone(data.elements.find(e=>e.id===151));node.id=155;node.lon+=1.5/111319.4908;data.elements.push(node);
 const trees=terrainObjects(terrain,processOsm(data,terrain)).filter(o=>o.osmId);
 assert.ok(trees.some(o=>o.osmId==='node/151'));assert.ok(trees.some(o=>o.osmId==='node/155'));
 assert.equal(trees.some(o=>o.osmId==='node/152'),false,'sub-metre duplicate still removed');
});

test('oversized polygons are skipped before unbounded bounding-box argument expansion',async()=>{
 const {processLandcover}=await import('../src/osm-landcover.js');
 const huge=Array.from({length:140000},(_,i)=>[Math.cos(i)*40,Math.sin(i)*40]);
 const ways=new Map([[1,{id:1,nodes:[1,2,3,1],tags:{landuse:'forest'}}]]);
 assert.deepEqual(processLandcover({elements:[]},terrain,new Map(),ways,()=>huge).landcover,[]);
});
