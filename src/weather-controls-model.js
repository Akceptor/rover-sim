import {solarPosition} from './weather-model.js';
export const WEATHER_PRESETS=Object.freeze({
 Clear:{code:0,cloudCover:0,visibility:650,rainMm:0,snowCm:0},
 Cloudy:{code:3,cloudCover:100,visibility:650,rainMm:0,snowCm:0},
 Fog:{code:45,cloudCover:100,visibility:85,rainMm:0,snowCm:0},
 Rain:{code:63,cloudCover:100,visibility:280,rainMm:2,snowCm:0},
 Snow:{code:73,cloudCover:100,visibility:280,rainMm:0,snowCm:1.5},
});
export function resolvePreferences(input){
 const p=input&&typeof input==='object'?input:{};
 return {timeMode:p.timeMode==='manual'?'manual':'auto',weatherMode:p.weatherMode==='manual'?'manual':'auto',minute:Number.isInteger(p.minute)&&p.minute>=0&&p.minute<1440?p.minute:720,preset:Object.hasOwn(WEATHER_PRESETS,p.preset)?p.preset:'Clear'};
}
const formatters=new Map();
function parts(now,timeZone){
 if(!formatters.has(timeZone))formatters.set(timeZone,new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
 return Object.fromEntries(formatters.get(timeZone).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
export function localDateKey(now,timeZone){const p=parts(now,timeZone);return `${p.year}-${p.month}-${p.day}`;}
export function minuteLabel(minute){return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
export function timeAtMinute(now,timeZone,minute){
 const p=parts(now,timeZone),target=Date.UTC(p.year,p.month-1,p.day,0,minute);let result=target;
 // Resolve the offset on this date, including daylight saving time. A nonexistent
 // spring-forward minute uses the pre-transition offset (the next valid instant).
 let previous=null;
 for(let i=0;i<4;i++){
  const q=parts(result,timeZone),wall=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second),next=result+target-wall;
  if(next===result)break;if(next===previous){result=Math.max(result,next);break;}previous=result;result=next;
 }
 return result;
}
export function sunsetMinute(home,now,timeZone){
 const start=timeAtMinute(now,timeZone,0),end=timeAtMinute(now,timeZone,1440);let before=start,alt=solarPosition(home,before).elevationDeg+.833;
 for(let next=start+10*60000;next<=end;next+=10*60000){
  const value=solarPosition(home,next).elevationDeg+.833;
  if(alt>=0&&value<0){let lo=before,hi=next;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(solarPosition(home,mid).elevationDeg>-.833)lo=mid;else hi=mid;}
   const q=parts((lo+hi)/2,timeZone);return Math.min(1439,Math.round(q.hour*60+q.minute+q.second/60));}
  before=next;alt=value;
 }
 return null;
}
export function effectiveEnvironment(preferences,weather,home,now){
 const p=resolvePreferences(preferences),timeZone=weather.timeZone??'UTC';
 return {...weather,now:p.timeMode==='manual'?timeAtMinute(now,timeZone,p.minute):now,conditions:p.weatherMode==='manual'?{...WEATHER_PRESETS[p.preset]}:weather.conditions,status:p.weatherMode==='manual'?'manual':weather.status};
}
export const PREFERENCES_KEY='rover-sim.environment.v1';
export function loadPreferences(storage){try{return resolvePreferences(JSON.parse(storage.getItem(PREFERENCES_KEY)));}catch{return resolvePreferences(null);}}
export function savePreferences(storage,preferences){try{storage.setItem(PREFERENCES_KEY,JSON.stringify(resolvePreferences(preferences)));return true;}catch{return false;}}
// A failed send keeps the newest local edit authoritative until reconnection.
// Receiving a server update never republishes an already synchronized value.
export function createPreferenceSync({getPreferences,applyPreferences,send,isCameraOutput=false}){
 let dirty=false;
 function publish(){dirty=send({type:'environmentPreferences',preferences:getPreferences()})!==true;}
 return {publish,receive(value){
  if(dirty){publish();return;}
  if(value===null){if(!isCameraOutput)send({type:'environmentPreferences',preferences:getPreferences(),seed:true});}
  else applyPreferences(value);
 }};
}
