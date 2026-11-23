import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/session.js';
import {loadConfig} from '../src/config.js';
const packet=(count,left=1500,right=1500)=>({count,rate:100,pwm:Array.from({length:16},(_,i)=>i===1?left:i===3?right:1500)});
function physics(){return {steps:[],reset(){},step(...args){this.steps.push(args)},state(){return {sensor:{imu:{gyro:[0,0,0],accel_body:[0,0,-9.80665]},position:[0,0,0],velocity:[0,0,0],quaternion:[1,0,0,0]}}}};}
test('tracked SITL consumes independent calibrated motor outputs without mixing',()=>{
 const p=physics(),config={...loadConfig(),vehicle:{drivetrain:'tracked'},leftTrack:{channel:2,min:1100,trim:1400,max:2000,reversed:false},rightTrack:{channel:4,min:1000,trim:1600,max:1900,reversed:true}};
 new Session(p,config).receive(packet(1,1700,1300),'a',0);
 assert.deepEqual(p.steps[0][3],{left:.5,right:.5});
});
test('staged vehicle cannot consume live old frames and promotes before restarted frame decoding',()=>{
 const old=physics(),next=physics(),s=new Session(old,loadConfig());s.receive(packet(10),'a',0);let promoted=0;
 const config={...loadConfig(),vehicle:{drivetrain:'tracked'},leftTrack:{channel:2,min:1000,trim:1500,max:2000,reversed:false},rightTrack:{channel:4,min:1000,trim:1500,max:2000,reversed:false}};
 s.stageVehicle(config,next,()=>promoted++);
 s.receive(packet(11,2000,1000),'a',10);assert.equal(old.steps.length,1);assert.equal(next.steps.length,0);assert.equal(promoted,0);
 s.receive(packet(0,2000,1000),'a',20);assert.equal(promoted,0);
 s.receive(packet(0,2000,1000),'a',4000);assert.equal(promoted,1);assert.equal(s.config,config);assert.equal(s.physics,next);
 assert.equal(next.steps.length,0); // Remains held for parameter validation and explicit Start.
 s.running=true;s.receive(packet(1,2000,1000),'a',4010);assert.deepEqual(next.steps[0][3],{left:1,right:-1});
});
