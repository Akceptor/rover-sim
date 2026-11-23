import {test} from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import {Physics} from '../src/physics.js';
import {resolveVehicle} from '../src/vehicles.js';
import {rotate} from '../src/frames.js';
const run=(p,seconds,t=0,s=0,tracks)=>{for(let i=0;i<seconds*100;i++)p.step(.01,t,s,tracks);return p.state();};
const using=async(id,fn)=>{const p=await Physics.create(resolveVehicle(id),false);try{run(p,2);await fn(p);}finally{p.free();}};

test('deadband, gradual start, neutral stop and brake-before-reverse',async()=>using('mn168',p=>{
 const origin=p.state().position.x;run(p,1,.02);assert.ok(Math.abs(p.state().position.x-origin)<.015);
 p.step(.01,1,0);assert.ok(p.state().driveDemand[0]>.0&&p.state().driveDemand[0]<.05);
 run(p,2,.4);assert.ok(p.state().speed>.12);const speed=p.state().speed;
 p.step(.01,-1,0);assert.equal(p.state().driveDemand[0],0);assert.ok(p.state().speed<speed+.01);
 run(p,3,-.5);assert.ok(p.state().speed<-.15);run(p,2);assert.ok(Math.abs(p.state().speed)<.04);
 p.reset();assert.deepEqual(p.state().driveDemand,[0]);
}));
test('wheeled front steering and profile dimensions follow state and real mass',async()=>using('heavy-crawler',p=>{
 const s=run(p,3,.5,.5);assert.ok(s.position.z>.1);assert.ok(s.heading>10&&s.heading<150);
 assert.equal(s.wheels.length,4);assert.equal(s.wheels[0].x,p.c.wheelbase/2);assert.ok(Math.abs(s.wheels[0].steering+p.c.maxSteer*.5)<1e-6);assert.equal(s.wheels[2].steering,0);assert.ok(Math.abs(p.body.mass()-p.c.mass)<1e-4);
}));
test('tracked independent outputs drive straight, turn gradually and pivot in place',async()=>using('tracked-crawler',p=>{
 let s=run(p,3,0,0,{left:.5,right:.5});assert.ok(s.position.x>.35);assert.ok(Math.abs(s.position.z)<.05);assert.ok(Math.abs(s.heading)<2||s.heading>358);
 p.reset();run(p,2);s=run(p,3,0,0,{left:.65,right:.3});assert.ok(s.heading>5&&s.heading<160);assert.ok(s.position.z>.05);
 p.reset();run(p,2);s=run(p,3,0,0,{left:.6,right:-.6});assert.ok(Math.abs(s.rotation.y)>.2);assert.ok(Math.hypot(s.position.x,s.position.z)<.12);assert.equal(s.tracks.length,2);assert.ok(s.tracks[0].distance*s.tracks[1].distance<0);
}));
test('no ground contact contributes no propulsion for either drivetrain',async()=>{
 for(const id of ['mn168','tracked-crawler'])await using(id,p=>{p.body.setTranslation({x:0,y:8,z:0},true);p.body.setLinvel({x:0,y:0,z:0},true);const s=run(p,.3,1,0);assert.ok(Math.abs(s.position.x)<.015);assert.ok(s.wheels.every(w=>!w.contact));assert.ok((s.tracks??[]).every(t=>t.contacts.every(c=>!c.contact)));});
});
test('small step, rock and slope stay finite with bounded support and partial track contact',async()=>{
 for(const id of ['mn168','heavy-crawler','tracked-crawler'])await using(id,p=>{
  p.world.createCollider(R.ColliderDesc.cuboid(.25,.008,1).setTranslation(.8,.008,0));
  p.world.createCollider(R.ColliderDesc.ball(.025).setTranslation(1.4,.005,-.12));
  p.world.createCollider(R.ColliderDesc.cuboid(.6,.03,.65).setTranslation(2.3,.07,0).setRotation({x:0,y:0,z:Math.sin(.05),w:Math.cos(.05)}));
  const s=run(p,7,.7,0);assert.ok(s.position.x>1.4,`${id} stopped at ${s.position.x}`);assert.ok(s.position.y>0&&s.position.y<.7);assert.ok(Object.values(s.velocity).every(Number.isFinite));
  if(id==='tracked-crawler'){
   p.reset();p.body.setTranslation({x:0,y:.3,z:0},true);
   p.world.createCollider(R.ColliderDesc.cuboid(.14,.12,.07).setTranslation(.1,.12,-p.c.track/2));
   const partial=run(p,.5);const contacts=partial.tracks.flatMap(t=>t.contacts);assert.ok(contacts.some(c=>c.contact));assert.ok(contacts.some(c=>!c.contact));
   assert.ok(contacts.every(c=>c.normalForce>=0&&c.normalForce<=p.c.suspensionTuning.maxForce));
  }
 });
});

test('neutral track resistance does not overshoot through zero at tiny speeds',async()=>using('tracked-crawler',p=>{
 p.body.setLinvel({x:.0001,y:0,z:0},true);p.step(.005,0,0);assert.ok(p.state().speed>=-.00001,`neutral reversed to ${p.state().speed}`);
}));
test('tracked spawn follows track radius, and multi-ray prototype crosses the ray-limited step',async()=>{
 const custom=resolveVehicle({profile:'tracked-crawler',trackGeometry:{radius:.09}}),track=await Physics.create(custom,false);
 try{assert.equal(track.spawnHeight(),custom.suspension+.09);}finally{track.free();}
 for(const model of ['ray','multi-ray']){
  const p=await Physics.create({...resolveVehicle('mn168'),contactModel:model},false);
  try{run(p,2);p.world.createCollider(R.ColliderDesc.cuboid(.25,.012,1).setTranslation(.8,.012,0));const s=run(p,7,.7);assert.ok(s.position.y>.05&&s.position.y<.3);assert.ok(model==='ray'?s.position.x<1:s.position.x>2,`${model}: ${s.position.x}`);}finally{p.free();}
 }
});

const rearSlip=p=>{const q=p.body.rotation(),com=p.body.worldCom(),at={x:com.x+rotate(q,{x:-p.c.wheelbase/2,y:0,z:0}).x,y:com.y,z:com.z+rotate(q,{x:-p.c.wheelbase/2,y:0,z:0}).z},v=p.body.velocityAtPoint(at),r=rotate(q,{x:0,y:0,z:1}),f=rotate(q,{x:1,y:0,z:0});return Math.atan2(Math.abs(v.x*r.x+v.y*r.y+v.z*r.z),Math.abs(v.x*f.x+v.y*f.y+v.z*f.z))*180/Math.PI;};
test('full-throttle full-lock turn keeps rear-axle slip small',async()=>{
 for(const id of ['mn168','heavy-crawler'])await using(id,p=>{
  run(p,2,1,0);const h0=p.state().heading;let max=0;
  for(let i=0;i<400;i++){p.step(.01,1,1);if(i>=200)max=Math.max(max,rearSlip(p));}
  const s=p.state(),d=Math.abs(((s.heading-h0+540)%360)-180);
  console.log(id,'max rear slip',max.toFixed(2));
  assert.ok(max<5,`${id} rear slip ${max}`);assert.ok(d>20,`${id} heading change ${d}`);
  assert.ok(rotate(p.body.rotation(),{x:0,y:1,z:0}).y>.9);
 });
});
test('steady turn radius matches kinematic radius within 30%',async()=>using('mn168',p=>{
 run(p,2,.5,.5);run(p,3,.5,.5);const s=run(p,.5,.5,.5),w=p.body.angvel(),yaw=Math.abs(w.y),v=Math.hypot(s.velocity.x,s.velocity.z),r=v/yaw,k=p.c.wheelbase/Math.tan(.5*p.c.maxSteer);
 console.log('radius',r.toFixed(3),'kinematic',k.toFixed(3));
 assert.ok(Math.abs(r-k)/k<.3,`radius ${r} vs ${k}`);
}));
test('parked on a 15 degree side slope does not drift',async()=>{
 const p=await Physics.create(resolveVehicle('mn168'),false);
 try{
  const a=15*Math.PI/180;p.world.createCollider(R.ColliderDesc.cuboid(3,.05,3).setTranslation(0,1,0).setRotation({x:Math.sin(a/2),y:0,z:0,w:Math.cos(a/2)}));
  p.body.setTranslation({x:0,y:1.15,z:0},true);run(p,2);assert.ok(p.state().wheels.every(w=>w.contact));const z0=p.state().position;run(p,10);const z1=p.state().position,d=Math.hypot(z1.x-z0.x,z1.z-z0.z);
  console.log('slope drift',d.toFixed(4));assert.ok(d<.02,`drift ${d}`);
 }finally{p.free();}
});
