import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {vehicleProfiles,resolveVehicle,resolveVehicleConfig} from '../src/vehicles.js';
import {loadConfig} from '../src/config.js';

test('three validated distinct built-in profiles with SI dimensions',()=>{
 assert.equal(vehicleProfiles.length,3);
 for(const v of vehicleProfiles){assert.deepEqual(resolveVehicle(v),v);assert.ok(v.mass>0);assert.ok(v.cameraMount.y>v.height/2);}
 assert.equal(resolveVehicle().id,'mn168');
 const a=resolveVehicle('mn168'),b=resolveVehicle('heavy-crawler'),t=resolveVehicle('tracked-crawler');
 for(const k of ['wheelbase','track','wheelRadius','mass','engineForce'])assert.notEqual(a[k],b[k]);
 assert.equal(t.drivetrain,'tracked');assert.ok(t.trackGeometry.samples>=3);
});
test('legacy inline vehicle and PWM calibrations survive profile resolution and config loading',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../config/default.json',import.meta.url)));
 raw.vehicle.mass=4;raw.steering={channel:7,min:1050,trim:1470,max:1920,reversed:true};raw.throttle.channel=8;
 const c=resolveVehicleConfig(raw);assert.equal(c.vehicle.mass,4);assert.equal(c.vehicle.id,'custom');assert.deepEqual(c.steering,raw.steering);
 const file=path.join(os.tmpdir(),`rover-profile-${process.pid}.json`);try{fs.writeFileSync(file,JSON.stringify(raw));assert.deepEqual(loadConfig(file),c);}finally{fs.unlinkSync(file);}
 const selected=resolveVehicleConfig(c,'tracked-crawler');assert.deepEqual(selected.steering,raw.steering);assert.equal(selected.leftTrack.channel,2);assert.equal(selected.rightTrack.channel,4);
});
test('rejects nonfinite, nonsensical geometry, bad tuning, unknown fields and duplicate actuators',()=>{
 for(const patch of [{mass:0},{wheelbase:-1},{track:NaN},{cameraMount:{x:0,y:Infinity,z:0}},{suspensionTuning:{travel:-1}},{drive:{deadband:1}},{trackGeometry:{samples:2.5}},{typo:1}])assert.throws(()=>resolveVehicle({profile:'mn168',...patch}));
 assert.throws(()=>resolveVehicle('unknown'));
 assert.throws(()=>resolveVehicle({profile:'mn168',wheelbase:100}));
 assert.throws(()=>resolveVehicleConfig({vehicle:'tracked-crawler',leftTrack:{channel:2,min:1000,trim:1500,max:2000,reversed:false},rightTrack:{channel:2,min:1000,trim:1500,max:2000,reversed:false}}));
 const a=resolveVehicle();a.drive.deadband=.5;assert.notEqual(resolveVehicle().drive.deadband,.5);
});
