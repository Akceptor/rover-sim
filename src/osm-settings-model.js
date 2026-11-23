import {insideRing} from './osm-footprints.js';
import {OSM_REGION_POLYGONS} from './osm-regions.js';

export const GLOBAL_OSM_ENDPOINT='https://overpass-api.de/api/interpreter';
export const OSM_SERVERS=[
 {id:'global',label:'Global · Overpass API',endpoint:GLOBAL_OSM_ENDPOINT},
 {id:'europe',label:'Europe · Dresel',endpoint:'https://ovp.dresel.systems/api/interpreter'},
 {id:'north-america',label:'North America · Dresel',endpoint:'https://ovp.dresel.systems/api-na/interpreter'},
 {id:'central-america',label:'Central America · Dresel',endpoint:'https://ovp.dresel.systems/api-ca/interpreter'},
 {id:'south-america',label:'South America · Dresel',endpoint:'https://ovp.dresel.systems/api-sa/interpreter'},
 {id:'asia',label:'Asia · Dresel',endpoint:'https://ovp.dresel.systems/api-as/interpreter'},
 {id:'africa',label:'Africa · Dresel',endpoint:'https://ovp.dresel.systems/api-af/interpreter'},
 {id:'oceania',label:'Oceania · Dresel',endpoint:'https://ovp.dresel.systems/api-oc/interpreter'}
];

export function validateOsmSettings(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['server','endpoint','timeoutMs'].includes(k)))throw Error('Invalid OSM settings');
 const {server,timeoutMs}=value;
 if(!['auto','custom',...OSM_SERVERS.map(s=>s.id)].includes(server))throw Error('Choose a valid OSM server');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('OSM timeout must be between 0.001 and 120 seconds');
 let endpoint='';
 if(server==='custom'){
  if(typeof value.endpoint!=='string'||!value.endpoint.trim()||value.endpoint.length>2048)throw Error('Enter an HTTP or HTTPS OSM endpoint');
  let url;try{url=new URL(value.endpoint.trim());}catch{throw Error('Enter an HTTP or HTTPS OSM endpoint');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw Error('Use an HTTP or HTTPS endpoint without credentials or a fragment');
  endpoint=url.href;
 }
 return {server,endpoint,timeoutMs};
}

export function settingsFromConfig(osm){
 return {server:osm?.endpoint?'custom':'auto',endpoint:osm?.endpoint??'',timeoutMs:osm?.timeoutMs??30000};
}

export function resolveOsmEndpoint(settings,bounds){
 if(settings.server==='custom')return {server:'custom',label:'Custom server',endpoint:settings.endpoint};
 let server=OSM_SERVERS.find(s=>s.id===settings.server);
 if(!server&&settings.server==='auto'&&Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)){
  const [south,west,north,east]=bounds;
  if(south<=north&&west<=east&&south>=-90&&north<=90&&west>=-180&&east<=180){
   const matches=OSM_SERVERS.filter(s=>OSM_REGION_POLYGONS[s.id]?.some(polygon=>containsPatch(polygon,bounds)));
   if(matches.length===1)server=matches[0];
  }
 }
 const {id,label,endpoint}=server??OSM_SERVERS[0];return {server:id,label,endpoint};
}

// Any intersection with a coverage boundary (including an enclosed hole) sends
// the whole patch to the global server. Checking corners alone misses notches.
function segmentTouchesPatch(a,b,[south,west,north,east]){
 let enter=0,exit=1;
 for(const [axis,min,max]of [[0,west,east],[1,south,north]]){
  const delta=b[axis]-a[axis];
  if(delta===0){if(a[axis]<min||a[axis]>max)return false;continue;}
  const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;
  enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
  if(enter>exit)return false;
 }
 return true;
}
function containsPatch(polygon,bounds){
 const [south,west,north,east]=bounds,corners=[[west,south],[east,south],[east,north],[west,north]];
 if(!corners.every(p=>insideRing(polygon[0],...p)))return false;
 for(const ring of polygon)for(let i=0;i<ring.length-1;i++)if(segmentTouchesPatch(ring[i],ring[i+1],bounds))return false;
 return !polygon.slice(1).some(hole=>corners.some(p=>insideRing(hole,...p)));
}
