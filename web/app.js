import * as T from '/three.js';
import {terrainApproximationWarning} from '/terrain.js';
import {CameraVideo} from '/video.js';
import {createVehicle} from '/assets/vehicle.js';
import {createWeatherView} from '/weather-view.js';
import {createScenery} from '/scenery.js';
import {addTerrain} from '/terrain-view.js';
import {addWorldObjects} from '/instanced-scenery.js';
import {addOsmOverlay} from '/osm-view.js';
import {createLocationMap} from '/location-map.js';
import {createSavedLocations} from '/saved-locations.js';
import {createOsmSettings} from '/osm-settings.js';
import {detectWebGLRendererName,formatQualityStatus,loadQualityPreference,resolveGraphicsProfile,saveQualityPreference} from '/graphics-quality.js';
if(new URLSearchParams(location.search).has('camera-output'))document.documentElement.dataset.cameraOutput='true';
const cameraVideo=new CameraVideo();
const $=id=>document.getElementById(id),canvas=$('view'),viewport=$('viewport'),settingsDialog=$('settingsDialog');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.setClearColor(0xa4c8db);
const rendererName=detectWebGLRendererName(renderer);
let graphicsProfile=resolveGraphicsProfile({preference:loadQualityPreference(globalThis.localStorage),rendererName,devicePixelRatio:globalThis.devicePixelRatio});
const scene=new T.Scene();scene.fog=new T.Fog(0xa4c8db,35,95);const ambient=new T.HemisphereLight(0xcfeeff,0x3b4529,2.5);scene.add(ambient);const sun=new T.DirectionalLight(0xfff2d1,3);sun.position.set(10,25,10);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.02;scene.add(sun);
const scenery=createScenery(renderer,graphicsProfile);scene.add(scenery.sky);
const rover=new T.Group();scene.add(rover);scene.userData.roverPosition=rover.position;
const contactShadow=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,4,32,32,30);g.addColorStop(0,'rgba(0,0,0,0.45)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);const map=new T.CanvasTexture(c);const m=new T.Mesh(new T.PlaneGeometry(1.3,1.0),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));m.rotation.x=-Math.PI/2;m.position.y=.01;rover.add(m);return m;})();
function applyGraphicsProfile(profile){
 graphicsProfile=profile;
 renderer.setPixelRatio(profile.pixelRatio);
 renderer.shadowMap.enabled=profile.shadowsEnabled;
 sun.castShadow=profile.shadowsEnabled;
 if(sun.shadow.mapSize.width!==profile.shadowMapSize){sun.shadow.mapSize.set(profile.shadowMapSize,profile.shadowMapSize);sun.shadow.map?.dispose();sun.shadow.map=null;}
 contactShadow.visible=!profile.shadowsEnabled;
 if($('graphicsQuality'))$('graphicsQuality').value=profile.preference;
 if($('graphicsQualityStatus'))$('graphicsQualityStatus').textContent=formatQualityStatus(profile);
}
applyGraphicsProfile(graphicsProfile);
$('graphicsQuality')?.addEventListener('change',e=>{
 const preference=e.target.value;
 saveQualityPreference(globalThis.localStorage,preference);
 applyGraphicsProfile(resolveGraphicsProfile({preference,rendererName,devicePixelRatio:globalThis.devicePixelRatio}));
});
const weatherView=createWeatherView(scene,renderer,sun,ambient,scenery);const camera=new T.PerspectiveCamera(85,1,.015,150),chase=new T.PerspectiveCamera(65,1,.03,150);
// Rendering and video capture do not own physics or MAVLink control.
export const fpvOutput={camera,canvas,renderer,scene};
function box(size,color,parent=scene){const lambert=graphicsProfile.materialMode==='lambert',Material=lambert?T.MeshLambertMaterial:T.MeshStandardMaterial;const m=new T.Mesh(new T.BoxGeometry(...size),new Material({color,...(lambert?{}:{roughness:.85})}));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
let state=null,config=null,wheels=[],ws,mode='sitl',lastReceive=0,crawler=null,locations=[],baseLocations=[],locationMode=null,mapChoice=null,vehicleRevision=null,activeVehicleId=null;
const locationMap=document.documentElement.dataset.cameraOutput?null:createLocationMap({onPick:point=>{mapChoice=point;$('locationSelect').value='map';describeLocation();savedLocations?.selection();}});
function notice(message){$('notice').textContent=message;$('notice').style.display='block';setTimeout(()=>$('notice').style.display='none',7000);}
const savedLocations=document.documentElement.dataset.cameraOutput?null:createSavedLocations({send,getSelection:()=>({id:$('locationSelect').value,point:mapChoice}),pickerEnabled:()=>baseLocations.length>0,onFavorites:renderLocations});
const osmSettings=document.documentElement.dataset.cameraOutput?null:createOsmSettings({send,openSettings:()=>{release();if(!settingsDialog.open)settingsDialog.showModal();}});
function renderLocations(favorites){
 const selection=$('locationSelect').value;locations=[...baseLocations,...favorites];
 const option=p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.favorite?`${p.name} · Available offline`:['custom','map'].includes(p.id)?p.name:`${p.name} · ${p.reliefM} m relief`;return o;};
 const children=baseLocations.map(option);if(favorites.length){const group=document.createElement('optgroup');group.label='Favorites';group.append(...favorites.map(option));children.push(group);}
 $('locationSelect').replaceChildren(...children);$('locationSelect').value=selection;$('locationPicker').hidden=!locations.length;describeLocation();
}
function setup(m){
 const command=m.missionPlannerCommand??'';if($('missionPlannerCommand').value!==command)$('missionPlannerCopyStatus').textContent='';
 const c=m.config.vehicle,changed=activeVehicleId!==(c.id??'mn168');vehicleRevision=m.vehicleRevision??0;state=null;
 $('vehicleSelect').replaceChildren(...(m.vehicles??[{id:c.id??'mn168',name:c.name??'MN168'}]).map(v=>{const o=document.createElement('option');o.value=v.id;o.textContent=v.name;return o;}));$('vehicleSelect').value=m.vehicleStatus?.pendingId??m.selectedVehicle??c.id??'mn168';
 $('activeVehicle').textContent=c.name??'MN168';$('activeVehicle').dataset.vehicle=c.id??'mn168';
 if(changed){keys.clear();}activeVehicleId=c.id??'mn168';
 if(c.fpvFov&&camera.fov!==c.fpvFov){camera.fov=c.fpvFov;camera.updateProjectionMatrix();}
 osmSettings?.init(m.osmSettings);$('missionPlannerSetup').hidden=!m.missionPlannerCommand;$('missionPlannerCommand').value=m.missionPlannerCommand??'';locationMode=m.locationMode;baseLocations=m.locations??[];renderLocations(m.favorites??[]);$('locationSelect').value=m.selectedLocation??state?.selectedLocation??locations[0]?.id??'';mapChoice=m.selectedLocation==='map'?m.mapSelection:null;locationMap?.setWorld(m.map);if(mapChoice)locationMap?.select(mapChoice,false);describeLocation();savedLocations?.init(m);config=m.config;mode=m.mode;$('mode').textContent=mode==='sitl'?'ARDUROVER SITL':'STANDALONE · NO AUTOPILOT';$('help').textContent=mode==='sitl'?'Drive using Mission Planner or your MAVLink companion. Browser keys do not control physics.':'W/S or ↑/↓: forward / brake / reverse. A/D or ←/→: steer. Release to stop. Click the view to focus.';$('keyLegend').hidden=mode!=='standalone';for(const id of ['armState','flightMode'])$(id).hidden=mode!=='sitl';
  if(crawler){rover.remove(crawler.model);crawler.dispose();}
  crawler=createVehicle(c);rover.add(crawler.model);wheels=crawler.wheels;rover.userData.vehicleRevision=vehicleRevision;
  // Init is resent on reconnect; replace world instead of duplicating objects.
  if(scene.userData.world){const old=scene.userData.world;scene.remove(old);old.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(o.name==='real-terrain')m.map?.dispose();m.dispose();}}});}const world=new T.Group();scene.userData.world=world;scene.add(world);
  if(m.terrain){addTerrain(world,m.terrain,renderer,graphicsProfile);scene.fog.near=70;scene.fog.far=650;scene.userData.terrain=true;fitFar();}else{scene.fog.near=35;scene.fog.far=95;scene.userData.terrain=false;fitFar();}
  $('landscape').textContent=m.terrain?`${m.terrain.name} · ${(m.terrain.size-1)*m.terrain.spacing} m`:'100 × 100 m playground';
  addOsmOverlay(world,m.overlay,m.terrain,graphicsProfile);$('osmAttribution').hidden=!m.overlay||!(m.overlay.buildings.length||m.overlay.roads.length);
  const approximation=terrainApproximationWarning(m.terrain);$('terrainWarning').textContent=approximation;$('terrainWarning').hidden=!approximation;
  $('terrainAttribution').textContent=m.terrain?.attribution??'';cameraVideo.attribution=[m.terrain?.attribution,m.overlay&&(m.overlay.buildings.length||m.overlay.roads.length)?'© OpenStreetMap contributors · https://www.openstreetmap.org/copyright':null,'Weather: open-meteo.com (CC BY 4.0)'].filter(Boolean).join(' · ');
  const groundObj=m.world.find(o=>o.kind==='ground');if(groundObj)box(groundObj.size,groundObj.color,world).position.fromArray(groundObj.position);
  addWorldObjects(world,m.world.filter(o=>o.kind!=='ground'),graphicsProfile);
  if(!m.terrain){scenery.decorate(world);
  const grid=new T.GridHelper(100,100,0x7c8a69,0x718361);grid.position.y=.002;world.add(grid);}
}
function send(m){if(ws?.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(m));return true;}
weatherView.setPreferenceSender(send);
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);ws.onmessage=e=>{const m=JSON.parse(e.data);osmSettings?.message(m);if(m.type==='init'){weatherView.receivePreferences(m.environmentPreferences??null);setup(m);}if(m.type==='environmentPreferences')weatherView.receivePreferences(m.preferences);if(m.type==='favorites')savedLocations?.message(m);if(m.type==='error'){notice(m.message);savedLocations?.message(m);}if(m.type==='state'&&(m.vehicleRevision??0)===vehicleRevision){state=m;lastReceive=performance.now();savedLocations?.state(m);osmSettings?.state(m);}};ws.onclose=()=>{osmSettings?.connection(false);savedLocations?.connection(false);keys.clear();$('connection').textContent='Backend offline · reconnecting';$('connection').dataset.state='offline';setTimeout(connect,1000);};}
connect();
$('run').onclick=()=>send({type:'running',value:!state?.running});$('reset').onclick=()=>send({type:'reset'});

// Handle time input changes
const timeInput = $('timeInput');
if (timeInput) {
  timeInput.addEventListener('change', function() {
    // Validate HH:MM format
    const regex = /^([0-9]{2}):([0-9]{2})$/;
    const match = this.value.match(regex);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        // Convert to minutes since midnight and send to backend
        const totalMinutes = hours * 60 + minutes;
        send({type:'setTime',value:totalMinutes});
      } else {
        // Invalid time, reset to previous value or default
        this.value = '12:00';
      }
    } else {
      // Invalid format, reset to previous value or default
      this.value = '12:00';
    }
  });
}
function describeLocation(){const p=locations.find(p=>p.id===$('locationSelect').value);$('locationHint').textContent=p?(p.favorite?'Available offline · saved terrain, satellite colours and OpenStreetMap data':['custom','map'].includes(p.id)?(p.id==='map'&&mapChoice?`Selected start · ${mapChoice.lat.toFixed(7)}, ${mapChoice.lon.toFixed(7)}`:p.description):`${p.description} · 960 m map · ${p.reliefM} m elevation range · bundled offline`):state?.selectedLocation?.startsWith('saved:')?'Loaded favorite was removed. The loaded world remains available to save.':'';}
$('locationSelect').onchange=()=>{describeLocation();savedLocations?.selection();const p=locations.find(p=>p.id===$('locationSelect').value);if(Number.isFinite(p?.lat))locationMap?.select(p);else locationMap?.select(p?.id==='map'?mapChoice:null);};
$('loadLocation').onclick=()=>{const id=$('locationSelect').value;if(id==='map'&&!mapChoice){notice('Click the map to choose a starting position.');return;}send({type:'selectLocation',id,...(id==='map'?mapChoice:{})});};
$('loadVehicle').onclick=()=>{release();send({type:'selectVehicle',id:$('vehicleSelect').value});};
$('retryOsm').onclick=()=>send({type:'retryOsm'});
$('retryTerrain').onclick=()=>send({type:'retryTerrain'});
function bindCopy(buttonId,fieldId,statusId,label='Command'){
  const btn=$(buttonId),field=$(fieldId),status=$(statusId);if(!btn||!field)return;
  btn.onclick=async()=>{
    try{await navigator.clipboard.writeText(field.value);if(status)status.textContent='Copied';}
    catch{field.focus();if(field.select)field.select();if(status)status.textContent=`${label} selected · press Ctrl+C or ⌘C to copy`;}
  };
}
bindCopy('copyMissionPlannerCommand','missionPlannerCommand','missionPlannerCopyStatus','Command');
bindCopy('copyVideoUrl','videoUrl','videoUrlCopyStatus','URL');
bindCopy('copyVideoPipeline','videoPipeline','videoPipelineCopyStatus','Pipeline');
// Sky dome (r=110) and clouds must stay inside the far plane or they get clipped.
function fitFar(){const far=Math.max(150,scene.fog.far*1.05);for(const c of [camera,chase])if(c.far!==far){c.far=far;c.updateProjectionMatrix();}scenery.sky.scale.setScalar(Math.min(scene.userData.terrain?10:1,far*.9/110));}
function selectCamera(value){$('camera').value=value;for(const id of ['fpv','chase'])$(id).setAttribute('aria-pressed',String(id===value));$('cameraLabel').textContent=value==='fpv'?'ONBOARD FPV':'CHASE CAMERA';}
$('fpv').onclick=()=>selectCamera('fpv');$('chase').onclick=()=>selectCamera('chase');$('camera').onchange=()=>selectCamera($('camera').value);
$('settings').onclick=()=>{release();cameraVideo.checkStatus?.();settingsDialog.showModal();};$('closeSettings').onclick=()=>settingsDialog.close();
viewport.addEventListener('pointerdown',()=>viewport.focus());
const keys=new Set(),valid=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
addEventListener('keydown',e=>{if(mode!=='standalone'||settingsDialog.open||document.activeElement!==viewport)return;const k=e.key.toLowerCase();if(valid.includes(k)){e.preventDefault();keys.add(k);}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function release(){keys.clear();send({type:'keys',steering:0,throttle:0});}addEventListener('blur',release);viewport.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
setInterval(()=>{if(mode==='standalone')send({type:'keys',throttle:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),steering:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))});},80);
const mount=new T.Vector3(),target=new T.Vector3(),chasePosition=new T.Vector3();let previousTime=0,previousWall=0,ratio=0;
function render(){requestAnimationFrame(render);const width=viewport.clientWidth,height=viewport.clientHeight;if(canvas.width!==Math.floor(width*renderer.getPixelRatio())||canvas.height!==Math.floor(height*renderer.getPixelRatio())){renderer.setSize(width,height,false);for(const c of [camera,chase]){c.aspect=width/height;c.updateProjectionMatrix();}}
  if(state&&config){const s=state,v=config.vehicle;rover.position.copy(s.position);rover.quaternion.copy(s.rotation);crawler.update(s);
    mount.set(v.cameraMount?.x||0,v.cameraMount?.y||0,v.cameraMount?.z||0).applyQuaternion(rover.quaternion).add(rover.position);camera.position.copy(mount);const pan=(s.camera?.panDeg??0)*Math.PI/180,tilt=(s.camera?.tiltDeg??0)*Math.PI/180;target.set(Math.cos(tilt)*Math.cos(pan),Math.sin(tilt),Math.cos(tilt)*Math.sin(pan)).applyQuaternion(rover.quaternion).add(mount);camera.up.set(0,1,0).applyQuaternion(rover.quaternion);camera.lookAt(target);
    chasePosition.set(-Math.max(1.8,config.vehicle.length*3),Math.max(1.05,config.vehicle.length*1.5),Math.max(.5,config.vehicle.width*1.5)).applyQuaternion(rover.quaternion).add(rover.position);chase.position.lerp(chasePosition,.12);chase.lookAt(rover.position.clone().add(new T.Vector3(0,.1,0)));
    $('speed').textContent=s.speed.toFixed(2);$('heading').textContent=`${Math.round(s.heading).toString().padStart(3,'0')}°`;$('time').textContent=s.simTime.toFixed(1);$('rate').textContent=s.rate;
    for(const [id,value,index]of [['steer',s.inputs.steering,config.steering.channel-1],['throttle',s.inputs.throttle,config.throttle.channel-1]]){$(id).textContent=`${value.toFixed(2)}${s.raw[index]?` · ${s.raw[index]} µs`:''}`;$(id+'Meter').value=value;}
    const online=performance.now()-lastReceive<2000;const connectionText=!online?'Backend offline':mode==='standalone'?'Standalone physics active':s.connected?'JSON connected':s.resetPending?'Restart SITL to continue':'Waiting for SITL · physics held';if($('connection').textContent!==connectionText)$('connection').textContent=connectionText;$('connection').dataset.state=!online?'offline':s.connected||mode==='standalone'?'online':'waiting';
    const autopilot=online&&s.autopilot?.connected?s.autopilot:null;
    const armText=autopilot?autopilot.armed?'ARMED':'DISARMED':'ARM UNKNOWN',flightText=autopilot?.flightMode??'MODE UNKNOWN';
    for(const [id,text] of [['armState',armText],['flightMode',flightText]])if($(id).textContent!==text)$(id).textContent=text;
    $('armState').dataset.state=autopilot?autopilot.armed?'armed':'disarmed':'unknown';$('flightMode').dataset.state=autopilot?.flightMode?'known':'unknown';
    if(s.wallTime!==previousWall){ratio=(s.simTime-previousTime)/(s.wallTime-previousWall);previousTime=s.simTime;previousWall=s.wallTime;}
    const terrainMessage=s.startTerrain?.message??'';if($('startTerrainStatus').textContent!==terrainMessage)$('startTerrainStatus').textContent=terrainMessage;$('run').disabled=!!s.vehicleStatus&&s.vehicleStatus.status!=='ready'||!!s.startTerrain&&s.startTerrain.status!=='ready'||s.osm?.status==='loading'&&s.osm.hold;
    $('osmStatus').textContent=s.osm?.message??'';$('retryOsm').hidden=s.osm?.status!=='error';$('retryOsm').disabled=!online||s.startTerrain?.status==='loading';if($('osmLoad'))$('osmLoad').hidden=!s.osm?.message&&s.osm?.status!=='error';
    const externalPicker=locationMode==='mission-planner',unsafeSelection=externalPicker&&(s.connected||s.autopilot?.connected)&&s.autopilot?.armed!==false;
    const vehicleStatus=s.vehicleStatus??{status:'ready',message:''};$('vehicleStatus').textContent=vehicleStatus.message??'';$('vehicleStatus').dataset.state=vehicleStatus.status;const vehicleUnsafe=mode==='sitl'&&(s.connected||s.autopilot?.connected)&&s.autopilot?.armed!==false;$('vehicleSelect').disabled=!online||vehicleUnsafe||vehicleStatus.status==='loading';$('loadVehicle').disabled=$('vehicleSelect').disabled||!$('vehicleSelect').value;
    $('locationSelect').disabled=!baseLocations.length||!online||s.startTerrain?.status==='loading'||(!externalPicker&&s.startTerrain?.status==='ready')||unsafeSelection;$('loadLocation').disabled=$('locationSelect').disabled||!$('locationSelect').value;
    locationMap?.setPicking(baseLocations.length>0&&!$('locationSelect').disabled,unsafeSelection?'Disarm SITL before choosing a new start.':!baseLocations.length?'Use --choose-location or --mission-planner to pick a start.':$('locationSelect').disabled?'Location selection is held while loading or while SITL is active.':'Click a start, then Load location.');locationMap?.update(s);
    $('terrainLoad').hidden=!s.startTerrain;$('retryTerrain').hidden=['ready','restart','verifying'].includes(s.startTerrain?.status)||(baseLocations.length>0&&s.startTerrain?.status==='selecting');$('retryTerrain').disabled=!online||!s.canRetryTerrain;$('retryTerrain').textContent=s.startTerrain?.status==='loading'?'Loading terrain…':'Retry terrain';
    $('run').textContent=s.running?'Stop physics':'Start physics';$('diagnostics').textContent=`RTF ${ratio.toFixed(2)} · packet age ${s.ageMs??'—'} ms · duplicates ${s.stats.duplicates} · skipped ${s.stats.skipped} · malformed ${s.stats.malformed}`;$('status').textContent=s.running?`${$('camera').value==='fpv'?'ONBOARD FPV':'CHASE'} · ${mode==='sitl'?'SITL actuator authority':'keyboard test mode'}`:'PHYSICS STOPPED · sensor time continues in SITL';
  }const activeCamera=$('camera').value==='fpv'?camera:chase;weatherView.update(state?.weather,state?.home,activeCamera,lastReceive);fitFar();scenery.sky.position.copy(activeCamera.position);renderer.render(scene,activeCamera);cameraVideo.capture(canvas,performance.now());
}render();
