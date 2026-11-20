const minute=60000,refreshMs=15*minute,maxAge=3*60*minute;
const codes=new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
function parse(data,now){
 const c=data?.current;
 if(!c||!Number.isFinite(c.time)||c.time*1000>now+5*minute||now-c.time*1000>maxAge||!codes.has(c.weather_code))throw Error('Invalid weather timestamp or code');
 for(const [key,min,max] of [['temperature_2m',-100,70],['cloud_cover',0,100],['precipitation',0,1000],['rain',0,1000],['snowfall',0,1000]])if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)throw Error('Invalid weather value');
 if(typeof data.timezone!=='string')throw Error('Missing timezone');
 new Intl.DateTimeFormat('en',{timeZone:data.timezone}).format(now);
 return {timeZone:data.timezone,observedAt:c.time*1000,conditions:{temperatureC:c.temperature_2m,cloudCover:c.cloud_cover,precipitationMm:c.precipitation,rainMm:c.rain,snowCm:c.snowfall,code:c.weather_code}};
}
export class LiveWeather {
 constructor(home,{fetch=globalThis.fetch,now=Date.now,timeZone=null}={}){this.home=home;this.fetch=fetch;this.now=now;this.timeZone=timeZone??'UTC';this.timeZoneKnown=!!timeZone;this.data=null;this.failed=false;this.pending=null;this.closed=false;}
 start(){if(this.timer||this.closed)return;void this.refresh();this.timer=setInterval(()=>void this.refresh(),refreshMs);this.timer.unref();}
 refresh(){
  if(this.closed)return Promise.resolve();if(this.pending)return this.pending;
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:this.home.lat,longitude:this.home.lon,current:'temperature_2m,cloud_cover,precipitation,rain,snowfall,weather_code',timezone:'auto',timeformat:'unixtime',forecast_days:'1'}).toString();
  this.controller=new AbortController();const signal=AbortSignal.any([this.controller.signal,AbortSignal.timeout(8000)]);
  this.pending=(async()=>{try{
   const response=await this.fetch(url,{signal});if(!response.ok)throw Error('Weather service unavailable');
   const data=parse(await response.json(),this.now());if(this.closed)return;
   this.data={...data,fetchedAt:this.now()};this.timeZone=data.timeZone;this.failed=false;
  }catch{if(!this.closed)this.failed=true;}finally{this.pending=null;}})();
  return this.pending;
 }
 snapshot(){
  const now=this.now(),age=this.data?Math.max(0,now-this.data.observedAt):null,usable=this.data&&age<=maxAge;
  return {now,timeZone:this.timeZone,timeZoneKnown:!!this.data||this.timeZoneKnown,status:usable?(this.failed||age>45*minute?'stale':'current'):'unavailable',conditions:usable?this.data.conditions:null,observedAt:this.data?.observedAt??null,fetchedAt:this.data?.fetchedAt??null,source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',ageMs:age};
 }
 close(){this.closed=true;clearInterval(this.timer);this.controller?.abort();}
}
