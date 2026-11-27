import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Physics} from '../src/physics.js';
import {resolveVehicle} from '../src/vehicles.js';
import {terrain} from './fixtures/osm.js';

function water(depth,minX=3,maxX=15){
 const vertices=[minX,.05,-8,maxX,.05,8,maxX,.05,-8,minX,.05,-8,minX,.05,8,maxX,.05,8];
 const feature={id:'water/test',type:'pond',depth,seasonal:false,vertices};
 return {buildings:[],roads:[],barriers:[],water:{features:[feature],omitted:0,mismatched:0}};
}
const overlay={buildings:[],roads:[],landcover:[],trees:[],barriers:[],water:[]};

test('unknown and deep water sink both drivetrains, latch lost controls and reset restores driving',async()=>{
 for(const id of ['mn168','tracked-crawler'])for(const depth of [null,.8]){
  const p=await Physics.create(resolveVehicle(id),false,terrain,overlay,water(depth));
  try{
   for(let i=0;i<1800;i++)p.step(.01,1,0);
   const failed=p.state();assert.equal(failed.water?.state,'submerged',`${id} depth ${depth}`);
   assert.equal(failed.water.controlsDisabled,true);assert.equal(failed.inputs.throttle,0);
   assert.ok(failed.position.y<-.5&&failed.position.y>=-2.01);
   assert.ok(Object.values(failed.sensor.position).every(Number.isFinite));
   const x=failed.position.x;for(let i=0;i<200;i++)p.step(.01,-1,1,{left:1,right:-1});
   assert.ok(Math.abs(p.state().position.x-x)<.001,'neither keyboard nor track actuation can escape latched failure');
   p.reset();assert.equal(p.state().water.controlsDisabled,false);
   for(let i=0;i<100;i++)p.step(.01,1,0);
   assert.ok(p.state().position.y>0,'terrain collision/support restored');assert.ok(p.state().position.x>0);
  }finally{p.free();}
 }
});

test('shallow water slows terrain contacts and suppresses dust/marks without sinking',async()=>{
 for(const id of ['mn168','tracked-crawler']){
  const dry=await Physics.create(resolveVehicle(id),false,terrain,overlay,water(0,-50,50));
  const wet=await Physics.create(resolveVehicle(id),false,terrain,overlay,water(.1,-50,50));
  try{
   for(let i=0;i<400;i++){dry.step(.01,.15,0);wet.step(.01,.15,0);}
   assert.equal(wet.state().water?.state,'shallow');assert.equal(wet.state().water.controlsDisabled,false);
   assert.ok(wet.state().position.x<dry.state().position.x,`${id} water resistance`);
   assert.ok(wet.state().groundContacts.every(c=>c.surface==='water'));
  }finally{dry.free();wet.free();}
 }
});

test('airborne vehicles over unknown water do not sink; simulation threshold is explicit',async()=>{
 const p=await Physics.create(resolveVehicle('mn168'),false,terrain,overlay,water(null,-50,50));
 const crossing=await Physics.create(resolveVehicle('mn168'),false,terrain,overlay,water(.3,-50,50),{maxCrossingDepth:.4});
 try{
  p.body.setTranslation({x:0,y:10,z:0},true);for(let i=0;i<10;i++)p.step(.01,1,0);
  assert.equal(p.state().water?.controlsDisabled,false);assert.ok(p.state().position.y>9);
  for(let i=0;i<100;i++)crossing.step(.01,1,0);
  assert.equal(crossing.state().water.state,'shallow');
 }finally{p.free();crossing.free();}
});

test('roof contacts above water stay dry and multi-ray terrain contacts sink',async()=>{
 const building={id:'building',outer:[[-15,-15],[15,-15],[15,15],[-15,15]],holes:[],height:2};
 const {overlayGeometry}=await import('../src/osm.js');
 const o={...overlay,buildings:[building]},g=overlayGeometry(o,terrain);g.water=water(null,-30,30).water;
 const roof=await Physics.create(resolveVehicle('mn168'),false,terrain,o,g);
 const c=resolveVehicle('mn168');c.contactModel='multi-ray';
 const multi=await Physics.create(c,false,terrain,overlay,water(null));
 try{
  roof.body.setTranslation({x:0,y:2+roof.spawnHeight()+.3,z:0},true);
  for(let i=0;i<200;i++)roof.step(.01,0,0);
  assert.equal(roof.state().water.controlsDisabled,false);assert.ok(roof.state().position.y>2);
  for(let i=0;i<1000;i++)multi.step(.01,1,0);
  assert.equal(multi.state().water.controlsDisabled,true);
 }finally{roof.free();multi.free();}
});

test('tracked rays in suspension travel without supporting load do not trigger sinking',async()=>{
 const p=await Physics.create(resolveVehicle('tracked-crawler'),false,terrain,overlay,water(null,-50,50));
 try{
  p.world.step();const c=p.c;
  p.body.setTranslation({x:0,y:c.trackGeometry.radius+c.suspension+c.suspensionTuning.travel/2,z:0},true);p.body.setLinvel({x:0,y:0,z:0},true);
  p.step(.005,0,0);assert.equal(p.state().water.controlsDisabled,false);
 }finally{p.free();}
});

test('water surface above an already submerged rover never teleports it upward',async()=>{
 const g=water(null,-30,30);for(const f of g.water.features)for(let i=1;i<f.vertices.length;i+=3)f.vertices[i]=10;
 const p=await Physics.create(resolveVehicle('mn168'),false,terrain,overlay,g);
 try{
  const initial=p.state().position.y;for(let i=0;i<50;i++)p.step(.005,1,0);
  assert.equal(p.state().water.controlsDisabled,true);assert.ok(p.state().position.y<=initial+.001);
 }finally{p.free();}
});
