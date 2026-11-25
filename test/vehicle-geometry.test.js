import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeCollisionBoxes} from '../src/vehicle-geometry.js';
import {resolveVehicle} from '../src/vehicles.js';

test('collision shapes and offsets scale with chassis dimensions without mutating the reference',()=>{
 const base=resolveVehicle('mn168'),before=structuredClone(base);
 const resized={...base,length:base.length*2,height:base.height*1.5,width:base.width*.8};
 const boxes=resizeCollisionBoxes(resized,base);
 for(let i=0;i<base.collisionBoxes.length;i++)for(const key of ['size','position'])
  assert.deepEqual(boxes[i][key],base.collisionBoxes[i][key].map((v,j)=>v*[2,1.5,.8][j]));
 assert.deepEqual(base,before);
 assert.deepEqual(resizeCollisionBoxes(base,base),base.collisionBoxes);
});
