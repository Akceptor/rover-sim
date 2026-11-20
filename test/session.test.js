import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/session.js';
import {loadConfig} from '../src/config.js';
const p={steps:0,time:0,step(dt){this.steps++;this.time+=dt;},reset(){this.time=0;},state(){return {sensor:{timestamp:this.time,imu:{gyro:[0,0,0],accel_body:[0,0,-9.80665]},quaternion:[1,0,0,0],position:[0,0,0],velocity:[0,0,0]}};}};
const a=n=>({count:n,rate:100,pwm:Array(16).fill(1500)});
test('duplicates reuse same bytes and time; stale peer is not allowed to hijack live session',()=>{const s=new Session(p,loadConfig());const first=s.receive(a(0),'a',0);const steps=p.steps;assert.equal(s.receive(a(0),'a',100).bytes,first.bytes);assert.equal(p.steps,steps);assert.equal(s.receive(a(1),'b',200),null);assert.ok(s.receive(a(1),'a',200));assert.equal(s.receive(a(0),'a',300),null);assert.ok(s.receive(a(0),'b',3000));});
test('pause still advances sensor timestamp and holds physical pose',()=>{const s=new Session(p,loadConfig());s.running=false;const before=p.steps;s.receive(a(1),'a',0);assert.equal(p.steps,before);assert.ok(JSON.parse(s.cached.toString()).timestamp>0);});
test('large packet gap recovers with one bounded step and fresh counter',()=>{const s=new Session(p,loadConfig());s.receive(a(1),'a',0);const before=p.steps;assert.ok(s.receive(a(10000),'a',10));assert.equal(p.steps,before+1);assert.ok(s.receive(a(10001),'a',20));assert.equal(s.stats.gaps,1);});
test('preset origin supplies absolute GPS including NED displacement and altitude',()=>{
 const physics={...p,state(){return {sensor:{imu:{gyro:[0,0,0],accel_body:[0,0,-9.80665]},position:[111.318845,55.6594225,-3],velocity:[0,0,0],quaternion:[1,0,0,0]}};}};
 const s=new Session(physics,loadConfig());s.home={lat:0,lon:179.9998,alt:120};
 const sensor=JSON.parse(s.receive(a(1),'a',0).bytes);
 assert.ok(Math.abs(sensor.latitude-.001)<1e-7);
 assert.ok(Math.abs(sensor.longitude-(-179.9997))<1e-7);
 assert.equal(sensor.altitude,123);assert.deepEqual(sensor.position,[111.318845,55.6594225,-3]);
});
test('a pending geographic change activates only on a fresh SITL session',()=>{
 const s=new Session(p,loadConfig());s.receive(a(10),'a',0);s.pendingHome={lat:-12.026,lon:-77.028,alt:200};
 assert.equal(JSON.parse(s.receive(a(11),'a',10).bytes).latitude,undefined);
 const fresh=JSON.parse(s.receive(a(0),'a',4000).bytes);assert.equal(fresh.latitude,-12.026);assert.equal(fresh.longitude,-77.028);
 s.receive(a(1),'a',4100);s.pendingHome=null;assert.equal(JSON.parse(s.receive(a(0),'a',8000).bytes).latitude,undefined);
});
