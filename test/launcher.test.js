import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {sitlArguments,missionPlannerArguments,checkPorts} from '../src/launcher.js';
import * as launcher from '../src/launcher.js';
test('launcher preserves parameters by default and passes paths with spaces as single arguments',()=>{
 const config={udpHost:'0.0.0.0',udpPort:9005,mavlink:{host:'127.0.0.1',port:14563}};
 const defaults='C:\\My Simulator\\config\\rover.parm';
 const args=sitlArguments(config,{defaults,mavlinkPort:5774});
 assert.equal(args.includes('--wipe'),false);assert.equal(args[args.indexOf('--defaults')+1],defaults);
 assert.ok(args.includes('JSON:127.0.0.1'));assert.ok(args.includes('tcp:5774'));assert.ok(args.includes('tcp:5776'));assert.ok(args.includes('udpclient:127.0.0.1:14563'));
 assert.ok(sitlArguments(config,{defaults,mavlinkPort:5774,wipe:true}).includes('--wipe'));
});
test('busy port preflight fails without taking over the existing listener',async()=>{
 const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 try{await assert.rejects(checkPorts([{kind:'tcp',host:'127.0.0.1',port,name:'backend'}]),/backend.*in use/);
  const client=net.connect(port,'127.0.0.1');await once(client,'connect');client.destroy();
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('launcher config resolves machine paths relative to the config file without changing it',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const path=await import('node:path');
 const {loadLauncherConfig}=await import('../src/launcher.js');
 const dir=await mkdtemp(path.join(tmpdir(),'rover-launcher-'));
 try{
  const file=path.join(dir,'launcher.json');
  const content=JSON.stringify({sitlExe:'My SITL/ardurover',backendConfig:'backend.json'});
  await writeFile(file,content);
  assert.deepEqual(loadLauncherConfig(file),{sitlExe:path.join(dir,'My SITL/ardurover'),backendConfig:path.join(dir,'backend.json')});
  assert.equal(await readFile(file,'utf8'),content);
  await writeFile(file,JSON.stringify({sitlExe:42}));
  assert.throws(()=>loadLauncherConfig(file),/sitlExe/);
  await writeFile(file,JSON.stringify({sitlExe:'rover',wipe:true}));
  assert.throws(()=>loadLauncherConfig(file),/wipe/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Mission Planner arguments preserve its map-selected home and GCS connection',()=>{
 const args=missionPlannerArguments({udpHost:'127.0.0.1',udpPort:9002,mavlink:{host:'127.0.0.1',port:14560}},'C:/My Simulator/config/rover.parm');
 assert.ok(args.includes('JSON:127.0.0.1'));assert.ok(args.includes('udpclient:127.0.0.1:14560'));
 for(const flag of ['--home','--serial0','--wipe'])assert.equal(args.includes(flag),false);
 assert.equal(args.at(-1),'C:/My Simulator/config/rover.parm');
});
test('Mission Planner copyable command preserves custom ports and quoted Windows defaults including extra parameters',()=>{
 const config={udpHost:'0.0.0.0',udpPort:9012,mavlink:{host:'0.0.0.0',port:14570}};
 const defaults='C:\\My Simulator\\config\\rover.parm,C:\\Tuning Files\\drive.parm';
 assert.equal(launcher.missionPlannerCommand(config,defaults),'--model JSON:127.0.0.1 --sim-port-out 9012 --rate 100 --speedup 1 --serial2 udpclient:127.0.0.1:14570 --defaults "'+defaults+'"');
});

test('vehicle defaults order retains explicit extras after profile and generated calibration',()=>{
 const config={vehicle:{id:'tracked-crawler',drivetrain:'tracked'},leftTrack:{channel:6,min:1100,trim:1450,max:1900,reversed:true},rightTrack:{channel:7,min:1000,trim:1550,max:2000,reversed:false}};
 const defaults=launcher.vehicleDefaults(config,{root:'/sim',base:'/sim/config/rover.parm,/custom.parm',calibration:'/run/vehicle.parm'});
 assert.equal(defaults,'/sim/config/rover.parm,/sim/config/vehicles/tracked-crawler/sitl.parm,/run/vehicle.parm,/custom.parm');
 const params=launcher.vehicleServoParameters(config);
 assert.equal(params.SERVO6_FUNCTION,73);assert.equal(params.SERVO7_FUNCTION,74);assert.equal(params.SERVO6_TRIM,1450);assert.equal(params.SERVO6_REVERSED,1);assert.equal(params.SERVO2_FUNCTION,0);assert.equal(params.SERVO4_FUNCTION,0);
});
test('vehicleDefaults sees sitl.parm added after import',async()=>{
 const {mkdtempSync,cpSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const dir=mkdtempSync(path.join(tmpdir(),'rover-vehicles-'));cpSync(new URL('../config/vehicles',import.meta.url),dir,{recursive:true});
 const old=process.env.ROVER_VEHICLES_DIR;process.env.ROVER_VEHICLES_DIR=dir;
 try{
  const config={vehicle:{id:'test-rig',drivetrain:'wheeled'}};
  assert.doesNotMatch(launcher.vehicleDefaults(config,{root:'/sim'}),/test-rig/);
  mkdirSync(path.join(dir,'test-rig'));writeFileSync(path.join(dir,'test-rig/sitl.parm'),'X 1\n');
  assert.ok(launcher.vehicleDefaults(config,{root:'/sim'}).includes(path.join(dir,'test-rig','sitl.parm')));
 }finally{if(old===undefined)delete process.env.ROVER_VEHICLES_DIR;else process.env.ROVER_VEHICLES_DIR=old;rmSync(dir,{recursive:true,force:true});}
});

test('launcher config accepts only boolean openBrowser and preserves it without treating it as a path',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const dir=await mkdtemp(path.join(tmpdir(),'launcher-browser-')),file=path.join(dir,'launcher.json');
 try{
  for(const openBrowser of [false,true]){await writeFile(file,JSON.stringify({backendConfig:'backend.json',openBrowser}));assert.deepEqual(launcher.loadLauncherConfig(file),{backendConfig:path.join(dir,'backend.json'),openBrowser});}
  for(const openBrowser of ['false',0,null,{}]){await writeFile(file,JSON.stringify({openBrowser}));assert.throws(()=>launcher.loadLauncherConfig(file),/openBrowser.*boolean/);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
