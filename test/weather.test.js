import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveWeather} from '../src/weather.js';
import {solarPosition,appearance,localClock,weatherAt} from '../src/weather-model.js';
import {loadEnvironment} from '../src/environment.js';
const home={lat:50.3375,lon:30.475};
const epoch=Date.parse('2026-06-21T10:00:00Z');
const payload=()=>({timezone:'Europe/Kyiv',current:{time:epoch/1000,temperature_2m:20,cloud_cover:70,precipitation:1.2,rain:1.2,snowfall:0,weather_code:61}});
test('weather requests selected coordinates, shares one refresh, and keeps stale data on failure',async()=>{
 let now=epoch,calls=0,url;let fail=false;
 const weather=new LiveWeather(home,{now:()=>now,fetch:async u=>{calls++;url=new URL(u);if(fail)throw Error('offline');return {ok:true,json:async()=>payload()};}});
 assert.equal(weather.snapshot().status,'unavailable');
 await Promise.all([weather.refresh(),weather.refresh()]);
 assert.equal(calls,1);assert.equal(url.searchParams.get('latitude'),String(home.lat));assert.equal(url.searchParams.get('longitude'),String(home.lon));assert.equal(url.searchParams.get('timeformat'),'unixtime');
 assert.equal(weather.snapshot().status,'current');assert.equal(weather.snapshot().conditions.temperatureC,20);
 assert.equal(weather.snapshot().timeZone,'Europe/Kyiv');
 fail=true;now+=16*60*1000;await weather.refresh();assert.equal(weather.snapshot().status,'stale');assert.equal(weather.snapshot().conditions.rainMm,1.2);
 now+=3*60*60*1000;assert.equal(weather.snapshot().conditions,null);weather.close();
});
test('malformed, null, future and old weather never becomes current',async()=>{
 for(const change of [p=>p.current.cloud_cover=null,p=>p.current.weather_code=999,p=>p.current.time+=3600,p=>p.current.time-=4*3600,p=>p.timezone='Invalid/Zone']){
  const p=payload();change(p);const weather=new LiveWeather(home,{now:()=>epoch,fetch:async()=>({ok:true,json:async()=>p})});
  await weather.refresh();assert.equal(weather.snapshot().status,'unavailable');assert.equal(weather.snapshot().conditions,null);weather.close();
 }
});
test('weather shutdown aborts an outstanding request',async()=>{
 let signal;const weather=new LiveWeather(home,{fetch:async(u,o)=>{signal=o.signal;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 const pending=weather.refresh();weather.close();await pending;assert.equal(signal.aborted,true);
});
test('solar direction follows north/up/east, season and longitude without network',()=>{
 const summer=solarPosition(home,epoch),winter=solarPosition(home,Date.parse('2026-12-21T10:00:00Z'));
 assert.ok(summer.elevationDeg>60&&summer.elevationDeg<65);assert.ok(winter.elevationDeg>15&&winter.elevationDeg<18);assert.ok(summer.direction[0]<-.4,'noon sun is south');
 const morning=solarPosition({lat:0,lon:0},Date.parse('2026-03-20T06:00:00Z'));assert.ok(morning.direction[2]>.99,'morning sun is east');
 assert.ok(solarPosition({lat:0,lon:180},Date.parse('2026-03-20T12:00:00Z')).elevationDeg<-85);
 for(const lat of [-90,90])assert.ok(solarPosition({lat,lon:0},epoch).direction.every(Number.isFinite));
});
test('local clock handles DST; appearance distinguishes night, cloud, rain, snow and fog',()=>{
 assert.match(localClock(epoch,'Europe/Kyiv'),/13:00:00/);assert.match(localClock(Date.parse('2026-12-21T10:00:00Z'),'Europe/Kyiv'),/12:00:00/);
 const clear=appearance({elevationDeg:45},null),night=appearance({elevationDeg:-20},null);
 assert.ok(clear.sunIntensity>night.sunIntensity);assert.equal(night.sunIntensity,0);
 const rain=appearance({elevationDeg:45},{cloudCover:100,code:61,rainMm:2,snowCm:0});assert.ok(rain.sunIntensity<clear.sunIntensity);assert.equal(rain.precipitation,'rain');
 assert.equal(appearance({elevationDeg:20},{cloudCover:100,code:73,rainMm:0,snowCm:1}).precipitation,'snow');
 assert.ok(appearance({elevationDeg:20},{cloudCover:100,code:45,rainMm:0,snowCm:0}).visibility<clear.visibility);
});
test('a disconnected browser marks cached weather stale and expires it as its clock continues',()=>{
 const cached={observedAt:epoch,status:'current',conditions:{code:61}};
 assert.equal(weatherAt(cached,epoch+1000,true).status,'stale');
 assert.equal(weatherAt(cached,epoch+46*60000).status,'stale');
 const expired=weatherAt(cached,epoch+4*3600000,true);assert.equal(expired.status,'unavailable');assert.equal(expired.conditions,null);
});
test('environment supplies a known timezone offline and accepts a configured timezone',()=>{
 assert.equal(loadEnvironment({}).timeZone,'Europe/Kyiv');
 assert.equal(loadEnvironment({timeZone:'Europe/Kyiv'}).timeZone,'Europe/Kyiv');
 assert.throws(()=>loadEnvironment({timeZone:'Invalid/Zone'}),/timezone/);
 const weather=new LiveWeather(home,{timeZone:'Europe/Kyiv'});assert.equal(weather.snapshot().timeZoneKnown,true);weather.close();
 const unknown=new LiveWeather(home);assert.equal(unknown.snapshot().timeZoneKnown,false);unknown.close();
});
