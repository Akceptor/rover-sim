import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {processOsm,overlayKey,geographicBounds,OSM_SCHEMA} from './osm.js';
const root=fileURLToPath(new URL('..',import.meta.url));
export function overpassQuery(t){const box=geographicBounds(t).join(',');return `[out:json][timeout:25];(way[building](${box});relation[building][type=multipolygon](${box});way[highway](${box}););(._;>;);out body;`;}
export async function loadOsmOverlay(t,{cacheDir=path.join(root,'.run/osm-cache'),bundledDir=path.join(root,'assets/osm'),endpoint='https://overpass-api.de/api/interpreter',fetcher=fetch,signal,timeoutMs=30000,defaultHeight=6}={}){
 const key=overlayKey(t,OSM_SCHEMA,defaultHeight),hash=createHash('sha256').update(key).digest('hex'),file=path.join(cacheDir,`${hash}.json`);
 const valid=o=>{
  if(o?.version!==OSM_SCHEMA||o.key!==key||!Array.isArray(o.buildings)||!Array.isArray(o.roads))throw Error('Invalid OSM cache');
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1e7);
  const ring=r=>Array.isArray(r)&&r.length>=3&&r.every(point);
  if(!o.buildings.every(b=>typeof b.id==='string'&&ring(b.outer)&&Array.isArray(b.holes)&&b.holes.every(ring)&&Number.isFinite(b.height)&&b.height>0&&b.height<=500)||!o.roads.every(r=>typeof r.id==='string'&&Array.isArray(r.points)&&r.points.length>=2&&r.points.every(point)&&Number.isFinite(r.width)&&r.width>0&&r.width<=500&&typeof r.paved==='boolean'))throw Error('Invalid OSM cache geometry');
  return o;
 };
 const result=(overlay,cached,bundled=false)=>({overlay,cached,bundled,status:overlay.buildings.length||overlay.roads.length?'ready':'empty'});
 // A user-refreshed cache takes precedence over the repository snapshot.
 for(const [candidate,bundled]of [[file,false],...(bundledDir?[[path.join(bundledDir,`${hash}.json`),true]]:[])]){
  try{signal?.throwIfAborted();return result(valid(JSON.parse(await fs.readFile(candidate,'utf8'))),true,bundled);}catch(error){if(signal?.aborted)throw error;}
 }
 let temp;
 try{
  signal?.throwIfAborted();
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:overpassQuery(t)}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw Error(response.status===429?'Overpass rate limited (429); retry later':`Overpass HTTP ${response.status}`);
  const overlay=valid(processOsm(await response.json(),t,{defaultHeight}));signal?.throwIfAborted();
  await fs.mkdir(cacheDir,{recursive:true});temp=`${file}.${randomUUID()}.tmp`;await fs.writeFile(temp,JSON.stringify(overlay)+'\n');await fs.rename(temp,file);return result(overlay,false);
 }catch(error){if(signal?.aborted)throw error;return {overlay:null,cached:false,status:'error',message:error.message};}
 finally{if(temp)await fs.rm(temp,{force:true});}
}
