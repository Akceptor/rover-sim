import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/session.js';
import {loadConfig} from '../src/config.js';
const p={steps:0,time:0,step(dt){this.steps++;this.time+=dt;},reset(){this.time=0;},state(){return {sensor:{timestamp:this.time,imu:{gyro:[0,0,0],accel_body:[0,0,-9.80665]},quaternion:[1,0,0,0],position:[0,0,0],velocity:[0,0,0]}};}};
const a=n=>({count:n,rate:100,pwm:Array(16).fill(1500)});
test('duplicates reuse same bytes and time; stale peer is not allowed to hijack live session',()=>{const s=new Session(p,loadConfig());const first=s.receive(a(0),'a',0);const steps=p.steps;assert.equal(s.receive(a(0),'a',100).bytes,first.bytes);assert.equal(p.steps,steps);assert.equal(s.receive(a(1),'b',200),null);assert.ok(s.receive(a(1),'a',200));assert.equal(s.receive(a(0),'a',300),null);assert.ok(s.receive(a(0),'b',3000));});
test('pause still advances sensor timestamp and holds physical pose',()=>{const s=new Session(p,loadConfig());s.running=false;const before=p.steps;s.receive(a(1),'a',0);assert.equal(p.steps,before);assert.ok(JSON.parse(s.cached.toString()).timestamp>0);});
test('large packet gap recovers with one bounded step and fresh counter',()=>{const s=new Session(p,loadConfig());s.receive(a(1),'a',0);const before=p.steps;assert.ok(s.receive(a(10000),'a',10));assert.equal(p.steps,before+1);assert.ok(s.receive(a(10001),'a',20));assert.equal(s.stats.gaps,1);});
