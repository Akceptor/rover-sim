import {test} from 'node:test';
import assert from 'node:assert/strict';
import {axleForces} from '../src/drivetrain.js';
const close=(a,b)=>{assert.equal(a.length,2);a.forEach((x,i)=>{assert.ok(Number.isFinite(x));assert.ok(Math.abs(x-b[i])<1e-9,`${a} != ${b}`);});};
test('axleForces distributes locked and open axles',()=>{
 for(const m of ['locked','open'])close(axleForces(4,[10,10],m),[2,2]);
 close(axleForces(4,[0,10],'locked'),[0,4]);
 close(axleForces(4,[1,10],'locked'),[1,3]);
 close(axleForces(30,[5,10],'locked'),[5,10]);
 close(axleForces(4,[0,10],'open'),[0,0]);
 close(axleForces(4,[1,10],'open'),[1,1]);
 close(axleForces(-4,[0,10],'locked'),[0,-4]);
 for(const m of ['locked','open'])close(axleForces(4,[0,0],m),[0,0]);
});
