import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {vehicleProfiles,resolveVehicle,resolveVehicleConfig} from '../src/vehicles.js';
import {loadConfig} from '../src/config.js';

test('three validated distinct built-in profiles with SI dimensions',()=>{
 assert.equal(vehicleProfiles.length,3);
 for(const v of vehicleProfiles){assert.deepEqual(resolveVehicle(v),v);assert.ok(v.mass>0);assert.ok(v.cameraMount.y>v.height/2);assert.ok(Number.isFinite(v.fpvFov)&&v.fpvFov>=40&&v.fpvFov<=120);}
 assert.equal(resolveVehicle().id,'mn168');
 const a=resolveVehicle('mn168'),b=resolveVehicle('heavy-crawler'),t=resolveVehicle('tracked-crawler');
 for(const k of ['wheelbase','track','wheelRadius','mass','engineForce'])assert.notEqual(a[k],b[k]);
 assert.equal(t.drivetrain,'tracked');assert.ok(t.trackGeometry.samples>=3);
});
test('legacy inline vehicle and PWM calibrations survive profile resolution and config loading',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../config/default.json',import.meta.url)));
 raw.vehicle={mass:3,length:0.48,width:0.24,height:0.12,wheelbase:0.30,track:0.26,wheelRadius:0.065,suspension:0.07,maxSteer:0.52,engineForce:4.5,maxSpeed:1.2,rollingResistance:0.5,brakeImpulse:0.08};raw.vehicle.mass=4;raw.steering={channel:7,min:1050,trim:1470,max:1920,reversed:true};raw.throttle.channel=8;
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
test('drivetrain fields default, merge and validate',()=>{
 const v=resolveVehicle('mn168');assert.equal(v.steerRate,6);assert.equal(v.ackermannFactor,1);assert.equal(v.torqueSplit,.5);assert.deepEqual(v.diff,{front:'locked',rear:'locked'});
 assert.deepEqual(resolveVehicle({profile:'mn168',diff:{rear:'open'}}).diff,{front:'locked',rear:'open'});
 for(const patch of [{steerRate:0},{steerRate:101},{ackermannFactor:-.1},{ackermannFactor:1.1},{torqueSplit:1.5},{diff:{front:'welded'}},{diff:{middle:'open'}}])assert.throws(()=>resolveVehicle({profile:'mn168',...patch}),undefined,JSON.stringify(patch));
 resolveVehicle({profile:'mn168',torqueSplit:0});resolveVehicle({profile:'mn168',ackermannFactor:0});
});
import {fieldClass,LIVE_FIELDS,RELOAD_FIELDS} from '../src/profile-fields.js';
const tempVehicles=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rover-vehicles-'));fs.cpSync(new URL('../config/vehicles',import.meta.url),dir,{recursive:true});return dir;};
const leaves=(o,p='')=>Object.entries(o).flatMap(([k,x])=>x&&typeof x==='object'&&!Array.isArray(x)?leaves(x,p+k+'.'):[p+k]);
const matches=(list,leaf)=>list.filter(f=>leaf===f||leaf.startsWith(f+'.'));
test('reloadProfiles picks up a new profile directory',async()=>{
 const dir=tempVehicles(),old=process.env.ROVER_VEHICLES_DIR;process.env.ROVER_VEHICLES_DIR=dir;
 try{
  const m=await import(`../src/vehicles.js?reload=${Date.now()}`);
  fs.mkdirSync(path.join(dir,'test-rig'));fs.writeFileSync(path.join(dir,'test-rig/vehicle.json'),JSON.stringify({...resolveVehicle('mn168'),id:'test-rig'}));
  assert.throws(()=>m.resolveVehicle('test-rig'));
  m.reloadProfiles();
  assert.equal(m.resolveVehicle('test-rig').id,'test-rig');assert.ok(m.vehicleProfiles.some(p=>p.id==='test-rig'));assert.equal(m.vehiclesDir(),dir);
  assert.equal(m.readProfileFiles('test-rig').sitlParm,null);assert.equal(m.readProfileFiles('mn168').profile.id,'mn168');assert.match(m.readProfileFiles('mn168').sitlParm,/\S/);
  assert.throws(()=>m.readProfileFiles('../mn168'));
 }finally{if(old===undefined)delete process.env.ROVER_VEHICLES_DIR;else process.env.ROVER_VEHICLES_DIR=old;fs.rmSync(dir,{recursive:true,force:true});}
});
test('field classes cover every profile key exactly once',()=>{
 for(const id of ['mn168','tracked-crawler'])for(const leaf of leaves(resolveVehicle(id))){
  assert.equal(matches(LIVE_FIELDS,leaf).length+matches(RELOAD_FIELDS,leaf).length,1,leaf);
 }
 for(const [p,c] of [['suspensionTuning.grip','live'],['wheelbase','reload'],['trackGeometry.samples','reload'],['trackGeometry.lateralResistance','live'],['diff.front','live'],['drive.riseRate','live'],['collisionBoxes','reload'],['cameraMount.x','reload']])assert.equal(fieldClass(p),c,p);
 assert.throws(()=>fieldClass('bogus'));
});
import {vehicleChoices} from '../src/vehicles.js';
test('default config resolves mn168 by id',()=>{
 assert.equal(JSON.parse(fs.readFileSync(new URL('../config/default.json',import.meta.url))).vehicle,'mn168');
 const config=loadConfig();assert.equal(config.vehicle.id,'mn168');assert.equal(vehicleChoices(config).some(c=>c.id==='custom'),false);
});
test('videoSize config is optional and accepts only known sizes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'video-size-')),base=JSON.parse(fs.readFileSync(new URL('../config/default.json',import.meta.url),'utf8'));
 const load=extra=>{const file=path.join(dir,'c.json');fs.writeFileSync(file,JSON.stringify({...base,...extra}));return loadConfig(file);};
 assert.equal(load({}).videoSize,undefined);assert.equal(load({videoSize:'640x360'}).videoSize,'640x360');
 assert.throws(()=>load({videoSize:'1920x1080'}),/invalid videoSize/);
});
