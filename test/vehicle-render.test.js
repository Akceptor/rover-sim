import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
const base={id:'heavy-crawler',length:.8,width:.38,height:.18,wheelRadius:.11,wheelWidth:.08,wheelbase:.52,track:.44,suspension:.08,drivetrain:'wheeled',collisionBoxes:[{size:[.8,.18,.38],position:[0,0,0],massFraction:1}]};
const module=await import('../assets/vehicle.js');
import {vehicleProfiles} from '../src/vehicles.js';
test('profile model factory exists',()=>assert.ok(module?.createVehicle));
test('wheels follow published suspension centres and actual steering',()=>{if(!module)return;const v=module.createVehicle(base);assert.equal(v.wheels.length,4);v.update({wheels:[{x:.3,y:-.12,z:-.22,rotation:2,steering:.37}]});assert.deepEqual(v.wheels[0].steer.position.toArray(),[.3,-.12,-.22]);assert.equal(v.wheels[0].steer.rotation.y,.37);assert.equal(v.wheels[0].spin.rotation.z,2);v.dispose();});
test('tracked treads use independent distance and stay on the sampled footprint',()=>{if(!module)return;const c={...base,id:'tracked-crawler',drivetrain:'tracked',trackGeometry:{length:.65,width:.09,radius:.11,samples:5}};const v=module.createVehicle(c);assert.equal(v.tracks.length,2);v.update({tracks:[{side:'left',distance:.13},{side:'right',distance:-.07}]});assert.equal(v.tracks[0].distance,.13);assert.equal(v.tracks[1].distance,-.07);for(const t of v.tracks){t.mesh.computeBoundingBox();assert.ok(t.mesh.boundingBox.max.x<=c.trackGeometry.length/2+.01);assert.ok(t.mesh.boundingBox.min.x>=-c.trackGeometry.length/2-.01);assert.equal(t.mesh.count,48);}assert.notDeepEqual(v.tracks[0].mesh.instanceMatrix.array,v.tracks[1].mesh.instanceMatrix.array);v.dispose();});
test('body geometry agrees with collision envelope',()=>{if(!module)return;const v=module.createVehicle(base);const box=new T.Box3().setFromObject(v.model.getObjectByName('body'));assert.deepEqual(box.getSize(new T.Vector3()).toArray().map(x=>+x.toFixed(6)),[.8,.18,.38]);v.dispose();});

test('every built-in builds finite geometry and cleanly disposes',()=>{for(const c of vehicleProfiles){const v=module.createVehicle(c);v.model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(v.model);assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));assert.equal(v.wheels.length,c.drivetrain==='wheeled'?4:0);assert.equal(v.tracks.length,c.drivetrain==='tracked'?2:0);v.dispose();}});
test('track outer tread bottom follows averaged support contacts',()=>{const c=vehicleProfiles.find(p=>p.drivetrain==='tracked'),v=module.createVehicle(c);v.update({tracks:[{side:'left',distance:0,contacts:[{contact:true,y:-.1},{contact:true,y:-.12},{contact:false,y:-1}]}]});assert.ok(Math.abs(v.tracks[0].carrier.position.y-(-.11+c.trackGeometry.radius*1.055))<1e-9);v.dispose();});

for(const id of ['tracked-crawler','heavy-crawler','mn168'])test(`${id} fittings have a continuous mounting path to the body`,()=>{
 const c=vehicleProfiles.find(p=>p.id===id),v=module.createVehicle(c);
 try{
  v.model.updateMatrixWorld(true);
  const fittings=[];
  v.model.traverse(o=>{
   let parent=o;while(parent&&!/^(track|wheel)-/.test(parent.name))parent=parent.parent;
   if(o.isMesh&&!parent)fittings.push({mesh:o,bounds:new T.Box3().setFromObject(o).expandByScalar(.0001)});
  });
  const attached=new Set(fittings.filter(f=>f.mesh.parent.name==='body'||f.mesh.name==='body-deck'));
  let changed=true;
  while(changed){
   changed=false;
   for(const fitting of fittings){
    if(!attached.has(fitting)&&[...attached].some(mount=>mount.bounds.intersectsBox(fitting.bounds))){attached.add(fitting);changed=true;}
   }
  }
  assert.deepEqual(fittings.filter(f=>!attached.has(f)).map(f=>f.mesh.name||f.mesh.geometry.type),[],'every rigid fitting must touch the body or another mounted part');
 }finally{v.dispose();}
});
