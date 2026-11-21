import * as T from '/three.js';
import {CameraVideo} from '/video.js';
import {createCrawler} from '/assets/MN-168.js';
import {createWeatherView} from '/weather-view.js';
import {createScenery} from '/scenery.js';
import {addTerrain,addTreeCrown} from '/terrain-view.js';
import {addOsmOverlay} from '/osm-view.js';
if(new URLSearchParams(location.search).has('camera-output'))document.documentElement.dataset.cameraOutput='true';
const cameraVideo=new CameraVideo();
const $=id=>document.getElementById(id),canvas=$('view'),viewport=$('viewport'),settingsDialog=$('settingsDialog');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.setClearColor(0xa4c8db);
const scene=new T.Scene();scene.fog=new T.Fog(0xa4c8db,35,95);const ambient=new T.HemisphereLight(0xcfeeff,0x3b4529,2.5);scene.add(ambient);const sun=new T.DirectionalLight(0xfff2d1,3);sun.position.set(10,25,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.02;scene.add(sun);
const scenery=createScenery(renderer);scene.add(scenery.sky);
const rover=new T.Group();scene.add(rover);scene.userData.roverPosition=rover.position;
const weatherView=createWeatherView(scene,renderer,sun,ambient,scenery);const camera=new T.PerspectiveCamera(85,1,.015,150),chase=new T.PerspectiveCamera(65,1,.03,150);
// Rendering and video capture do not own physics or MAVLink control.
export const fpvOutput={camera,canvas,renderer,scene};
function box(size,color,parent=scene){const m=new T.Mesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color,roughness:.85}));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
let state=null,config=null,wheels=[],ws,mode='sitl',lastReceive=0,crawler=null,locations=[],locationMode=null;
function notice(message){$('notice').textContent=message;$('notice').style.display='block';setTimeout(()=>$('notice').style.display='none',7000);}
function setup(m){$('missionPlannerSetup').hidden=!m.missionPlannerCommand;$('missionPlannerCommand').value=m.missionPlannerCommand??'';locationMode=m.locationMode;locations=m.locations??[];$('locationPicker').hidden=!locations.length;$('locationSelect').replaceChildren(...locations.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.id==='custom'?p.name:`${p.name} · ${p.reliefM} m relief`;return o;}));$('locationSelect').value=m.selectedLocation??state?.selectedLocation??locations[0]?.id??'';describeLocation();config=m.config;mode=m.mode;const c=config.vehicle;$('mode').textContent=mode==='sitl'?'ARDUROVER SITL':'STANDALONE · NO AUTOPILOT';$('help').textContent=mode==='sitl'?'Drive using Mission Planner or your MAVLink companion. Browser keys do not control physics.':'W/S or ↑/↓: forward / brake / reverse. A/D or ←/→: steer. Release to stop. Click the view to focus.';$('keyLegend').hidden=mode!=='standalone';for(const id of ['armState','flightMode'])$(id).hidden=mode!=='sitl';
  if(crawler){rover.remove(crawler.model);crawler.dispose();}
  crawler=createCrawler(c);rover.add(crawler.model);wheels=crawler.wheels;
  // Init is resent on reconnect; replace world instead of duplicating objects.
  if(scene.userData.world){const old=scene.userData.world;scene.remove(old);old.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(o.name==='real-terrain')m.map?.dispose();m.dispose();}}});}const world=new T.Group();scene.userData.world=world;scene.add(world);
  scenery.sky.scale.setScalar(m.terrain?10:1);
  if(m.terrain){addTerrain(world,m.terrain,renderer);scene.fog.near=70;scene.fog.far=650;for(const c of [camera,chase]){c.far=1500;c.updateProjectionMatrix();}}else{scene.fog.near=35;scene.fog.far=95;for(const c of [camera,chase]){c.far=150;c.updateProjectionMatrix();}}
  $('landscape').textContent=m.terrain?`${m.terrain.name} · ${(m.terrain.size-1)*m.terrain.spacing} m`:'100 × 100 m playground';
  addOsmOverlay(world,m.overlay);$('osmAttribution').hidden=!m.overlay||!(m.overlay.buildings.length||m.overlay.roads.length);
  $('terrainAttribution').textContent=m.terrain?.attribution??'';cameraVideo.attribution=[m.terrain?.attribution,m.overlay&&(m.overlay.buildings.length||m.overlay.roads.length)?'© OpenStreetMap contributors · https://www.openstreetmap.org/copyright':null,'Weather: open-meteo.com (CC BY 4.0)'].filter(Boolean).join(' · ');
  for(const o of m.world){const mesh=o.kind==='cone'?new T.Mesh(new T.ConeGeometry(o.size[0]/2,o.size[1],16),new T.MeshStandardMaterial({color:o.color})):box(o.size,o.color,world);if(o.kind==='cone'){world.add(mesh);mesh.castShadow=true;}mesh.position.fromArray(o.position);mesh.rotation.z=o.angle??0;if(o.kind==='tree')addTreeCrown(world,o);}
  if(!m.terrain){scenery.decorate(world);
  const grid=new T.GridHelper(100,100,0x7c8a69,0x718361);grid.position.y=.002;world.add(grid);}
}
function send(m){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='init')setup(m);if(m.type==='error')notice(m.message);if(m.type==='state'){state=m;lastReceive=performance.now();}};ws.onclose=()=>{keys.clear();$('connection').textContent='Backend offline · reconnecting';$('connection').dataset.state='offline';setTimeout(connect,1000);};}
connect();
$('run').onclick=()=>send({type:'running',value:!state?.running});$('reset').onclick=()=>send({type:'reset'});
function describeLocation(){const p=locations.find(p=>p.id===$('locationSelect').value);$('locationHint').textContent=p?(p.id==='custom'?p.description:`${p.description} · 960 m map · ${p.reliefM} m elevation range · bundled offline`):'';}
$('locationSelect').onchange=describeLocation;$('loadLocation').onclick=()=>send({type:'selectLocation',id:$('locationSelect').value});
$('retryOsm').onclick=()=>send({type:'retryOsm'});
$('retryTerrain').onclick=()=>send({type:'retryTerrain'});
$('copyMissionPlannerCommand').onclick=async()=>{
  const field=$('missionPlannerCommand'),status=$('missionPlannerCopyStatus');
  try{await navigator.clipboard.writeText(field.value);status.textContent='Copied';}
  catch{field.focus();field.select();status.textContent='Command selected · press Ctrl+C or ⌘C to copy';}
};
$('fov').oninput=()=>{camera.fov=+$('fov').value;camera.updateProjectionMatrix();$('fovValue').textContent=`${camera.fov}°`;};
function selectCamera(value){$('camera').value=value;for(const id of ['fpv','chase'])$(id).setAttribute('aria-pressed',String(id===value));$('cameraLabel').textContent=value==='fpv'?'ONBOARD FPV':'CHASE CAMERA';}
$('fpv').onclick=()=>selectCamera('fpv');$('chase').onclick=()=>selectCamera('chase');$('camera').onchange=()=>selectCamera($('camera').value);
$('settings').onclick=()=>{release();settingsDialog.showModal();};$('closeSettings').onclick=()=>settingsDialog.close();
viewport.addEventListener('pointerdown',()=>viewport.focus());
const keys=new Set(),valid=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
addEventListener('keydown',e=>{if(mode!=='standalone'||settingsDialog.open||document.activeElement!==viewport)return;const k=e.key.toLowerCase();if(valid.includes(k)){e.preventDefault();keys.add(k);}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function release(){keys.clear();send({type:'keys',steering:0,throttle:0});}addEventListener('blur',release);viewport.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
setInterval(()=>{if(mode==='standalone')send({type:'keys',throttle:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),steering:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});},80);
const mount=new T.Vector3(),target=new T.Vector3(),chasePosition=new T.Vector3();let previousTime=0,previousWall=0,ratio=0;
function render(){requestAnimationFrame(render);const width=viewport.clientWidth,height=viewport.clientHeight;if(canvas.width!==Math.floor(width*renderer.getPixelRatio())||canvas.height!==Math.floor(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);for(const c of [camera,chase]){c.aspect=width/height;c.updateProjectionMatrix();}}
  if(state&&config){const s=state;rover.position.copy(s.position);rover.quaternion.copy(s.rotation);for(let i=0;i<4;i++){const w=s.wheels[i];wheels[i].steer.position.set(w.x,w.y,w.z);wheels[i].steer.rotation.y=i<2?-s.inputs.steering*config.vehicle.maxSteer:0;wheels[i].spin.rotation.z=w.rotation;}
    mount.set(+$('mountX').value||0,+$('mountY').value||0,(+$('mountRight').value||0)).applyQuaternion(rover.quaternion).add(rover.position);camera.position.copy(mount);const pan=(s.camera?.panDeg??0)*Math.PI/180,tilt=(s.camera?.tiltDeg??0)*Math.PI/180;target.set(Math.cos(tilt)*Math.cos(pan),Math.sin(tilt),Math.cos(tilt)*Math.sin(pan)).applyQuaternion(rover.quaternion).add(mount);camera.up.set(0,1,0).applyQuaternion(rover.quaternion);camera.lookAt(target);
    chasePosition.set(-1.8,1.05,.5).applyQuaternion(rover.quaternion).add(rover.position);chase.position.lerp(chasePosition,.12);chase.lookAt(rover.position.clone().add(new T.Vector3(0,.1,0)));
    $('speed').textContent=s.speed.toFixed(2);$('heading').textContent=`${Math.round(s.heading).toString().padStart(3,'0')}°`;$('time').textContent=s.simTime.toFixed(1);$('rate').textContent=s.rate;
    for(const [id,value,index]of [['steer',s.inputs.steering,config.steering.channel-1],['throttle',s.inputs.throttle,config.throttle.channel-1]]){$(id).textContent=`${value.toFixed(2)}${s.raw[index]?` · ${s.raw[index]} µs`:''}`;$(id+'Meter').value=value;}
    const online=performance.now()-lastReceive<2000;const connectionText=!online?'Backend offline':mode==='standalone'?'Standalone physics active':s.connected?'JSON connected':s.resetPending?'Restart SITL to continue':'Waiting for SITL · physics held';if($('connection').textContent!==connectionText)$('connection').textContent=connectionText;$('connection').dataset.state=!online?'offline':s.connected||mode==='standalone'?'online':'waiting';
    const autopilot=online&&s.autopilot?.connected?s.autopilot:null;
    const armText=autopilot?autopilot.armed?'ARMED':'DISARMED':'ARM UNKNOWN',flightText=autopilot?.flightMode??'MODE UNKNOWN';
    for(const [id,text] of [['armState',armText],['flightMode',flightText]])if($(id).textContent!==text)$(id).textContent=text;
    $('armState').dataset.state=autopilot?autopilot.armed?'armed':'disarmed':'unknown';$('flightMode').dataset.state=autopilot?.flightMode?'known':'unknown';
    if(s.wallTime!==previousWall){ratio=(s.simTime-previousTime)/(s.wallTime-previousWall);previousTime=s.simTime;previousWall=s.wallTime;}
    const terrainMessage=s.startTerrain?.message??'';if($('startTerrainStatus').textContent!==terrainMessage)$('startTerrainStatus').textContent=terrainMessage;$('run').disabled=!!s.startTerrain&&s.startTerrain.status!=='ready'||s.osm?.status==='loading'&&s.osm.hold;
    $('osmStatus').textContent=s.osm?.message??'';$('retryOsm').hidden=s.osm?.status!=='error';$('retryOsm').disabled=!online||s.startTerrain?.status==='loading';
    const externalPicker=locationMode==='mission-planner',unsafeSelection=externalPicker&&(s.connected||s.autopilot?.connected)&&s.autopilot?.armed!==false;
    $('locationSelect').disabled=!online||s.startTerrain?.status==='loading'||(!externalPicker&&s.startTerrain?.status==='ready')||unsafeSelection;$('loadLocation').disabled=$('locationSelect').disabled;
    $('terrainLoad').hidden=!s.startTerrain;$('retryTerrain').hidden=['ready','restart','verifying'].includes(s.startTerrain?.status)||(locations.length>0&&s.startTerrain?.status==='selecting');$('retryTerrain').disabled=!online||((!locations.length||externalPicker)&&s.autopilot?.armed!==false)||['loading','ready'].includes(s.startTerrain?.status);$('retryTerrain').textContent=s.startTerrain?.status==='loading'?'Loading terrain…':'Retry terrain';
    $('run').textContent=s.running?'Stop physics':'Start physics';$('diagnostics').textContent=`RTF ${ratio.toFixed(2)} · packet age ${s.ageMs??'—'} ms · duplicates ${s.stats.duplicates} · skipped ${s.stats.skipped} · malformed ${s.stats.malformed}`;$('status').textContent=s.running?`${$('camera').value==='fpv'?'ONBOARD FPV':'CHASE'} · ${mode==='sitl'?'SITL actuator authority':'keyboard test mode'}`:'PHYSICS STOPPED · sensor time continues in SITL';
  }const activeCamera=$('camera').value==='fpv'?camera:chase;weatherView.update(state?.weather,state?.home,activeCamera,lastReceive);scenery.sky.position.copy(activeCamera.position);renderer.render(scene,activeCamera);cameraVideo.capture(canvas,performance.now());
}render();
