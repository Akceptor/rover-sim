import * as T from '/three.js';
const $=id=>document.getElementById(id),canvas=$('view'),viewport=$('viewport'),settingsDialog=$('settingsDialog');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.setClearColor(0xa4c8db);
const scene=new T.Scene();scene.fog=new T.Fog(0xa4c8db,35,95);scene.add(new T.HemisphereLight(0xcfeeff,0x3b4529,2.5));const sun=new T.DirectionalLight(0xfff2d1,3);sun.position.set(10,25,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.02;scene.add(sun);
const rover=new T.Group();scene.add(rover);const camera=new T.PerspectiveCamera(85,1,.015,150),chase=new T.PerspectiveCamera(65,1,.03,150);
// Camera ownership is isolated here: future video integration can render this
// camera into a target/canvas without touching the backend or MAVLink transport.
export const fpvOutput={camera,canvas,renderer,scene};
function box(size,color,parent=scene){const m=new T.Mesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color,roughness:.85}));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
let state=null,config=null,wheels=[],ws,mode='sitl',lastReceive=0,wasRunning=true;
function notice(message){$('notice').textContent=message;$('notice').style.display='block';setTimeout(()=>$('notice').style.display='none',7000);}
function setup(m){config=m.config;mode=m.mode;const c=config.vehicle;$('mode').textContent=mode==='sitl'?'ARDUROVER SITL':'STANDALONE · NO AUTOPILOT';$('help').textContent=mode==='sitl'?'Drive using Mission Planner or your MAVLink companion. Browser keys do not control physics.':'W/S or ↑/↓: forward / brake / reverse. A/D or ←/→: steer. Release to stop. Click the view to focus.';$('keyLegend').hidden=mode!=='standalone';for(const id of ['armState','flightMode'])$(id).hidden=mode!=='sitl';
  while(rover.children.length)rover.remove(rover.children[0]);wheels=[];
  const body=box([c.length,c.height,c.width],0xe8bd24,rover);body.position.y=.03;
  const cabin=box([c.length*.43,c.height*.9,c.width*.85],0xf4d14a,rover);cabin.position.set(-.03,c.height*.9,0);
  const glass=box([.008,c.height*.6,c.width*.72],0x273f45,rover);glass.position.set(c.length*.15,c.height*.95,0);
  for(const z of [-c.width*.34,c.width*.34]){const light=box([.01,.025,.035],0xfff5bd,rover);light.position.set(c.length/2+.01,.025,z);}
  for(let i=0;i<4;i++){const steer=new T.Group(),spin=new T.Group();steer.add(spin);rover.add(steer);const mesh=new T.Mesh(new T.CylinderGeometry(c.wheelRadius,c.wheelRadius,.045,20),new T.MeshStandardMaterial({color:0x202426}));mesh.rotation.x=Math.PI/2;mesh.castShadow=true;spin.add(mesh);const hub=new T.Mesh(new T.CylinderGeometry(c.wheelRadius*.5,c.wheelRadius*.5,.048,12),new T.MeshStandardMaterial({color:0xa3a9aa}));hub.rotation.x=Math.PI/2;spin.add(hub);wheels.push({steer,spin});}
  // Init is resent on reconnect; replace world instead of duplicating objects.
  if(scene.userData.world){scene.remove(scene.userData.world);}const world=new T.Group();scene.userData.world=world;scene.add(world);
  for(const o of m.world){const mesh=o.kind==='cone'?new T.Mesh(new T.ConeGeometry(o.size[0]/2,o.size[1],16),new T.MeshStandardMaterial({color:o.color})):box(o.size,o.color,world);if(o.kind==='cone'){world.add(mesh);mesh.castShadow=true;}mesh.position.fromArray(o.position);mesh.rotation.z=o.angle??0;}
  const grid=new T.GridHelper(100,100,0x7c8a69,0x718361);grid.position.y=.002;world.add(grid);
}
function send(m){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='init')setup(m);if(m.type==='error')notice(m.message);if(m.type==='state'){state=m;lastReceive=performance.now();}};ws.onclose=()=>{keys.clear();$('connection').textContent='Backend offline · reconnecting';$('connection').dataset.state='offline';setTimeout(connect,1000);};}
connect();
$('run').onclick=()=>send({type:'running',value:!state?.running});$('reset').onclick=()=>send({type:'reset'});
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
    mount.set(+$('mountX').value||0,+$('mountY').value||0,(+$('mountRight').value||0)).applyQuaternion(rover.quaternion).add(rover.position);camera.position.copy(mount);target.set(1,0,0).applyQuaternion(rover.quaternion).add(mount);camera.up.set(0,1,0).applyQuaternion(rover.quaternion);camera.lookAt(target);
    chasePosition.set(-1.8,1.05,.5).applyQuaternion(rover.quaternion).add(rover.position);chase.position.lerp(chasePosition,.12);chase.lookAt(rover.position.clone().add(new T.Vector3(0,.1,0)));
    $('speed').textContent=s.speed.toFixed(2);$('heading').textContent=`${Math.round(s.heading).toString().padStart(3,'0')}°`;$('time').textContent=s.simTime.toFixed(1);$('rate').textContent=s.rate;
    for(const [id,value,index]of [['steer',s.inputs.steering,config.steering.channel-1],['throttle',s.inputs.throttle,config.throttle.channel-1]]){$(id).textContent=`${value.toFixed(2)}${s.raw[index]?` · ${s.raw[index]} µs`:''}`;$(id+'Meter').value=value;}
    const online=performance.now()-lastReceive<2000;const connectionText=!online?'Backend offline':mode==='standalone'?'Standalone physics active':s.connected?'JSON connected':s.resetPending?'Restart SITL to continue':'Waiting for SITL · physics held';if($('connection').textContent!==connectionText)$('connection').textContent=connectionText;$('connection').dataset.state=!online?'offline':s.connected||mode==='standalone'?'online':'waiting';
    const autopilot=online&&s.autopilot?.connected?s.autopilot:null;
    const armText=autopilot?autopilot.armed?'ARMED':'DISARMED':'ARM UNKNOWN',flightText=autopilot?.flightMode??'MODE UNKNOWN';
    for(const [id,text] of [['armState',armText],['flightMode',flightText]])if($(id).textContent!==text)$(id).textContent=text;
    $('armState').dataset.state=autopilot?autopilot.armed?'armed':'disarmed':'unknown';$('flightMode').dataset.state=autopilot?.flightMode?'known':'unknown';
    if(s.wallTime!==previousWall){ratio=(s.simTime-previousTime)/(s.wallTime-previousWall);previousTime=s.simTime;previousWall=s.wallTime;}
    $('run').textContent=s.running?'Stop physics':'Start physics';$('diagnostics').textContent=`RTF ${ratio.toFixed(2)} · packet age ${s.ageMs??'—'} ms · duplicates ${s.stats.duplicates} · skipped ${s.stats.skipped} · malformed ${s.stats.malformed}`;$('status').textContent=s.running?`${$('camera').value==='fpv'?'ONBOARD FPV':'CHASE'} · ${mode==='sitl'?'SITL actuator authority':'keyboard test mode'}`:'PHYSICS STOPPED · sensor time continues in SITL';
  }renderer.render(scene,$('camera').value==='fpv'?camera:chase);
}render();
