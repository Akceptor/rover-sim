import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {ProcessGroup} from '../src/process-group.js';
const worker="process.send('ready');process.on('message',m=>{if(m.type==='shutdown')process.exit(0)});setInterval(()=>{},1000);";
test('process group stops every owned child and rejects new starts after shutdown',async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:300});
 const first=group.start('first',process.execPath,['-e',worker],{ipc:true});await once(first,'message');
 const second=group.start('second',process.execPath,['-e',worker],{ipc:true});await once(second,'message');
 await group.stop();assert.equal(first.exitCode,0);assert.equal(second.exitCode,0);assert.equal(await group.finished,0);
 assert.throws(()=>group.start('late',process.execPath,[]),/stopping/);
});
test('an unexpected child exit stops its sibling and reports failure',async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:300});
 const sibling=group.start('sibling',process.execPath,['-e',worker],{ipc:true});await once(sibling,'message');
 group.start('failure',process.execPath,['-e','process.exit(7)']);
 assert.equal(await group.finished,1);assert.equal(sibling.exitCode,0);
});
test('a spawn failure cleans up a service that was already started',async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:300});
 const sibling=group.start('sibling',process.execPath,['-e',worker],{ipc:true});await once(sibling,'message');
 group.start('missing','/does-not-exist/rover-sim-test',[]);
 assert.equal(await group.finished,1);assert.equal(sibling.exitCode,0);
});

test('shutdown force-stops an unresponsive child within its grace period',async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:100});
 const child=group.start('stuck',process.execPath,['-e',"process.on('message',()=>{});process.send('ready');setInterval(()=>{},1000)"],{ipc:true});
 await once(child,'message');
 const start=Date.now();
 assert.equal(await group.stop(),0);
 assert.ok(Date.now()-start<3000);
 assert.ok(child.signalCode||child.exitCode!==null);
});
test('shutdown can cancel a child immediately after spawn',async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:100});
 const child=group.start('starting',process.execPath,['-e',worker],{ipc:true});
 assert.equal(await group.stop(),0);
 assert.ok(child.signalCode||child.exitCode!==null);
});

test('shutdown signals the owned Unix process tree', {skip:process.platform==='win32'},async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:100});
 const script="const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});c.on('spawn',()=>process.send(c.pid));process.on('message',()=>process.exit(0));setInterval(()=>{},1000);";
 const child=group.start('tree',process.execPath,['-e',script],{ipc:true});
 const [pid]=await once(child,'message');
 try{
  await group.stop();
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
 }finally{try{process.kill(pid,'SIGKILL');}catch{}}
});

test('Windows shutdown terminates non-IPC helpers with their root', {skip:process.platform!=='win32'},async()=>{
 const group=new ProcessGroup({log:()=>{},graceMs:300});
 const script="const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});c.on('spawn',()=>console.log(c.pid));setInterval(()=>{},1000);";
 const child=group.start('tree',process.execPath,['-e',script]);
 const [bytes]=await once(child.stdout,'data');const pid=Number(String(bytes).trim());
 try{await group.stop();assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});}
 finally{try{process.kill(pid,'SIGKILL');}catch{}}
});
