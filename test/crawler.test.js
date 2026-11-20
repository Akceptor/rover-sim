import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {createCrawler} from '../assets/MN-168.js';
import {loadConfig} from '../src/config.js';
test('crawler fits configured wheel centres and keeps body clear of the FPV mount',()=>{
 const c=loadConfig().vehicle,original=structuredClone(c),{model,wheels,dispose}=createCrawler(c);
 assert.equal(wheels.length,4);assert.deepEqual(c,original,'visual model cannot alter physics');
 for(let i=0;i<4;i++){
  assert.equal(wheels[i].steer.position.x,(i<2?1:-1)*c.wheelbase/2);
  assert.equal(wheels[i].steer.position.z,(i%2?1:-1)*c.track/2);
  assert.equal(wheels[i].spin.parent,wheels[i].steer);
 }
 const hood=model.getObjectByName('hood');assert.ok(hood);
 const bounds=new Box3().setFromObject(hood);assert.ok(bounds.max.y<.16,'default FPV is above bonnet');
 const overall=new Box3().setFromObject(model).getSize(new Vector3());assert.ok(overall.x<.6&&overall.y<.45&&overall.z<.4,'model uses metres');
 assert.ok(model.getObjectByName('windshield'));assert.ok(model.getObjectByName('grille'));assert.ok(model.getObjectByName('roof'));
 const wheel=wheels[0].spin;wheel.rotation.z=1;assert.equal(model.getObjectByName('roof').rotation.z,0);
 let released=0;model.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>released++);});dispose();assert.ok(released>0,'reconnect can release GPU resources');
});
