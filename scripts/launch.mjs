#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig} from '../src/config.js';
import {loadEnvironment} from '../src/environment.js';
import {ProcessGroup} from '../src/process-group.js';
import {sitlArguments,missionPlannerCommand,checkPorts,localHost,loadLauncherConfig} from '../src/launcher.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{sitl:{type:'string'},'launcher-config':{type:'string'},config:{type:'string'},'extra-params':{type:'string'},'mavlink-port':{type:'string',default:'5760'},'run-dir':{type:'string'},'no-video':{type:'boolean'},standalone:{type:'boolean'},'mission-planner':{type:'boolean'},'choose-location':{type:'boolean'},flat:{type:'boolean'},playground:{type:'boolean'},wipe:{type:'boolean'},camera:{type:'string',default:'fpv'},fov:{type:'string',default:'85'},browser:{type:'string',default:'auto'},open:{type:'boolean'},'no-open':{type:'boolean'},help:{type:'boolean'}}});
if(values.help){console.log(`npm run sim -- [--launcher-config config/launcher.local.json] [--no-video] [--standalone] [--mission-planner] [--choose-location] [--flat] [--playground] [--wipe] [--open] [--no-open]
Set sitlExe and backendConfig in config/launcher.local.json (copy launcher.example.json).
Overrides: --sitl "path/to/ArduRover.exe" --config path/to/backend.json
Camera: --camera fpv|chase --fov 40..120 --browser auto|chrome|msedge
Advanced: --extra-params path --mavlink-port 5760 --run-dir path
Visible HUD: --standalone opens it automatically; --no-open suppresses it; --open forces it.
--no-video skips only the background camera stream.
Preset dropdown: --choose-location waits for a browser selection before starting SITL.
Mission Planner Simulation map: --mission-planner starts backend/camera only; see docs/mission-planner-start.md.
Config paths are relative to the config file; command-line paths are relative to the current directory.
--wipe is NEVER saved. Ctrl+C stops all services.`);process.exit(0);}
function openBrowser(targetUrl){
 const report=message=>console.error(`[launcher] Could not open browser: ${message}. Open ${targetUrl} manually.`);
 try{
  const [command,args]=process.platform==='darwin'?['open',[targetUrl]]:process.platform==='win32'?['cmd.exe',['/c','start','',targetUrl]]:['xdg-open',[targetUrl]];
  const child=spawn(command,args,{detached:true,stdio:'ignore'});
  child.once('error',error=>report(error.message));
  child.once('exit',(code,signal)=>{if(code!==0)report(signal?`opener stopped by ${signal}`:`opener exited (${code})`);});
  child.unref();
 }catch(error){report(error.message);}
}
const group=new ProcessGroup();
const stop=()=>void group.stop();process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.on('message',m=>{if(m?.type==='shutdown')stop();});
process.on('disconnect',stop);
async function waitFor(label,fn,timeout=15000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){group.controller.signal.throwIfAborted();try{if(await fn())return;}catch{group.controller.signal.throwIfAborted();}await delay(100,undefined,{signal:group.controller.signal});}
 throw Error(`Timed out waiting for ${label}. Check the service logs above.`);
}
try{
 const settingsFile=path.resolve(values['launcher-config']??path.join(root,'config/launcher.local.json'));
 // Standalone and explicit --sitl work without a local file; an explicitly selected file must exist.
 const hasSettings=await fs.stat(settingsFile).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
 const settings=(hasSettings||values['launcher-config']||(!values.standalone&&!values['mission-planner']&&!values.sitl))?loadLauncherConfig(settingsFile):{};
 if(values['choose-location']&&(values['mission-planner']||values.flat||values.playground))throw Error('--choose-location cannot be combined with mission-planner/flat/playground');
 if(values['mission-planner']&&(values.standalone||values.flat||values.playground||values.wipe))throw Error('--mission-planner cannot be combined with standalone/flat/playground/wipe');
 const configPath=values.config?path.resolve(values.config):(settings.backendConfig??path.join(root,'config/default.json')),config=loadConfig(configPath);
 const environment=loadEnvironment(values['choose-location']?{...config,terrain:null}:config,configPath,{flat:values.flat,playground:values.playground});
 const mavlinkPort=Number(values['mavlink-port']);
 if(!Number.isInteger(mavlinkPort)||mavlinkPort<1||mavlinkPort>65533)throw Error('--mavlink-port must be between 1 and 65533');
 if(!['fpv','chase'].includes(values.camera)||!Number.isFinite(Number(values.fov))||Number(values.fov)<40||Number(values.fov)>120||!['auto','chrome','msedge'].includes(values.browser))throw Error('Invalid camera options. Use --help for accepted values.');
 let executable=values.sitl?path.resolve(values.sitl):settings.sitlExe;
 if(!values.standalone&&!values['mission-planner']){
  if(!executable)throw Error(`Set sitlExe in ${settingsFile} to your ArduRover executable.`);
  const info=await fs.stat(executable).catch(()=>null);
  if(!info?.isFile())throw Error(`SITL executable not found: ${executable}. Update sitlExe in ${settingsFile}.`);
 }
 const ports=[{kind:'tcp',host:config.httpHost,port:config.httpPort,name:'Backend'}];
 if(!values.standalone){ports.push({kind:'udp',host:config.udpHost,port:config.udpPort,name:'Physics'});if(!values['mission-planner'])ports.push({kind:'tcp',host:'0.0.0.0',port:mavlinkPort,name:'Mission Planner'},{kind:'tcp',host:'0.0.0.0',port:mavlinkPort+2,name:'Companion'});if(config.mavlink)ports.push({kind:'udp',host:config.mavlink.host,port:config.mavlink.port,name:'HUD telemetry'});}
 await checkPorts(ports);
 const extra=values['extra-params']?path.resolve(values['extra-params']):null;if(extra)await fs.access(extra);
 const defaults=path.join(root,'config/rover.parm')+(extra?','+extra:'');

 const url=`http://${localHost(config.httpHost)}:${config.httpPort}`;
 const state=async()=>{const response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(1000)});if(!response.ok)throw Error('backend not ready');return response.json();};
 group.start('backend',process.execPath,[path.join(root,'src/server.js'),'--config',configPath,...(values.standalone?['--standalone']:[]),...(values['mission-planner']?['--mission-planner','--mission-planner-defaults',defaults]:[]),...(!values.standalone&&!values['mission-planner']?['--managed-sitl']:[]),...(!values['mission-planner']&&extra?['--mission-planner-defaults',defaults]:[]),...(values['choose-location']?['--location-picker']:[]),...(values.flat?['--flat']:[]),...(values.playground?['--playground']:[])],{cwd:root,ipc:true});
 await waitFor('backend',state);
 const shouldOpen=!values['no-open']&&(values.open||settings.openBrowser===true||(settings.openBrowser!==false&&(values.standalone||(process.stdout.isTTY&&!process.env.CI))));
 if(shouldOpen)openBrowser(url);
 if(values['mission-planner'])console.log(`[launcher] Mission Planner Simulation → Extra command line:\n${missionPlannerCommand(config,(await state()).vehicleStartup.defaults)}\n[launcher] Copy the current command from the browser's Mission Planner setup panel after changing vehicle. Keep heading 0 and Wipe unchecked.\n`);
 if(values['choose-location']){console.log(`[launcher] Open ${url} and choose a location. All presets are bundled for offline use.`);await waitFor('location selection',async()=>{const current=await state();return current.startTerrain?.status==='ready'&&current.vehicleStatus?.status==='ready';},Infinity);}
 if(!values.standalone&&!values['mission-planner']){
  const runDir=path.resolve(values['run-dir']??path.join(root,'.run',process.platform==='win32'?'sitl-windows':'sitl'));await fs.mkdir(runDir,{recursive:true});
  const initial=await state();
  let sitl=group.start('sitl',executable,sitlArguments(config,{defaults:initial.vehicleStartup.defaults,mavlinkPort,wipe:values.wipe,home:values['choose-location']?initial.home:environment.home}),{cwd:runDir});
  // Restart only the owned SITL child. Keep the run directory/EEPROM, backend,
  // browser, terrain and video alive throughout a disarmed vehicle transition.
  void(async()=>{
   while(!group.stopping){
    await delay(200,undefined,{signal:group.controller.signal});
    const current=await state();
    if(current.vehicleStatus?.status!=='restart')continue;
    console.log(`[launcher] Restarting SITL for ${current.vehicleStatus.pendingId}; preserving saved parameters.`);
    await group.stopChild(sitl);
    await delay(config.timeoutMs+100,undefined,{signal:group.controller.signal});
    if(group.stopping)return;
    sitl=group.start('sitl',executable,sitlArguments(config,{defaults:current.vehicleStartup.defaults,mavlinkPort,home:current.home}),{cwd:runDir});
    await waitFor('vehicle restart',async()=>{const next=await state();return next.vehicleStatus?.status!=='restart'&&next.connected;},40000);
   }
  })().catch(error=>{if(!group.stopping){console.error(`[launcher] Vehicle restart failed: ${error.message}`);void group.stop(1);}});
  await waitFor('SITL JSON connection',async()=>(await state()).connected,40000);
 }
 if(!values['no-video']){
  group.start('video',process.execPath,[path.join(root,'scripts/camera-stream.mjs'),'--url',url,'--camera',values.camera,'--fov',values.fov,'--browser',values.browser],{cwd:root,ipc:true});
  await waitFor('background camera',async()=>{const response=await fetch(url+'/api/video',{signal:AbortSignal.timeout(1000)});return (await response.json()).state==='streaming';},30000);
 }
 console.log(`\n[launcher] READY · ${url}\n[launcher] Terrain: ${values['mission-planner']?'waiting for selected start':values['choose-location']?(await state()).environment:environment.terrain?.name??'Test playground'}\n[launcher] Video: ${values['no-video']?'disabled':url+'/camera.mjpg'}\n[launcher] ${values['mission-planner']?'Waiting for Mission Planner Simulation start; see docs/mission-planner-start.md':values.standalone?'Standalone keyboard mode':`Mission Planner TCP ${mavlinkPort} · companion ${mavlinkPort+2}`}\n[launcher] Ctrl+C stops ${values['mission-planner']?'backend and video; stop SITL in Mission Planner':'video, SITL and backend'}. Saved parameters are ${values.wipe?'being reset for this run':'preserved'}.\n`);
 process.exitCode=await group.finished;
}catch(error){if(!group.stopping){console.error(`[launcher] ${error.message}`);process.exitCode=await group.stop(1);}else process.exitCode=await group.finished;}
finally{if(process.connected)process.disconnect();}
