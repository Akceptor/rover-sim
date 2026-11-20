import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraAim} from '../src/camera.js';
test('RC4 pans ±30 degrees and RC2 tilts ±15, independent of driving channels',()=>{
 const aim=(pan,tilt)=>cameraAim({connected:true,channels:[2000,tilt,1000,pan],ageMs:0});
 assert.deepEqual(aim(2000,1000),{panDeg:-30,tiltDeg:15});
 assert.deepEqual(aim(1000,2000),{panDeg:30,tiltDeg:-15});
 assert.deepEqual(aim(1500,1500),{panDeg:0,tiltDeg:0});
 assert.deepEqual(aim(1750,1250),{panDeg:-15,tiltDeg:7.5});
 assert.deepEqual(aim(2200,800),{panDeg:-30,tiltDeg:15});
 assert.deepEqual(aim(65535,0),{panDeg:0,tiltDeg:0});
 assert.deepEqual(cameraAim({connected:false,channels:[1500,1000,1500,2000]}),{panDeg:0,tiltDeg:0});
 assert.deepEqual(cameraAim(null),{panDeg:0,tiltDeg:0});
});
