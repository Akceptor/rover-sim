import * as T from '/three.js';
import {solarPosition,appearance,localClock,weatherLabel,weatherAt} from '/weather-model.js';
import {createWeatherControls} from '/weather-controls.js';
import {effectiveEnvironment} from '/weather-controls-model.js';
export function createWeatherView(scene,renderer,sun,ambient,scenery){
 const controls=createWeatherControls();
 const positions=new Float32Array(600*3),geometry=new T.BufferGeometry();
 for(let i=0;i<positions.length;i+=3){positions[i]=(Math.random()-.5)*30;positions[i+1]=Math.random()*18;positions[i+2]=(Math.random()-.5)*30;}
 geometry.setAttribute('position',new T.BufferAttribute(positions,3));
 const material=new T.PointsMaterial({color:0xb7d4ed,size:.045,transparent:true,opacity:.7,depthWrite:false});
 const particles=new T.Points(geometry,material);particles.name='weather-precipitation';particles.frustumCulled=false;particles.visible=false;scene.add(particles);
 const night=new T.Color(0x071020),day=new T.Color(0xa4c8db),overcast=new T.Color(0x89959e),sky=new T.Color();
 let lastWeather=null,lastSecond=-1,lastRevision=-1,lastFrame=performance.now(),visual=null;
 return {setPreferenceSender:controls.setPreferenceSender,receivePreferences:controls.receivePreferences,update(weather,home,camera,receivedAt){
  if(!weather||!home)return;
  const frame=performance.now(),now=weather.now+Math.max(0,frame-receivedAt),second=Math.floor(now/1000),dt=Math.min(.1,(frame-lastFrame)/1000);lastFrame=frame;
  weather=weatherAt(weather,now,frame-receivedAt>2000);
  if(second!==lastSecond||lastRevision!==controls.revision||lastWeather!==`${weather.observedAt}:${weather.fetchedAt}:${weather.status}:${weather.timeZone}:${home.lat}:${home.lon}`){
   lastSecond=second;lastRevision=controls.revision;lastWeather=`${weather.observedAt}:${weather.fetchedAt}:${weather.status}:${weather.timeZone}:${home.lat}:${home.lon}`;
   controls.update(home,now,weather.timeZone??'UTC');
   weather=effectiveEnvironment(controls.preferences,weather,home,now);
   const solar=solarPosition(home,weather.now);visual=appearance(solar,weather.conditions);
   sky.copy(night).lerp(day,visual.daylight).lerp(overcast,visual.cloud*.7*visual.daylight);
   renderer.setClearColor(sky);scene.fog.color.copy(sky);
   const terrain=scene.userData.terrain;scene.fog.near=terrain?Math.min(70,visual.visibility*.15):Math.min(35,visual.visibility*.15);scene.fog.far=terrain?visual.visibility:Math.min(95,visual.visibility);
   ambient.intensity=visual.ambientIntensity;sun.intensity=visual.sunIntensity;
   renderer.toneMappingExposure=.92+visual.daylight*.12;
   sun.position.fromArray(solar.direction).multiplyScalar(40).add(scene.userData.roverPosition??new T.Vector3());
   sun.target.position.copy(scene.userData.roverPosition??new T.Vector3());sun.target.updateMatrixWorld();
   sun.color.set(solar.elevationDeg<15?0xffbc80:0xfff2d1);
   const horizon=scenery.setWeather(sky,visual);if(horizon){scene.fog.color.copy(horizon);renderer.setClearColor(horizon);}
   scene.userData.weather={...visual,elevationDeg:solar.elevationDeg};
   const clock=document.getElementById('localTime');clock.textContent=`${localClock(weather.now,weather.timeZone)} · ${weather.timeZone} · ${controls.preferences.timeMode==='manual'?'Manual':'Auto'}${weather.timeZoneKnown===false?' (timezone unavailable; UTC fallback)':''}`;
   const conditions=weather.conditions,label=conditions?`${weather.status==='manual'?controls.preferences.preset:weatherLabel(conditions.code)}${Number.isFinite(conditions.temperatureC)?` · ${conditions.temperatureC.toFixed(1)} °C`:''} · clouds ${Math.round(conditions.cloudCover)}%`:'Weather unavailable · clock-based lighting';
   const age=weather.status==='manual'||weather.ageMs===null?'':` · ${Math.floor(weather.ageMs/60000)} min old`;
   document.getElementById('weatherStatus').textContent=label+(conditions?` · ${weather.status}${age}`:'');
   document.getElementById('weatherStatus').dataset.state=weather.status;
  }
  particles.visible=!!visual.precipitation;
  if(particles.visible){
   const snow=visual.precipitation==='snow';particles.position.copy(camera.position);material.size=snow ? .075 : .035;material.color.set(snow?0xffffff:0xb7d4ed);material.opacity=.3+visual.precipitationStrength*.5;
   geometry.setDrawRange(0,Math.ceil(600*visual.precipitationStrength));
   for(let i=0;i<positions.length;i+=3){positions[i+1]-=dt*(snow?1:12);if(positions[i+1]<-2)positions[i+1]+=20;}
   geometry.attributes.position.needsUpdate=true;
  }
 }};
}
