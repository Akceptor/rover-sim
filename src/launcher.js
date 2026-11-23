import net from 'node:net';
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
const vehiclesDir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','config','vehicles');
const vehicleParmIds=fs.readdirSync(vehiclesDir).filter(d=>{try{return fs.statSync(path.join(vehiclesDir,d)).isDirectory()&&fs.existsSync(path.join(vehiclesDir,d,'sitl.parm'));}catch{return false;}});
export function loadLauncherConfig(file){
 let config;
 try{config=JSON.parse(fs.readFileSync(file,'utf8'));}
 catch(error){throw Error(`Cannot read launcher config ${file}: ${error.message}. Copy config/launcher.example.json to config/launcher.local.json and set sitlExe.`);}
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Launcher config must be an object');
 for(const key of Object.keys(config))if(!['sitlExe','backendConfig'].includes(key))throw Error(`Unknown launcher setting: ${key}. --wipe is only allowed on the command line.`);
 for(const key of ['sitlExe','backendConfig'])if(config[key]!==undefined&&(typeof config[key]!=='string'||!config[key].trim()))throw Error(`Launcher ${key} must be a nonempty path`);
 return Object.fromEntries(Object.entries(config).map(([key,value])=>[key,path.resolve(path.dirname(file),value)]));
}
export const localHost=host=>['0.0.0.0','::'].includes(host)?'127.0.0.1':host;
export function sitlArguments(config,{defaults,mavlinkPort=5760,wipe=false,home={lat:50.4501,lon:30.5234,alt:100}}={}){
 const telemetry=config.mavlink??{host:'127.0.0.1',port:14560};
 return ['--model',`JSON:${localHost(config.udpHost)}`,'--sim-port-out',String(config.udpPort),'--rate','100','--speedup','1','--home',`${home.lat},${home.lon},${home.alt},0`,'--defaults',defaults,'--serial0',`tcp:${mavlinkPort}`,'--serial1',`tcp:${mavlinkPort+2}`,'--serial2',`udpclient:${localHost(telemetry.host)}:${telemetry.port}`,...(wipe?['--wipe']:[])];
}
export function missionPlannerArguments(config,defaults){
 const telemetry=config.mavlink;
 if(!telemetry)throw Error('Mission Planner start selection needs MAVLink telemetry configuration');
 return ['--model',`JSON:${localHost(config.udpHost)}`,'--sim-port-out',String(config.udpPort),'--rate','100','--speedup','1','--serial2',`udpclient:${localHost(telemetry.host)}:${telemetry.port}`,'--defaults',defaults];
}
export function missionPlannerCommand(config,defaults){
 return missionPlannerArguments(config,defaults).map(a=>/\s/.test(a)?`"${a}"`:a).join(' ');
}
export async function checkPorts(ports){
 const results=await Promise.allSettled(ports.map(({kind,host,port,name})=>new Promise((resolve,reject)=>{
  const listener=kind==='tcp'?net.createServer():dgram.createSocket('udp4');
  listener.once('error',error=>{try{listener.close();}catch{}reject(Error(`${name}: ${kind.toUpperCase()} ${host}:${port} ${error.code==='EADDRINUSE'?'is in use. Stop the old simulator first.':error.message}`));});
  const ready=()=>listener.close(resolve);
  if(kind==='tcp')listener.listen(port,host,ready);else listener.bind(port,host,ready);
 })));
 const failures=results.filter(r=>r.status==='rejected');if(failures.length)throw Error(failures.map(r=>r.reason.message).join('\n'));
}
// EEPROM values still override every defaults file. These describe the values
// expected by the simulator, and also drive the live parameter compatibility gate.
export function vehicleServoParameters(config){
 const tracks=config.vehicle.drivetrain==='tracked';
 const outputs=tracks?[[config.leftTrack,73],[config.rightTrack,74]]:[[config.steering,26],[config.throttle,70]];
 const parameters={SERVO2_FUNCTION:0,SERVO4_FUNCTION:0};
 for(const [calibration,fn] of outputs){
  const prefix=`SERVO${calibration.channel}_`;
  parameters[prefix+'FUNCTION']=fn;
  for(const key of ['min','trim','max','reversed'])parameters[prefix+key.toUpperCase()]=Number(calibration[key]);
 }
 return parameters;
}
export function vehicleDefaults(config,{root,base=path.join(root,'config/rover.parm'),calibration}={}){
 const [first,...extras]=base.split(',');
 const id=vehicleParmIds.includes(config.vehicle.id)?config.vehicle.id:config.vehicle.drivetrain==='tracked'?'tracked-crawler':'mn168';
 return [first,path.join(root,'config/vehicles',id,'sitl.parm'),...(calibration?[calibration]:[]),...extras].join(',');
}
export function vehicleCalibrationText(config){
 return '# Generated simulator calibration; saved EEPROM retains precedence.\n'+Object.entries(vehicleServoParameters(config)).map(([key,value])=>`${key} ${value}`).join('\n')+'\n';
}
