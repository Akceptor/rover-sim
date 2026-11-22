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
import {loadOsmOverlay} from './osm-cache.js';
import {SavedLocations} from './saved-locations.js';
import {overlayGeometry} from './osm.js';
import {terrainObjects} from './terrain.js';
import {locationPresets,findLocation,createMapLocation} from './locations.js';
import {mapData,mapPosition} from './map-data.js';
import {VideoRelay} from './video.js';
import {missionPlannerCommand} from './launcher.js';
const args=process.argv.slice(2),configIndex=args.indexOf('--config');
const config=loadConfig(configIndex>=0?args[configIndex+1]:undefined);
const externalStart=args.includes('--mission-planner'),locationPicker=args.includes('--location-picker'),pendingLocation=externalStart||locationPicker;
if(locationPicker&&(externalStart||args.includes('--flat')||args.includes('--playground')))throw Error('Location picker cannot be combined with mission-planner/flat/playground');
if(externalStart&&(args.includes('--standalone')||args.includes('--flat')||args.includes('--playground')||!config.mavlink))throw Error('--mission-planner needs MAVLink telemetry and cannot be combined with standalone/flat/playground');
const mode=args.includes('--standalone')?'standalone':'sitl';
let environment=loadEnvironment(pendingLocation?{...config,terrain:null}:config,configIndex>=0?args[configIndex+1]:undefined,{flat:pendingLocation||args.includes('--flat'),playground:args.includes('--playground')});
let overlay=null,overlayMesh=null,worldRevision=0,worldStarted=false;
let osmStatus={status:environment.terrain&&config.osm!==false?'loading':'disabled',hold:true};
let physics=await Physics.create(config.vehicle,!pendingLocation&&!args.includes('--flat'),environment.terrain);
const session=new Session(physics,config);
let weather=new LiveWeather(environment.home,{timeZone:environment.timeZone});if(!pendingLocation)weather.start();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const defaultsIndex=args.indexOf('--mission-planner-defaults');
const plannerCommand=externalStart?missionPlannerCommand(config,defaultsIndex>=0?args[defaultsIndex+1]:path.join(root,'config/rover.parm')):null;
const log=(event,data={})=>console.log(JSON.stringify({time:new Date().toISOString(),event,...data}));
const savedLocations=new SavedLocations({directory:config.savedLocationsDir??path.join(root,'saved-locations'),report:error=>log('saved-location-error',{message:error.message})});
let favorites=[];try{favorites=await savedLocations.list();}catch(error){log('saved-location-error',{message:error.message});}
let favoriteOperations=Promise.resolve(),loadedFavorite=null,overlayDefaultHeight=config.osm?.defaultHeight??6;
let selectedLocation=externalStart?'custom':null,selectedMapLocation=null;
let worldMap=mapData(environment.terrain,null,environment.home);
const selectedPreset=id=>id==='map'&&selectedMapLocation?selectedMapLocation:id?.startsWith('saved:')?(favorites.find(p=>p.id===id)??(loadedFavorite?.id===id?loadedFavorite:null)??{id,name:'Saved location unavailable',favorite:true}):findLocation(id);
let startTerrain=locationPicker?{status:'selecting',message:'Choose a starting location below'}:externalStart?{status:'waiting',message:'Waiting for Mission Planner start coordinates and disarmed telemetry'}:null;
const terrainAbort=new AbortController();
const telemetry=new HeartbeatTelemetry(config.mavlink??{});
let telemetrySocket=null;
if(mode==='sitl'&&config.mavlink){
  telemetrySocket=dgram.createSocket('udp4');
  telemetrySocket.on('message',bytes=>{telemetry.receive(bytes,performance.now());checkSelectedGps();void loadPickedStart();});
  telemetrySocket.on('error',e=>{log('mavlink-error',{message:e.message});telemetrySocket.close();telemetrySocket=null;});
  telemetrySocket.bind(config.mavlink.port,config.mavlink.host,()=>log('mavlink-listening',{port:config.mavlink.port}));
}
let running=!pendingLocation&&osmStatus.status!=='loading',pending=null,due=performance.now(),malformed=0,lastLog=0,lastConnected=false,resetPending=false;
session.running=running;
let keyboard={steering:0,throttle:0,time:0,owner:null};
const video=new VideoRelay();
const server=http.createServer(async(req,res)=>{
  if(video.handleHttp(req,res))return;
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot()));return;}
  const files={'/':'web/index.html','/app.js':'web/app.js','/assets/MN-168.js':'assets/MN-168.js','/style.css':'web/style.css','/video.js':'web/video.js','/scenery.js':'web/scenery.js','/weather-view.js':'web/weather-view.js','/weather-model.js':'src/weather-model.js','/terrain.js':'src/terrain.js','/terrain-view.js':'web/terrain-view.js','/location-map.js':'web/location-map.js','/leaflet.js':'node_modules/leaflet/dist/leaflet.js','/leaflet.css':'node_modules/leaflet/dist/leaflet.css','/osm-view.js':'web/osm-view.js','/building-surfaces.js':'web/building-surfaces.js','/building-textures.js':'web/building-textures.js','/assets/textures/building-materials.png':'assets/textures/building-materials.png','/osm-footprints.js':'src/osm-footprints.js','/three.js':'node_modules/three/build/three.module.js','/three.core.js':'node_modules/three/build/three.core.js'};
  try{const file=files[url.pathname];if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(path.join(root,file)));}catch(error){log('asset-error',{asset:url.pathname,code:error.code,message:error.message});res.writeHead(500);res.end('asset unavailable');}
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
    } else if(m.type==='selectLocation'){
      if(!locationPicker&&!externalStart)error='Start with --choose-location or --mission-planner to select a location.';
      else if(startTerrain.status==='loading'||(locationPicker&&startTerrain.status==='ready'))error='Location is loading or already selected.';
      else if(externalStart&&sitlActive()&&telemetry.snapshot(performance.now()).armed!==false)error='Disarm SITL and wait for fresh telemetry before changing location.';
      else if(locationPicker&&mode==='sitl'&&sitlActive())error='Stop SITL before choosing a start; the launcher starts it after selection.';
      else if(m.id==='custom'&&externalStart)selectCustom();
      else if(m.id==='map')void loadPreset(createMapLocation(m.lat,m.lon));
      else void loadPreset(selectedPreset(m.id));
    } else if(m.type==='retryTerrain'){
      if((locationPicker||externalStart)&&startTerrain.status==='error'&&selectedLocation&&selectedLocation!=='custom'){
        if(externalStart&&sitlActive()&&telemetry.snapshot(performance.now()).armed!==false)error='Disarm SITL before retrying the location.';
        else void loadPreset(selectedPreset(selectedLocation));
      }
      else if(!externalStart)error='Terrain retry is available in Mission Planner start-selection mode.';
      else if(['restart','verifying'].includes(startTerrain.status))error='Restart SITL in Mission Planner and wait for the selected GPS position.';
      else if(startTerrain.status==='loading')error='Terrain is already loading.';
      else if(startTerrain.status==='ready')error='Terrain is already loaded.';
      else if(telemetry.snapshot(performance.now()).armed!==false)error='Disarm SITL and wait for fresh telemetry before retrying terrain.';
      else if(!telemetry.positionSnapshot(performance.now()))error='Waiting for fresh start coordinates from SITL.';
      else{running=false;session.running=false;startTerrain={status:'waiting',message:'Retrying selected start terrain'};void loadPickedStart();}
    } else if(m.type==='saveLocation'){void saveLocation(ws,m);
    } else if(m.type==='removeLocation'){void removeLocation(ws,m);
    } else if(m.type==='retryOsm'){void retryOsm();
    } else if(m.type==='running'){if(osmStatus.status==='loading'&&!worldStarted)error='Wait for OSM loading to finish.';else if(startTerrain&&startTerrain.status!=='ready')error='Wait for the selected start terrain to finish loading.';else{running=!!m.value;worldStarted||=running;session.running=running;log('running',{running});}}
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
      if(startTerrain?.status==='restart'&&session.stats.restarts>startTerrain.restartFrom){
        telemetry.simPosition=null;telemetry.globalPosition=null;
        if(selectedLocation==='custom')startTerrain={status:'waiting',message:'Waiting for Mission Planner start coordinates and disarmed telemetry'};
        else startTerrain={...startTerrain,status:'verifying',message:'Waiting for GPS at the selected preset · physics held'};
      }
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
function snapshot(){const state=physics.state();return {type:'state',mode,running,worldRevision,...saveEligibility(),loadedLocationName:loadedFavorite?.name??environment.terrain?.name??null,startTerrain,osm:osmStatus,selectedLocation,mapSelection:selectedMapLocation,mapPosition:mapPosition(environment.home,state.position),environment:environment.terrain?.name??'Test playground',home:environment.home,weather:weather.snapshot(),camera:cameraAim(mode==='sitl'?telemetry.rcSnapshot(performance.now()):null),autopilot:mode==='sitl'?{...telemetry.snapshot(performance.now()),position:telemetry.positionSnapshot(performance.now())}:null,connected:mode==='standalone'||performance.now()-session.last<config.timeoutMs,resetPending,...state,simTime:mode==='sitl'?session.time:physics.time,rate:session.rate??100,ageMs:Number.isFinite(session.last)?Math.round(performance.now()-session.last):null,raw:session.raw??[],stats:{...session.stats,malformed,lagDropped},wallTime:performance.now()/1000};}
const broadcast=setInterval(()=>{const msg=JSON.stringify(snapshot());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(msg);},50);
wss.on('error',e=>{log('websocket-error',{message:e.message});process.exitCode=1;});
server.on('error',e=>{log('http-error',{message:e.message});process.exitCode=1;shutdown();});
server.listen(config.httpPort,config.httpHost,()=>{log('ready',{url:`http://${config.httpHost}:${config.httpPort}`,mode});if(environment.terrain&&osmStatus.status==='loading')void loadInitialOverlay();});
let shuttingDown=false;
function initialState(){return {type:'init',mode,config,favorites,worldRevision,missionPlannerCommand:plannerCommand,locations:externalStart?[...locationPresets,{id:'custom',name:'Custom · Mission Planner',description:'Fetch terrain at Mission Planner’s selected start'},{id:'map',name:'Custom · browser map',description:'Click the map, then Load location'}]:locationPicker?[...locationPresets,{id:'map',name:'Custom · browser map',description:'Click the map, then Load location'}]:[],selectedLocation,mapSelection:selectedMapLocation,map:worldMap,locationMode:externalStart?'mission-planner':locationPicker?'launcher':null,world:environment.world,terrain:environment.terrain,overlay:overlayMesh?{buildings:overlayMesh.buildings.map(({prisms,...b})=>b),roads:overlayMesh.roads}:null};}
function sitlActive(){return performance.now()-session.last<config.timeoutMs||telemetry.snapshot(performance.now()).connected;}
function selectCustom(){
 worldRevision++;
 selectedLocation='custom';running=false;session.running=false;
 if(session.stats.packets>0||session.home||session.pendingHome){
  session.pendingHome=null;
  startTerrain={status:'restart',restartFrom:session.stats.restarts,message:'Custom selected · stop and start SITL in Mission Planner to read its selected start. Keep this page open.'};
 }else{
  startTerrain={status:'waiting',message:'Waiting for Mission Planner start coordinates and disarmed telemetry'};
  void loadPickedStart();
 }
}
function checkSelectedGps(){
 if(startTerrain?.status!=='verifying')return;
 const now=performance.now(),p=telemetry.positionSnapshot(now),home=environment.home;
 if(p&&telemetry.snapshot(now).armed===false&&Math.abs(p.lat-home.lat)<.00002&&Math.abs(p.lon-home.lon)<.00002&&Math.abs(p.alt-home.alt)<2){
  startTerrain={...startTerrain,status:'ready',message:`${selectedPreset(selectedLocation).name} ready · GPS overridden · start physics when ready`};
 }
}
async function loadPreset(preset){
 const revision=++worldRevision;
 if(preset.id==='map')selectedMapLocation=preset;
 selectedLocation=preset.id;running=false;session.running=false;keyboard={steering:0,throttle:0,time:0,owner:null};
 startTerrain={status:'loading',message:`Loading ${preset.name}`,home:preset};
 try{
  const saved=preset.favorite?await savedLocations.read(preset.id):null;
  const {terrain,cached}=saved?{terrain:saved.terrain,cached:true}:await loadStartTerrain(preset,{cacheDir:config.terrainCacheDir,signal:terrainAbort.signal});
  if(shuttingDown||revision!==worldRevision)return;
  if(locationPicker&&mode==='sitl'&&sitlActive())throw Error('SITL connected before selection finished. Stop it before retrying.');
  if(externalStart&&sitlActive()&&telemetry.snapshot(performance.now()).armed!==false)throw Error('Disarm SITL before retrying the location selection.');
  const prepared=saved?(config.osm===false?{overlay:null,mesh:null,status:{status:'disabled'}}:prepareOverlayResult(terrain,{overlay:saved.overlay,status:saved.overlay.buildings.length||saved.overlay.roads.length?'ready':'empty',cached:true})):await prepareOverlay(terrain,true);
  if(shuttingDown||revision!==worldRevision)return;
  const replacement=await Physics.create(config.vehicle,true,terrain,prepared.overlay,prepared.mesh);
  if(shuttingDown||revision!==worldRevision){replacement.free();return;}
  if(mode==='sitl'&&sitlActive()&&(locationPicker||telemetry.snapshot(performance.now()).armed!==false)){replacement.free();throw Error('Stop or disarm SITL before retrying the location selection.');}
  physics.free();physics=replacement;session.physics=physics;
  overlay=prepared.overlay;overlayMesh=prepared.mesh;osmStatus=prepared.status;worldStarted=false;
  loadedFavorite=saved?{...preset,name:saved.manifest.name,timeZone:saved.manifest.timeZone}:null;
  overlayDefaultHeight=saved?.manifest.defaultHeight??config.osm?.defaultHeight??6;
  const timeZone=saved?saved.manifest.timeZone:preset.timeZone;
  environment={terrain,world:terrainObjects(terrain,overlay),home:terrain.home,timeZone};
  worldMap=mapData(terrain,overlay,environment.home);
  weather.close();weather=new LiveWeather(terrain.home,{timeZone});weather.start();
  startTerrain={status:'ready',message:`${preset.name} ready · ${preset.reliefM??Math.round(Math.max(...terrain.heights)-Math.min(...terrain.heights))} m elevation range`,home:terrain.home,cached};
  if(externalStart){
   if(session.stats.packets>0){
    session.pendingHome=terrain.home;
    startTerrain={...startTerrain,status:'restart',restartFrom:session.stats.restarts,message:`${preset.name} loaded · stop and start SITL in Mission Planner to apply its GPS coordinates. Keep this page open; no map changes needed.`};
   }else{session.home=terrain.home;session.pendingHome=undefined;}
  }
  const init=JSON.stringify(initialState());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(init);
  log('location-selected',{id:preset.id,home:terrain.home,cached});
 }catch(error){if(!shuttingDown&&revision===worldRevision)startTerrain={status:'error',message:`Location load failed: ${error.message}. Use Retry terrain.`,home:preset};}
}
async function loadPickedStart(){
 if(!externalStart||selectedLocation!=='custom'||startTerrain.status!=='waiting'||shuttingDown)return;
 const now=performance.now(),home=telemetry.positionSnapshot(now);
 if(!home||telemetry.snapshot(now).armed!==false)return;
 const revision=++worldRevision;
 startTerrain={status:'loading',message:'Downloading terrain for selected start',home};log('terrain-start-loading',{home});
 try{
  const {terrain,cached}=await loadStartTerrain(home,{cacheDir:config.terrainCacheDir,signal:terrainAbort.signal});
  if(shuttingDown||revision!==worldRevision)return;
  const safe=()=>{const now=performance.now(),p=telemetry.positionSnapshot(now);return telemetry.snapshot(now).armed===false&&p&&Math.abs(p.lat-home.lat)<1e-7&&Math.abs(p.lon-home.lon)<1e-7;};
  if(!safe())throw Error('Start changed or disarmed telemetry lost during loading. Disarm and retry.');
  const prepared=await prepareOverlay(terrain,true);
  if(shuttingDown||revision!==worldRevision)return;
  const replacement=await Physics.create(config.vehicle,true,terrain,prepared.overlay,prepared.mesh);
  if(shuttingDown||revision!==worldRevision||!safe()){replacement.free();if(shuttingDown||revision!==worldRevision)return;throw Error('Disarm and retry loading terrain.');}
  physics.free();physics=replacement;session.physics=physics;
  overlay=prepared.overlay;overlayMesh=prepared.mesh;osmStatus=prepared.status;worldStarted=false;
  loadedFavorite=null;overlayDefaultHeight=config.osm?.defaultHeight??6;
  environment={terrain,world:terrainObjects(terrain,overlay),home,timeZone:config.timeZone??terrain.timeZone??null};
  worldMap=mapData(terrain,overlay,environment.home);
  weather.close();weather=new LiveWeather(home,{timeZone:environment.timeZone});weather.start();
  startTerrain={status:'ready',message:'Terrain ready · start physics when ready',home,cached};
  const init=JSON.stringify(initialState());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(init);
  log('terrain-start-ready',{home,cached});
 }catch(error){if(!shuttingDown&&revision===worldRevision){
  const reason=error.stderr?.match(/(?:^|\n)[A-Za-z]*Error(?: \[[^\]]+\])?: ([^\n]+)/)?.[1]??error.message.split('\n')[0];
  startTerrain={status:'error',message:`Terrain load failed: ${reason}. Use Retry terrain when ready.`,home};log('terrain-start-error',{message:error.message});
 }}
}

function saveEligibility(){
 let hint=null;
 if(!environment.terrain||startTerrain&&startTerrain.status!=='ready')hint='Load a location and wait for terrain to be ready.';
 else if(!Array.isArray(environment.terrain.colors))hint='Satellite RGB imagery is required to save this location.';
 else if(config.osm===false)hint='Enable OpenStreetMap to save an offline location.';
 else if(!overlay||!overlayMesh||!['ready','empty'].includes(osmStatus.status))hint='Wait for OpenStreetMap roads and buildings to be installed; retry OSM if needed.';
 return {canSaveLocation:hint===null,saveLocationHint:hint};
}
function broadcastFavorites(extra){const message=JSON.stringify({type:'favorites',favorites,...extra});for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(message);}
function requestCorrelation(message){return typeof message.requestId==='string'&&message.requestId.length<=128?{requestId:message.requestId}:{};}
function favoriteError(ws,error,correlation){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'error',message:error.message,...correlation}));}
async function saveLocation(ws,message){
 const correlation=requestCorrelation(message);
 try{
  if(message.worldRevision!==worldRevision)throw Error('Location changed; save the currently loaded world again.');
  const eligibility=saveEligibility();if(!eligibility.canSaveLocation)throw Error(eligibility.saveLocationHint);
  // Save clones synchronously before its first await, while this installed pair still matches.
  const currentWeather=weather.snapshot();
  const saved=savedLocations.save({name:message.name,terrain:environment.terrain,overlay,timeZone:currentWeather.timeZoneKnown?currentWeather.timeZone:environment.timeZone??null,defaultHeight:overlayDefaultHeight});
  // List operations are ordered independently of world selection and never rebuild physics.
  const operation=favoriteOperations.then(async()=>{const summary=await saved;favorites=[...favorites,summary];broadcastFavorites({savedId:summary.id,...correlation});});
  saved.catch(()=>{});favoriteOperations=operation.catch(()=>{});await operation;
 }catch(error){favoriteError(ws,error,correlation);}
}
async function removeLocation(ws,message){
 const {id}=message,correlation=requestCorrelation(message);
 const operation=favoriteOperations.then(async()=>{await savedLocations.remove(id);favorites=favorites.filter(p=>p.id!==id);broadcastFavorites({removedId:id,...correlation});});
 favoriteOperations=operation.catch(()=>{});try{await operation;}catch(error){favoriteError(ws,error,correlation);}
}

function broadcastWorld(){const init=JSON.stringify(initialState());for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(init);}
async function prepareOverlay(terrain,worldLoad=false){
 if(config.osm===false)return {overlay:null,mesh:null,status:{status:'disabled'}};
 osmStatus={status:'loading',hold:worldLoad||!worldStarted,message:!worldLoad&&worldStarted?'Downloading OpenStreetMap · applies on next world load':'Loading OpenStreetMap roads and buildings · physics held'};
 const result=await loadOsmOverlay(terrain,{...config.osm,signal:terrainAbort.signal});
 return prepareOverlayResult(terrain,result);
}
function prepareOverlayResult(terrain,result){
 if(result.overlay){
  try{return {overlay:result.overlay,mesh:overlayGeometry(result.overlay,terrain),status:{status:result.status,cached:result.cached,message:result.status==='empty'?'No mapped roads or buildings in this patch':`OpenStreetMap · ${result.overlay.buildings.length} buildings · ${result.overlay.roads.length} roads${result.cached?' · cached offline data':''}`}};}
  catch(error){return {overlay:null,mesh:null,status:{status:'error',message:`OSM geometry failed: ${error.message}. Terrain remains usable · Retry OSM.`}};}
 }
 return {overlay:null,mesh:null,status:{status:'error',message:`OSM unavailable: ${result.message}. Terrain remains usable · Retry OSM.`}};
}
async function loadInitialOverlay(){
 const revision=++worldRevision;
 try{
  const prepared=await prepareOverlay(environment.terrain,true);
  if(shuttingDown||revision!==worldRevision)return;
  const replacement=await Physics.create(config.vehicle,!args.includes('--flat'),environment.terrain,prepared.overlay,prepared.mesh);
  if(shuttingDown||revision!==worldRevision){replacement.free();return;}
  physics.free();physics=replacement;session.physics=physics;
  overlay=prepared.overlay;overlayMesh=prepared.mesh;osmStatus=prepared.status;overlayDefaultHeight=config.osm?.defaultHeight??6;
  environment.world=terrainObjects(environment.terrain,overlay);worldMap=mapData(environment.terrain,overlay,environment.home);
  running=true;worldStarted=true;session.running=true;broadcastWorld();
 }catch(error){if(!shuttingDown){osmStatus={status:'error',message:`OSM unavailable: ${error.message}. Terrain remains usable · Retry OSM.`};running=true;worldStarted=true;session.running=true;}}
}
async function retryOsm(){
 if(!environment.terrain||config.osm===false||osmStatus.status==='loading'||startTerrain?.status==='loading')return;
 const revision=worldRevision,terrain=environment.terrain;
 try{
  const prepared=await prepareOverlay(terrain);
  if(shuttingDown||revision!==worldRevision)return;
  if(!prepared.overlay){osmStatus=prepared.status;return;}
  // Stopping or resetting after driving is not a safe world load. Never insert an obstacle into an existing drive.
  if(worldStarted||running||externalStart&&sitlActive()&&telemetry.snapshot(performance.now()).armed!==false){osmStatus={status:'deferred',message:'OSM cached · applies on next location load or backend restart'};return;}
  const replacement=await Physics.create(config.vehicle,true,terrain,prepared.overlay,prepared.mesh);
  if(shuttingDown||revision!==worldRevision||worldStarted||running){replacement.free();return;}
  physics.free();physics=replacement;session.physics=physics;
  overlay=prepared.overlay;overlayMesh=prepared.mesh;osmStatus=prepared.status;overlayDefaultHeight=config.osm?.defaultHeight??6;
  environment.world=terrainObjects(terrain,overlay);worldMap=mapData(terrain,overlay,environment.home);broadcastWorld();
 }catch(error){if(!shuttingDown&&revision===worldRevision)osmStatus={status:'error',message:`OSM unavailable: ${error.message}. Terrain remains usable · Retry OSM.`};}
}

function shutdown(){if(shuttingDown)return;shuttingDown=true;terrainAbort.abort();weather.close();video.close();clearInterval(tick);clearInterval(broadcast);if(pending)clearTimeout(pending.timer);for(const ws of wss.clients)ws.terminate();wss.close();server.close();if(mode==='sitl')udp.close();telemetrySocket?.close();physics.free();if(process.connected)process.disconnect();}
process.on('SIGINT',()=>{shutdown();});process.on('SIGTERM',()=>{shutdown();});

process.on('message',m=>{if(m?.type==='shutdown')shutdown();});
process.on('disconnect',shutdown);
