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
import {playground} from './world.js';
const args=process.argv.slice(2),configIndex=args.indexOf('--config');
const config=loadConfig(configIndex>=0?args[configIndex+1]:undefined);
const mode=args.includes('--standalone')?'standalone':'sitl';
const physics=await Physics.create(config.vehicle,!args.includes('--flat'));
const session=new Session(physics,config);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let running=true,pending=null,due=performance.now(),malformed=0,lastLog=0,lastConnected=false,resetPending=false;
let keyboard={steering:0,throttle:0,time:0,owner:null};
const log=(event,data={})=>console.log(JSON.stringify({time:new Date().toISOString(),event,...data}));
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));return;}
  const files={'/':'web/index.html','/app.js':'web/app.js','/style.css':'web/style.css','/three.js':'node_modules/three/build/three.module.js','/three.core.js':'node_modules/three/build/three.core.js'};
  try{const file=files[url.pathname];if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)));}catch{res.writeHead(500);res.end('asset unavailable');}
});
// Browser control is local, same-origin only; no MAVLink proxy on this socket.
const wss=new WebSocketServer({server,maxPayload:4096,verifyClient:({origin,req})=>origin===`http://${req.headers.host}`});
wss.on('connection',ws=>{
  ws.send(JSON.stringify({type:'init',mode,config,world:args.includes('--flat')?playground.slice(0,1):playground}));
  ws.on('message',data=>{try{
    const m=JSON.parse(data);let error;
    if(m.type==='keys'&&mode==='standalone'){
      if(keyboard.owner&&keyboard.owner!==ws&&performance.now()-keyboard.time<300)return;
      const steering=Math.max(-1,Math.min(1,Number(m.steering)||0)),throttle=Math.max(-1,Math.min(1,Number(m.throttle)||0));
      keyboard={steering,throttle,time:performance.now(),owner:steering||throttle?ws:null};
    } else if(m.type==='running'){running=!!m.value;session.running=running;log('running',{running});}
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
function snapshot(){const state=physics.state();return {type:'state',mode,running,connected:mode==='standalone'||performance.now()-session.last<config.timeoutMs,resetPending,...state,simTime:mode==='sitl'?session.time:physics.time,rate:session.rate??100,ageMs:Number.isFinite(session.last)?Math.round(performance.now()-session.last):null,raw:session.raw??[],stats:{...session.stats,malformed,lagDropped},wallTime:performance.now()/1000};}
const broadcast=setInterval(()=>{const msg=JSON.stringify(snapshot());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(msg);},50);
wss.on('error',e=>{log('websocket-error',{message:e.message});process.exitCode=1;});
server.on('error',e=>{log('http-error',{message:e.message});process.exitCode=1;shutdown();});
server.listen(config.httpPort,config.httpHost,()=>log('ready',{url:`http://${config.httpHost}:${config.httpPort}`,mode}));
function shutdown(){clearInterval(tick);clearInterval(broadcast);if(pending)clearTimeout(pending.timer);for(const ws of wss.clients)ws.terminate();wss.close();server.close();if(mode==='sitl')udp.close();physics.free();}
process.on('SIGINT',()=>{shutdown();});process.on('SIGTERM',()=>{shutdown();});
