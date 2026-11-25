import * as T from 'three';
import {OrbitControls} from '/OrbitControls.js';
import {createVehicle} from '/assets/vehicle.js';

export function createProfilePreview(host,toggle,reset){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
 renderer.domElement.setAttribute('aria-label','3D vehicle preview. Drag to orbit and scroll to zoom.');
 renderer.domElement.setAttribute('role','img');host.replaceChildren(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.001,1000);
 scene.add(new T.HemisphereLight(0xe6f2ff,0x655443,2.6));
 const key=new T.DirectionalLight(0xffffff,3);key.position.set(2,4,3);scene.add(key);
 const fill=new T.DirectionalLight(0xbdd5ff,1.2);fill.position.set(-3,1,-2);scene.add(fill);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.autoRotateSpeed=.55;controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.85;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');controls.enableDamping=!motion.matches;
 let vehicle=null,radius=1,interacting=false,resumeAt=0,rotating=!motion.matches,lastTime=0,disposed=false;
 const api={renderer,scene,camera,controls,vehicleId:null,setVehicle,dispose};
 const syncToggle=()=>{toggle.textContent=rotating?'Pause rotation':'Resume rotation';toggle.setAttribute('aria-pressed',String(rotating));};
 const onToggle=()=>{rotating=!rotating;resumeAt=0;syncToggle();};
 const onMotion=()=>{rotating=!motion.matches;controls.autoRotate=false;controls.enableDamping=false;controls.update(0);controls.enableDamping=!motion.matches;syncToggle();};
 const onStart=()=>{interacting=true;};
 const onEnd=()=>{interacting=false;resumeAt=performance.now()+4000;};
 controls.addEventListener('start',onStart);controls.addEventListener('end',onEnd);
 toggle.addEventListener('click',onToggle);reset.addEventListener('click',fit);motion.addEventListener('change',onMotion);syncToggle();
 function fit(){
  const distance=radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))*Math.max(1,1/camera.aspect)*1.1;
  camera.position.copy(controls.target).add(new T.Vector3(1,.65,1).normalize().multiplyScalar(distance));
  controls.minDistance=radius*1.15;controls.maxDistance=distance*4;camera.near=Math.max(.001,radius/100);camera.far=distance*30;camera.updateProjectionMatrix();controls.update();
 }
 function resize(){const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();if(vehicle)fit();}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 function setVehicle(profile){
  // Build before disposing so a malformed draft leaves the last valid preview visible.
  const next=createVehicle(profile),bounds=new T.Box3().setFromObject(next.model);
  if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)){next.dispose();throw Error('Invalid model bounds');}
  if(vehicle){scene.remove(vehicle.model);vehicle.dispose();}
  vehicle=next;scene.add(vehicle.model);api.vehicleId=profile.id;
  const sphere=bounds.getBoundingSphere(new T.Sphere());radius=sphere.radius;controls.target.copy(sphere.center);fit();
 }
 renderer.setAnimationLoop(time=>{
  if(disposed)return;
  const dt=lastTime?Math.min((time-lastTime)/1000,.1):0;lastTime=time;
  controls.autoRotate=rotating&&!interacting&&time>=resumeAt;
  controls.update(dt);if(!document.hidden)renderer.render(scene,camera);
 });
 function dispose(){disposed=true;renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();vehicle?.dispose();renderer.dispose();toggle.removeEventListener('click',onToggle);reset.removeEventListener('click',fit);motion.removeEventListener('change',onMotion);}
 return api;
}
