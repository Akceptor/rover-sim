import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {barriersOsm,terrain,node} from './fixtures/barriers.js';
import {processOsm,overlayGeometry,overlayOccupies} from '../src/osm.js';
import {loadOsmOverlay,validateOsmOverlay,overpassQuery} from '../src/osm-cache.js';
import {Physics} from '../src/physics.js';
import {resolveVehicle} from '../src/vehicles.js';
import {mapData} from '../src/map-data.js';

test('barriers retain type, dimensions and gate state without filling mapped openings',()=>{
 const o=processOsm(barriersOsm,terrain);assert.ok(o.barriers?.length>5);
 assert.match(overpassQuery(terrain),/barrier/);
 const gate=o.barriers.find(b=>b.id==='node/102');assert.equal(gate.open,true);assert.ok(Math.abs(Math.hypot(...gate.points[1].map((v,i)=>v-gate.points[0][i]))-1)<.001);
 const bollard=o.barriers.find(b=>b.id==='node/120');assert.equal(bollard.height,.8);assert.equal(bollard.width,.15);
 assert.equal(overlayOccupies(o,5,0,.2),false,'open gate is passable');assert.equal(overlayOccupies(o,5,3,.2),true,'fence remains');
 assert.equal(overlayOccupies(o,-20,0,.2),false,'entrance remains empty');
 const map=mapData(terrain,o);assert.equal(map.barriers.length,o.barriers.length);
});

test('opening width propagates over short segments and an unlocked gate stays closed',()=>{
 const elements=[...Array.from({length:11},(_,i)=>node(i+1,10,-5+i,i===5?{barrier:'gate',locked:'no',width:'6'}:undefined)),{type:'way',id:50,nodes:Array.from({length:11},(_,i)=>i+1),tags:{barrier:'wall'}}];
 const o=processOsm({elements},terrain),gate=o.barriers.find(b=>b.id==='node/6');assert.equal(gate.open,false);
 assert.equal(overlayOccupies({...o,barriers:o.barriers.filter(b=>b.type==='wall')},10,2,.1),false,'parent wall does not close the six-metre gate');
 assert.equal(overlayOccupies(o,10,2,.1),true,'closed gate supplies its own panel');
});

test('barrier-only patches cache and save offline, while malformed fields fail validation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'barriers-'));
 try{
  const result=await loadOsmOverlay(terrain,{cacheDir:dir,bundledDir:null,fetcher:async()=>new Response(JSON.stringify(barriersOsm))});assert.equal(result.status,'ready');
  const cached=await loadOsmOverlay(terrain,{cacheDir:dir,bundledDir:null,fetcher:()=>assert.fail('offline')});assert.deepEqual(cached.overlay,result.overlay);
  for(const barriers of [{},[{id:'bad',type:'wall',points:[[0,0],[1,1]],height:Infinity}],[null]])assert.throws(()=>validateOsmOverlay({...result.overlay,barriers},terrain),/cache/);
  const {SavedLocations}=await import('../src/saved-locations.js'),store=new SavedLocations({directory:path.join(dir,'saved')}),t={...terrain,colors:Array(terrain.heights.length*3).fill(100)};
  const saved=await store.save({name:'Barrier map',terrain:t,overlay:result.overlay});assert.deepEqual((await store.read(saved.id)).overlay,result.overlay);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('visible shapes stop the rover and an open narrow gate permits passage',async()=>{
 for(const open of [true,false]){
  const data=structuredClone(barriersOsm);data.elements.find(e=>e.id===102).tags.open=open?'yes':'no';
  const o=processOsm(data,terrain),p=await Physics.create(resolveVehicle('mn168'),false,terrain,o);
  try{for(let i=0;i<1800;i++)p.step(.01,1,0);const x=p.state().position.x;
   assert.ok(open?x>14&&x<15:x>4&&x<5,`${open?'open':'closed'} gate stopped at ${x}`);
  }finally{p.free();}
 }
});

test('sloping barrier foundations and spawn warning match the shared shape geometry',async()=>{
 const t={...terrain,heights:terrain.heights.map((_,i)=>(Math.floor(i/33)-16)*.4+(i%33-16)*.2)};
 const o=processOsm({elements:[node(1,0,-20),node(2,0,20),{type:'way',id:10,nodes:[1,2],tags:{barrier:'wall'}}]},t);
 const g=overlayGeometry(o,t);assert.ok(g.barriers?.length>10);
 const {barrierSpawnWarning}=await import('../src/barrier-geometry.js');assert.match(barrierSpawnWarning(g.barriers,resolveVehicle('mn168')),/intersects.*mapped barrier/i);
 assert.equal(barrierSpawnWarning(overlayGeometry(processOsm(barriersOsm,terrain),terrain).barriers,resolveVehicle('mn168')),'');
 for(const box of g.barriers)assert.ok(box.size.every(v=>Number.isFinite(v)&&v>0));
 const p=await Physics.create(resolveVehicle('mn168'),false,t,o);
 try{p.step(.005,0,0);const R=(await import('@dimforge/rapier3d-compat')).default,{terrainHeight}=await import('../src/terrain.js');
  for(const z of [-19.5,-10.3,-.2,8.7,19.5]){
   const y=terrainHeight(t,0,z)+.03,hit=p.world.castRay(new R.Ray({x:-5,y,z},{x:1,y:0,z:0}),6,true);
   assert.ok(hit&&hit.timeOfImpact<5,`no gap under wall at east ${z}`);
  }
 }finally{p.free();}
});

test('fence, bollard and block colliders stop actual driving',async()=>{
 for(const type of ['fence','bollard','block']){
  const elements=type==='fence'?[node(1,5,-10),node(2,5,10),{type:'way',id:10,nodes:[1,2],tags:{barrier:type}}]:[node(1,5,0,{barrier:type})];
  const p=await Physics.create(resolveVehicle('mn168'),false,terrain,processOsm({elements},terrain));
  try{for(let i=0;i<1400;i++)p.step(.01,1,0);assert.ok(p.state().position.x>4&&p.state().position.x<5,`${type}: ${p.state().position.x}`);}finally{p.free();}
 }
});

test('gate ways do not duplicate gate nodes; closed-way entrances preserve their gap',()=>{
 const elements=[node(1,10,-10),node(2,10,0,{barrier:'gate',open:'yes',width:'4'}),node(3,10,10),node(4,10,-2),node(5,10,2),
  {type:'way',id:10,nodes:[1,2,3],tags:{barrier:'wall'}},{type:'way',id:11,nodes:[4,2,5],tags:{barrier:'gate',open:'yes'}}];
 const o=processOsm({elements},terrain);assert.equal(o.barriers.some(b=>b.id==='node/2'),false);assert.equal(overlayOccupies(o,10,0,.2),false);
 const closed=[node(1,10,0,{barrier:'entrance',width:'4'}),node(2,10,10),node(3,20,10),node(4,20,0),{type:'way',id:1,nodes:[1,2,3,4,1],tags:{barrier:'wall'}}];
 const ring=processOsm({elements:closed},terrain);assert.equal(overlayOccupies(ring,10,.5,.1),false);assert.equal(overlayOccupies(ring,10.5,0,.1),false);
});

test('point obstacles take priority at the segment cap and are not consumed by entrance ways',()=>{
 const elements=Array.from({length:2049},(_,i)=>node(i+1,20,-70+140*i/2048));
 elements.push({type:'way',id:1,nodes:elements.map(e=>e.id),tags:{barrier:'wall'}},node(9999,5,0,{barrier:'gate'}));
 assert.ok(processOsm({elements},terrain).barriers.some(b=>b.id==='node/9999'));
 const opening=[node(1,10,-2),node(2,10,0,{barrier:'bollard'}),node(3,10,2),{type:'way',id:1,nodes:[1,2,3],tags:{barrier:'entrance'}}];
 assert.ok(processOsm({elements:opening},terrain).barriers.some(b=>b.type==='bollard'));
});

test('spawn feedback does not flag posts outside a clear narrow opening',async()=>{
 const {barrierSpawnWarning}=await import('../src/barrier-geometry.js');
 const open=processOsm({elements:[node(1,0,0,{barrier:'gate',width:'0.4',open:'yes'})]},terrain);
 assert.equal(barrierSpawnWarning(overlayGeometry(open,terrain).barriers,resolveVehicle('mn168')),'');
 open.barriers[0].open=false;assert.match(barrierSpawnWarning(overlayGeometry(open,terrain).barriers,resolveVehicle('mn168')),/intersects/);
});

test('gate-way openings follow their real span rather than a tagged endpoint',()=>{
 const elements=[node(1,10,-10),node(2,10,-2,{barrier:'gate',open:'yes'}),node(3,10,2),node(4,10,10),{type:'way',id:1,nodes:[1,2,3,4],tags:{barrier:'wall'}},{type:'way',id:2,nodes:[2,3],tags:{barrier:'gate',open:'yes'}}];
 for(const both of [false,true]){
  if(both)elements[2].tags={barrier:'gate',open:'yes'};
  const o=processOsm({elements},terrain);assert.equal(overlayOccupies(o,10,1.7,.1),false);assert.equal(overlayOccupies(o,10,-3,.1),true,'wall beside actual gate remains');
 }
});

test('entrance ways preserve a closed gate node',()=>{
 const elements=[node(1,10,-3),node(2,10,0,{barrier:'gate',width:'2'}),node(3,10,3),{type:'way',id:1,nodes:[1,2,3],tags:{barrier:'entrance'}}];
 const o=processOsm({elements},terrain);assert.ok(o.barriers.some(b=>b.type==='gate'));assert.equal(overlayOccupies(o,10,0,.1),true);assert.ok(overlayGeometry(o,terrain).barriers.length>0);
});

test('explicit gate-way state overrides member nodes and unrelated open tags are ignored',()=>{
 const fixture=(wayOpen,nodeTags)=>({elements:[node(1,10,-2,nodeTags),node(2,10,2),{type:'way',id:10,nodes:[1,2],tags:{barrier:'gate',...(wayOpen===undefined?{}:{open:wayOpen})}}]});
 for(const [wayOpen,nodeTags,expected]of [
  ['no',{barrier:'gate',open:'yes'},false],
  [undefined,{open:'yes'},false],
  [undefined,{barrier:'gate',open:' YES '},true],
  ['yes',{barrier:'gate',open:'no'},true],
 ]){
  const o=processOsm(fixture(wayOpen,nodeTags),terrain);
  assert.equal(o.barriers.find(b=>b.id.startsWith('way/10/')).open,expected);
  assert.equal(overlayOccupies(o,10,0,.1),!expected,'gate panel matches resolved state');
 }
});
