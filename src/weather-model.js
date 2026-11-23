const rad=Math.PI/180;
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
// NOAA's fractional-year approximation. World axes are north (+X), up (+Y), east (+Z).
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function solarPosition({lat,lon},now){
 const d=new Date(now),year=d.getUTCFullYear(),start=Date.UTC(year,0,1),days=(Date.UTC(year+1,0,1)-start)/86400000;
 const hour=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
 const day=Math.floor((now-start)/86400000)+1,g=2*Math.PI/days*(day-1+(hour-12)/24);
 const eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
 const decl=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
 const ha=(hour*60+eq+4*lon)/4*rad-Math.PI,latitude=lat*rad;
 const north=Math.cos(latitude)*Math.sin(decl)-Math.sin(latitude)*Math.cos(decl)*Math.cos(ha);
 const up=Math.sin(latitude)*Math.sin(decl)+Math.cos(latitude)*Math.cos(decl)*Math.cos(ha),east=-Math.cos(decl)*Math.sin(ha);
 return {direction:[north,up,east],elevationDeg:Math.asin(clamp(up,-1,1))/rad};
}
export function localClock(now,timeZone='UTC'){
 return new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
}
export function weatherAt(weather,now,offline=false){
 const ageMs=Number.isFinite(weather.observedAt)?Math.max(0,now-weather.observedAt):null;
 const usable=weather.conditions&&ageMs!==null&&ageMs<=3*3600000;
 return {...weather,ageMs,conditions:usable?weather.conditions:null,status:usable?(offline||weather.status==='stale'||ageMs>45*60000?'stale':'current'):'unavailable'};
}
export function weatherLabel(code){
 if(code===0)return 'Clear';if(code<=3)return ['Clear','Mostly clear','Partly cloudy','Overcast'][code];
 if([45,48].includes(code))return 'Fog';if(code>=95)return 'Thunderstorm';
 if([71,73,75,77,85,86].includes(code))return 'Snow';if([56,57,66,67].includes(code))return 'Freezing rain';
 if([51,53,55].includes(code))return 'Drizzle';return 'Rain';
}
export function appearance(solar,conditions){
 const daylight=clamp((solar.elevationDeg+6)/16),cloud=(conditions?.cloudCover??20)/100;
 const code=conditions?.code,precipitation=conditions&&([71,73,75,77,85,86].includes(code)||conditions.snowCm>0)?'snow':conditions&&(conditions.rainMm>0||[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code))?'rain':null;
 const fog=[45,48].includes(code);
 return {elevationDeg:solar.elevationDeg,daylight,cloud,sunIntensity:solar.elevationDeg>0?3*clamp(solar.elevationDeg/12)*(1-cloud*.9):0,ambientIntensity:.12+daylight*(2-cloud*.7),visibility:conditions?.visibility??(fog?85:precipitation?280:650),precipitation,precipitationStrength:precipitation?clamp((conditions.rainMm+conditions.snowCm)/3,.15,1):0};
}
