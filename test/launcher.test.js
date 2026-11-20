import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {sitlArguments,checkPorts} from '../src/launcher.js';
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
