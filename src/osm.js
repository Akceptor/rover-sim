import proj4 from 'proj4';
import {ShapeUtils,Vector2} from 'three';
import {terrainHeight} from './terrain.js';
import {insideRing} from './osm-footprints.js';
import {normalizeRoadTags,roadMaterial} from './road-materials.js';
import {metres,area,stitch} from './osm-rings.js';
import {processBarriers} from './osm-barriers.js';
import {barrierGeometry} from './barrier-geometry.js';
import {processLandcover} from './osm-landcover.js';
export {overlayOccupies} from './osm-footprints.js';

export const OSM_SCHEMA=1;
export const localProjection=home=>`+proj=aeqd +lat_0=${home.lat} +lon_0=${home.lon} +datum=WGS84 +units=m`;
export function terrainProjection(home){const projection=localProjection(home);return (lat,lon)=>{const [east,north]=proj4('EPSG:4326',projection,[lon,lat]);return [north,east];};}
export function overlayKey(t,version=OSM_SCHEMA,defaultHeight=6){return JSON.stringify({version,defaultHeight,origin:[t.home.lat,t.home.lon],bounds:[-(t.size-1)*t.spacing/2,(t.size-1)*t.spacing/2]});}
export function geographicBounds(t){
 const h=(t.size-1)*t.spacing/2,points=[];
 // Include edge midpoints to cover the projection's curved geographic boundary.
 for(let i=0;i<=16;i++)for(const s of [-1,1]){const v=-h+2*h*i/16;points.push(proj4(localProjection(t.home),'EPSG:4326',[s*h,v]),proj4(localProjection(t.home),'EPSG:4326',[v,s*h]));}
 return [Math.min(...points.map(p=>p[1]))-.000001,Math.min(...points.map(p=>p[0]))-.000001,Math.max(...points.map(p=>p[1]))+.000001,Math.max(...points.map(p=>p[0]))+.000001];
}
export function buildingHeight(tags,defaultHeight=6){return metres(tags.height)??(Number(tags['building:levels'])>0&&Number(tags['building:levels'])<=150?Number(tags['building:levels'])*3:defaultHeight);}
const roadWidths={primary:9,secondary:8,tertiary:7,unclassified:5.5,residential:5.5,living_street:4,service:3.5,track:3,path:1.5,footway:1.5,cycleway:2,pedestrian:4};
const unpaved=new Set(['unpaved','gravel','fine_gravel','compacted','dirt','earth','ground','grass','sand','mud','woodchips']);
export function processOsm(data,t,{defaultHeight=6}={}){
 if(!data||!Array.isArray(data.elements)||data.remark)throw Error(data?.remark||'Invalid Overpass response');
 const project=terrainProjection(t.home),nodes=new Map(),ways=new Map(),consumed=new Set(),h=(t.size-1)*t.spacing/2;
 for(const e of data.elements){if(e.type==='node'&&Number.isFinite(e.lat)&&Number.isFinite(e.lon))nodes.set(e.id,project(e.lat,e.lon));if(e.type==='way')ways.set(e.id,e);}
 const ring=ids=>{const r=ids.map(id=>nodes.get(id));return r.every(Boolean)&&Math.abs(area(r))>.01?r:null;};
 const buildings=[],roads=[];
 const addBuilding=(id,outer,holes,tags)=>{
  if(!outer||Math.min(...outer.map(p=>p[0]))>h||Math.max(...outer.map(p=>p[0]))< -h||Math.min(...outer.map(p=>p[1]))>h||Math.max(...outer.map(p=>p[1]))< -h)return;
  buildings.push({id,outer,holes,height:buildingHeight(tags,defaultHeight)});
 };
 for(const rel of data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='multipolygon'&&e.tags.building&&e.tags.building!=='no')){
  const members=rel.members??[],parts=role=>members.filter(m=>m.type==='way'&&(m.role||'outer')===role).map(m=>ways.get(m.ref)?.nodes).filter(Boolean);
  const outers=stitch(parts('outer')).map(ring).filter(Boolean),inners=stitch(parts('inner')).map(ring).filter(Boolean);
  if(outers.length){for(const m of members)consumed.add(m.ref);for(const [i,outer]of outers.entries())addBuilding(`relation/${rel.id}${i?`/${i}`:''}`,outer,inners.filter(r=>insideRing(outer,...r[0])),rel.tags);}
 }
 for(const w of ways.values()){
  const tags=w.tags??{};
  if(tags.building&&tags.building!=='no'&&!consumed.has(w.id)&&w.nodes?.length>=4&&w.nodes[0]===w.nodes.at(-1))addBuilding(`way/${w.id}`,ring(w.nodes.slice(0,-1)),[],tags);
  if(!Object.hasOwn(roadWidths,tags.highway)||tags.area==='yes'||(tags.bridge&&tags.bridge!=='no')||(tags.tunnel&&tags.tunnel!=='no'))continue;
  // Split on missing nodes rather than drawing across incomplete data.
  const materialTags=normalizeRoadTags(tags);
  let points=[];const flush=()=>{if(points.length>=2){const road={id:`way/${w.id}/${roads.length}`,highway:tags.highway,points,width:metres(tags.width)??roadWidths[tags.highway],paved:materialTags.surface?!unpaved.has(materialTags.surface):!['track','path','footway'].includes(tags.highway),...materialTags};if(materialTags.surface||materialTags.tracktype)road.paved=roadMaterial(road).paved;roads.push(road);}points=[];};
  for(const id of w.nodes??[]){const p=nodes.get(id);if(!p){flush();continue;}if(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>.001)points.push(p);}flush();
 }
 return {version:OSM_SCHEMA,key:overlayKey(t,OSM_SCHEMA,defaultHeight),buildings,roads,...processLandcover(data,t,nodes,ways,ring),barriers:processBarriers(data,t,nodes,ways)};
}
function sample(t,x,z){const h=(t.size-1)*t.spacing/2;return terrainHeight(t,Math.max(-h,Math.min(h,x)),Math.max(-h,Math.min(h,z)));}
function buildingGeometry(b,t){
 const rings=[b.outer,...b.holes],points=rings.flat(),triangles=ShapeUtils.triangulateShape(b.outer.map(p=>new Vector2(...p)),b.holes.map(r=>r.map(p=>new Vector2(...p))));
 let low=Infinity,high=-Infinity;
 const consider=(x,z)=>{const y=sample(t,x,z);low=Math.min(low,y);high=Math.max(high,y);};
 for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],c=r[(i+1)%r.length],steps=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/Math.min(t.spacing/2,2));for(let j=0;j<=steps;j++)consider(a[0]+(c[0]-a[0])*j/steps,a[1]+(c[1]-a[1])*j/steps);}
 // Interior grid extrema determine a level roof and foundations on steep terrain.
 const h=(t.size-1)*t.spacing/2;
 const minX=Math.max(0,Math.floor((Math.min(...b.outer.map(p=>p[0]))+h)/t.spacing)),maxX=Math.min(t.size-1,Math.ceil((Math.max(...b.outer.map(p=>p[0]))+h)/t.spacing));
 const minZ=Math.max(0,Math.floor((Math.min(...b.outer.map(p=>p[1]))+h)/t.spacing)),maxZ=Math.min(t.size-1,Math.ceil((Math.max(...b.outer.map(p=>p[1]))+h)/t.spacing));
 for(let i=minX;i<=maxX;i++)for(let j=minZ;j<=maxZ;j++){const x=i*t.spacing-h,z=j*t.spacing-h;consider(x,z);}
 const bottom=low-.3,top=high+b.height,vertices=[],indices=[],prisms=[];
 for(const [x,z]of points)vertices.push(x,bottom,z);for(const [x,z]of points)vertices.push(x,top,z);
 const n=points.length;
 for(const tri of triangles){const [a,c,d]=tri;indices.push(a+n,d+n,c+n);prisms.push([...tri.flatMap(i=>[points[i][0],bottom,points[i][1]]),...tri.flatMap(i=>[points[i][0],top,points[i][1]])]);}
 let offset=0;for(const r of rings){for(let i=0;i<r.length;i++){const a=offset+i,c=offset+(i+1)%r.length;indices.push(a,c,a+n,c,c+n,a+n);}offset+=r.length;}
 return {id:b.id,vertices,indices,prisms,bottom,top,height:b.height};
}
// Convex polygon clipping against a CCW terrain triangle in local north/east space.
function clip(poly,triangle){let out=poly;for(let i=0;i<3&&out.length;i++){const a=triangle[i],b=triangle[(i+1)%3],side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);const input=out;out=[];let prev=input.at(-1),sp=side(prev);for(const p of input){const s=side(p);if((s>=0)!==(sp>=0)){const f=sp/(sp-s);out.push([prev[0]+f*(p[0]-prev[0]),prev[1]+f*(p[1]-prev[1])]);}if(s>=0)out.push(p);prev=p;sp=s;}}return out;}
function drape(poly,t,vertices){
 const h=(t.size-1)*t.spacing/2,s=t.spacing;
 const imin=Math.max(0,Math.floor((Math.min(...poly.map(p=>p[0]))+h)/s)),imax=Math.min(t.size-2,Math.floor((Math.max(...poly.map(p=>p[0]))+h)/s));
 const jmin=Math.max(0,Math.floor((Math.min(...poly.map(p=>p[1]))+h)/s)),jmax=Math.min(t.size-2,Math.floor((Math.max(...poly.map(p=>p[1]))+h)/s));
 for(let i=imin;i<=imax;i++)for(let j=jmin;j<=jmax;j++){
  const x=i*s-h,z=j*s-h,a=[x,z],b=[x+s,z],c=[x,z+s],d=[x+s,z+s];
  for(const tri of [[a,b,c],[b,d,c]]){const p=clip(poly,tri);for(let k=1;k<p.length-1;k++)for(const v of [p[0],p[k+1],p[k]])vertices.push(v[0],sample(t,...v)+.035,v[1]);}
 }
}
function roadGeometry(r,t){
 const vertices=[],radius=r.width/2;
 for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;const dx=-(b[1]-a[1])*radius/length,dz=(b[0]-a[0])*radius/length;drape([[a[0]+dx,a[1]+dz],[b[0]+dx,b[1]+dz],[b[0]-dx,b[1]-dz],[a[0]-dx,a[1]-dz]],t,vertices);}
 // Round caps and joins overlap strips; depthWrite=false avoids coplanar road/road fighting.
 for(const p of r.points)drape(Array.from({length:16},(_,i)=>[p[0]+radius*Math.cos(i*Math.PI/8),p[1]+radius*Math.sin(i*Math.PI/8)]),t,vertices);
 return {id:r.id,paved:r.paved,material:roadMaterial(r).id,vertices};
}
export function overlayGeometry(o,t){return {buildings:o.buildings.map(b=>buildingGeometry(b,t)),roads:o.roads.map(r=>roadGeometry(r,t)),landcover:o.landcover??[],trees:o.trees??[],barriers:barrierGeometry(o.barriers,t)};}
