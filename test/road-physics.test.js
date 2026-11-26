import {test} from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import {Physics} from '../src/physics.js';
import {resolveVehicle} from '../src/vehicles.js';
import {terrain} from './fixtures/osm.js';

const overlay=surface=>({version:1,buildings:[],roads:[{id:'road',surface,paved:surface==='asphalt',width:20,points:[[-70,0],[70,0]]}]});
const step=(p,n,throttle=0)=>{for(let i=0;i<n;i++)p.step(.005,throttle,0);return p.state();};
async function drive(profile,surface,patch,action){
 const p=await Physics.create(resolveVehicle({profile,...patch}),false,terrain,overlay(surface));
 try{step(p,400);return action(p);}finally{p.free();}
}
test('mapped mud limits actual wheel, multi-ray and track acceleration',async()=>{
 for(const [profile,contactModel]of [['mn168','ray'],['mn168','multi-ray'],['tracked-crawler','ray']]){
  const launch=surface=>drive(profile,surface,{contactModel,engineForce:1000,maxSpeed:30,rollingResistance:0},p=>step(p,60,1).speed);
  const asphalt=await launch('asphalt'),mud=await launch('mud');
  assert.ok(asphalt>mud*1.3,`${profile}/${contactModel}: asphalt ${asphalt}, mud ${mud}`);
 }
});
test('mapped sand increases coasting loss for both drivetrains',async()=>{
 for(const profile of ['mn168','tracked-crawler']){
  const coast=surface=>drive(profile,surface,{brakeImpulse:0,rollingResistance:2},p=>{p.body.setLinvel({x:1,y:0,z:0},true);return step(p,40).speed;});
  const asphalt=await coast('asphalt'),sand=await coast('sand');
  assert.ok(sand<asphalt-.02,`${profile}: asphalt ${asphalt}, sand ${sand}`);
 }
});
test('terrain contact telemetry reports material per side and excludes roof/air contacts',async()=>{
 for(const profile of ['mn168','tracked-crawler']){
  const o=overlay('mud');o.roads[0].width=.16;o.roads[0].points=[[-70,-.13],[70,-.13]];
  const p=await Physics.create(resolveVehicle(profile),false,terrain,o);
  try{
   let s=step(p,400);assert.ok(s.groundContacts?.some(c=>c.surface==='mud'),profile);
   assert.ok(s.groundContacts.some(c=>c.surface==='ground'),profile);
   assert.ok(s.groundContacts.every(c=>Math.abs(c.position.y)<.01));
   p.world.createCollider(R.ColliderDesc.cuboid(2,.1,2).setTranslation(0,.5,0));
   p.body.setTranslation({x:0,y:.6+p.spawnHeight(),z:0},true);p.body.setLinvel({x:0,y:0,z:0},true);
   s=step(p,400);assert.equal(s.groundContacts.length,0,'roof has no road surface or ground dust');
   p.body.setTranslation({x:0,y:8,z:0},true);p.body.setLinvel({x:1,y:0,z:0},true);
   s=step(p,10,1);assert.equal(s.groundContacts.length,0);assert.ok(s.speed<1.01,'no airborne propulsion');
  }finally{p.free();}
 }
});

test('multi-ray wheels resolve material independently at their front, middle and rear samples',async()=>{
 const c=resolveVehicle({profile:'mn168',contactModel:'multi-ray'}),o=overlay('mud');
 o.roads[0].width=.02;o.roads[0].points=[[c.wheelbase/2,-70],[c.wheelbase/2,70]];
 const p=await Physics.create(c,false,terrain,o);
 try{step(p,400);const [front]=p.wheelGroups,grips=front.map(i=>p.car.wheelFrictionSlip(i));
  assert.ok(grips[1]<grips[0]*.5);assert.equal(grips[0],grips[2]);
 }finally{p.free();}
});

test('tracked rays within suspension reach but carrying no load produce no ground effects',async()=>{
 const p=await Physics.create(resolveVehicle('tracked-crawler'),false,terrain,overlay('sand'));
 try{
  p.body.setTranslation({x:0,y:p.spawnHeight()+p.c.suspensionTuning.travel*.5,z:0},true);
  const s=step(p,2);
  assert.ok(s.tracks.flatMap(t=>t.contacts).every(c=>c.normalForce===0));
  assert.deepEqual(s.groundContacts,[],'ray proximity is not grounded support');
 }finally{p.free();}
});
