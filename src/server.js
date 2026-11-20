import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {WebSocketServer,WebSocket} from 'ws';
import {loadConfig} from './config.js';
import {Physics} from './physics.js';
import {Session} from './session.js';
import {decodeActuators} from './protocol.js';
import {loadEnvironment} from './environment.js';
import {HeartbeatTelemetry} from './mavlink.js';
import {cameraAim} from './camera.js';
import {LiveWeather} from './weather.js';
import {loadStartTerrain} from './start-terrain.js';
import {terrainObjects} from './terrain.js';
import {VideoRelay} from './video.js';
const args=process.argv.slice(2),configIndex=args.indexOf('--config');
const config=loadConfig(configIndex>=0?args[configIndex+1]:undefined);
const externalStart=args.includes('--mission-planner');
if(externalStart&&(args.includes('--standalone')||args.includes('--flat')||args.includes('--playground')||!config.mavlink))throw Error('--mission-planner needs MAVLink telemetry and cannot be combined with standalone/flat/playground');
const mode=args.includes('--standalone')?'standalone':'sitl';
let environment=loadEnvironment(externalStart?{...config,terrain:null}:config,configIndex>=0?args[configIndex+1]:undefined,{flat:externalStart||args.includes('--flat'),playground:args.includes('--playground')});
let physics=await Physics.create(config.vehicle,!externalStart&&!args.includes('--flat'),environment.terrain);
const session=new Session(physics,config);
let weather=new LiveWeather(environment.home,{timeZone:environment.timeZone});if(!externalStart)weather.start();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const log=(event,data={})=>console.log(JSON.stringify({time:new Date().toISOString(),event,...data}));
let startTerrain=externalStart?{status:'waiting',message:'Waiting for Mission Planner start coordinates and disarmed telemetry'}:null;
const terrainAbort=new AbortController();
const telemetry=new HeartbeatTelemetry(config.mavlink??{});
let telemetrySocket=null;
if(mode==='sitl'&&config.mavlink){
  telemetrySocket=dgram.createSocket('udp4');
  telemetrySocket.on('message',bytes=>{telemetry.receive(bytes,performance.now());void loadPickedStart();});
  telemetrySocket.on('error',e=>{log('mavlink-error',{message:e.message});telemetrySocket.close();telemetrySocket=null;});
  telemetrySocket.bind(config.mavlink.port,config.mavlink.host,()=>log('mavlink-listening',{port:config.mavlink.port}));
}
let running=!externalStart,pending=null,due=performance.now(),malformed=0,lastLog=0,lastConnected=false,resetPending=false;
session.running=running;
let keyboard={steering:0,throttle:0,time:0,owner:null};
const video=new VideoRelay();
const server=http.createServer(async(req,res)=>{
  if(video.handleHttp(req,res))return;
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));return;}
  const files={'/':'web/index.html','/app.js':'web/app.js','/assets/MN-168.js':'assets/MN-168.js','/style.css':'web/style.css','/video.js':'web/video.js','/scenery.js':'web/scenery.js','/weather-view.js':'web/weather-view.js','/weather-model.js':'src/weather-model.js','/terrain.js':'src/terrain.js','/terrain-view.js':'web/terrain-view.js','/three.js':'node_modules/three/build/three.module.js','/three.core.js':'node_modules/three/build/three.core.js'};
  try{const file=files[url.pathname];if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)));}catch{res.writeHead(500);res.end('asset unavailable');}
});
// Browser control is local, same-origin only; no MAVLink proxy on this socket.
const wss=new WebSocketServer({noServer:true,maxPayload:4096,verifyClient:({origin,req})=>origin===`http://${req.headers.host}`});
server.on('upgrade',(req,socket,head)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/video-source')video.handleUpgrade(req,socket,head);
  else if(pathname==='/')wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  else socket.destroy();
});
wss.on('connection',ws=>{
  ws.send(JSON.stringify(initialState()));
  ws.on('message',data=>{try{
    const m=JSON.parse(data);let error;
    if(m.type==='keys'&&mode==='standalone'){
      if(keyboard.owner&&keyboard.owner!==ws&&performance.now()-keyboard.time<300)return;
      const steering=Math.max(-1,Math.min(1,Number(m.steering)||0)),throttle=Math.max(-1,Math.min(1,Number(m.throttle)||0));
      keyboard={steering,throttle,time:performance.now(),owner:steering||throttle?ws:null};
    } else if(m.type==='retryTerrain'){
      if(!externalStart)error='Terrain retry is available in Mission Planner start-selection mode.';
      else if(startTerrain.status==='loading')error='Terrain is already loading.';
      else if(startTerrain.status==='ready')error='Terrain is already loaded.';
      else if(telemetry.snapshot(performance.now()).armed!==false)error='Disarm SITL and wait for fresh telemetry before retrying terrain.';
      else if(!telemetry.positionSnapshot(performance.now()))error='Waiting for fresh start coordinates from SITL.';
      else{running=false;session.running=false;startTerrain={status:'waiting',message:'Retrying selected start terrain'};void loadPickedStart();}
    } else if(m.type==='running'){if(externalStart&&startTerrain.status!=='ready')error='Wait for the selected start terrain to finish loading.';else{running=!!m.value;session.running=running;log('running',{running});}}
    else if(m.type==='reset'){
      if(mode==='standalone'){physics.reset();keyboard.throttle=0;keyboard.steering=0;}
      else if(performance.now()-session.last<config.timeoutMs)error='Stop the SITL process first, wait for timeout, then reset and restart SITL. Live teleport would invalidate EKF state.';
      else {physics.reset();session.clock.count=null;session.cached=null;session.peer=null;resetPending=true;log('reset-awaiting-sitl-restart');}
    }
    if(error)ws.send(JSON.stringify({type:'error',message:error}));
  }catch{ws.send(JSON.stringify({type:'error',message:'Invalid control message'}));}});
  ws.on('close',()=>{if(keyboard.owner===ws)keyboard={steering:0,throttle:0,time:0,owner:null};});
});
const udp=dgram.createSocket('udp4');
udp.on('error',e=>{log('udp-error',{message:e.message});process.exitCode=1;shutdown();});
if(mode==='sitl'){
  udp.on('message',(bytes,remote)=>{
    const now=performance.now();
    try{
      const p=decodeActuators(bytes),key=`${remote.address}:${remote.port}`;
      if(pending){if(p.count===pending.count&&key===pending.key)return;return;}
      const reply=session.receive(p,key,now);if(!reply)return;
      resetPending=false;
      if(reply.event==='restart')log('sitl-restarted',{peer:key});
      if(reply.event==='gap')log('frame-gap-resync',{peer:key,count:p.count});
      due=Math.max(due,now-100)+reply.dt*1000;
      const delay=Math.max(0,due-now);
      const timer=setTimeout(()=>{pending=null;if(reply.bytes)udp.send(reply.bytes,remote.port,remote.address);},delay);
      pending={timer,count:p.count,key};
    }catch(e){malformed++;if(now-lastLog>1000){log('bad-actuator',{message:e.message,malformed});lastLog=now;}}
  });udp.bind(config.udpPort,config.udpHost,()=>log('json-listening',{host:config.udpHost,port:config.udpPort}));
}
let previous=performance.now(),accumulator=0,lagDropped=0;
const tick=setInterval(()=>{const now=performance.now();if(mode==='standalone'){
  accumulator+=Math.min(.1,(now-previous)/1000);if(accumulator>.1){lagDropped+=accumulator-.1;accumulator=.1;}
  const input=now-keyboard.time<300?keyboard:{throttle:0,steering:0};
  while(accumulator>=.01){if(running)physics.step(.01,input.throttle,input.steering);accumulator-=.01;}
}previous=now;
const connected=mode==='sitl'&&now-session.last<config.timeoutMs;if(connected!==lastConnected){log(connected?'sitl-connected':'sitl-timeout',{peer:session.peer});lastConnected=connected;}
},5);
function snapshot(){const state=physics.state();return {type:'state',mode,running,startTerrain,environment:environment.terrain?.name??'Test playground',home:environment.home,weather:weather.snapshot(),camera:cameraAim(mode==='sitl'?telemetry.rcSnapshot(performance.now()):null),autopilot:mode==='sitl'?telemetry.snapshot(performance.now()):null,connected:mode==='standalone'||performance.now()-session.last<config.timeoutMs,resetPending,...state,simTime:mode==='sitl'?session.time:physics.time,rate:session.rate??100,ageMs:Number.isFinite(session.last)?Math.round(performance.now()-session.last):null,raw:session.raw??[],stats:{...session.stats,malformed,lagDropped},wallTime:performance.now()/1000};}
const broadcast=setInterval(()=>{const msg=JSON.stringify(snapshot());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(msg);},50);
wss.on('error',e=>{log('websocket-error',{message:e.message});process.exitCode=1;});
server.on('error',e=>{log('http-error',{message:e.message});process.exitCode=1;shutdown();});
server.listen(config.httpPort,config.httpHost,()=>log('ready',{url:`http://${config.httpHost}:${config.httpPort}`,mode}));
let shuttingDown=false;
function initialState(){return {type:'init',mode,config,world:environment.world,terrain:environment.terrain};}
async function loadPickedStart(){
 if(!externalStart||startTerrain.status!=='waiting'||shuttingDown)return;
 const now=performance.now(),home=telemetry.positionSnapshot(now);
 if(!home||telemetry.snapshot(now).armed!==false)return;
 startTerrain={status:'loading',message:'Downloading terrain for selected start',home};log('terrain-start-loading',{home});
 try{
  const {terrain,cached}=await loadStartTerrain(home,{signal:terrainAbort.signal});
  if(shuttingDown)return;
  const safe=()=>{const now=performance.now(),p=telemetry.positionSnapshot(now);return telemetry.snapshot(now).armed===false&&p&&Math.abs(p.lat-home.lat)<1e-7&&Math.abs(p.lon-home.lon)<1e-7;};
  if(!safe())throw Error('Start changed or disarmed telemetry lost during loading. Disarm and retry.');
  const replacement=await Physics.create(config.vehicle,true,terrain);
  if(shuttingDown||!safe()){replacement.free();if(shuttingDown)return;throw Error('Disarm and retry loading terrain.');}
  physics.free();physics=replacement;session.physics=physics;
  environment={terrain,world:terrainObjects(terrain),home,timeZone:config.timeZone??terrain.timeZone??null};
  weather.close();weather=new LiveWeather(home,{timeZone:environment.timeZone});weather.start();
  startTerrain={status:'ready',message:'Terrain ready · start physics when ready',home,cached};
  const init=JSON.stringify(initialState());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(init);
  log('terrain-start-ready',{home,cached});
 }catch(error){if(!shuttingDown){
  const reason=error.stderr?.match(/(?:^|\n)[A-Za-z]*Error(?: \[[^\]]+\])?: ([^\n]+)/)?.[1]??error.message.split('\n')[0];
  startTerrain={status:'error',message:`Terrain load failed: ${reason}. Use Retry terrain when ready.`,home};log('terrain-start-error',{message:error.message});
 }}
}
function shutdown(){if(shuttingDown)return;shuttingDown=true;terrainAbort.abort();weather.close();video.close();clearInterval(tick);clearInterval(broadcast);if(pending)clearTimeout(pending.timer);for(const ws of wss.clients)ws.terminate();wss.close();server.close();if(mode==='sitl')udp.close();telemetrySocket?.close();physics.free();if(process.connected)process.disconnect();}
process.on('SIGINT',()=>{shutdown();});process.on('SIGTERM',()=>{shutdown();});

process.on('message',m=>{if(m?.type==='shutdown')shutdown();});
process.on('disconnect',shutdown);
