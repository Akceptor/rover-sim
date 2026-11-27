import {insideRing} from './osm-footprints.js';
import {area,stitch} from './osm-rings.js';

const polygonTypes=new Set(['lake','pond','reservoir','river']);
const widths={river:8,stream:2,canal:5,drain:1,ditch:.6};
const MAX_FEATURES=1024,MAX_VERTICES=8192,MAX_TOTAL=65536;
const order=(a,b)=>a.id-b.id;
const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1e7);
const validRing=r=>Array.isArray(r)&&r.length>=3&&r.length<=MAX_VERTICES&&r.every(point)&&Math.abs(area(r))>.01;
function dimension(value,max,zero=false){
 const match=String(value??'').trim().match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/i);
 if(!match)return null;
 const n=Number(match[1])*(/^(ft|feet|')$/i.test(match[2])?.3048:1);
 return Number.isFinite(n)&&(zero?n>=0:n>0)&&n<=max?n:null;
}
const enabled=v=>v!==undefined&&!['no','false','0'].includes(String(v).toLowerCase());
function excluded(tags){return enabled(tags.tunnel)||enabled(tags.covered)||['yes','true','1'].includes(tags.dry)||['no','dry'].includes(tags.water)||tags.intermittent==='dry'||tags.seasonal==='dry';}
function polygonType(tags){
 if(tags.natural!=='water'&&tags.landuse!=='reservoir'&&tags.waterway!=='riverbank')return null;
 if(tags.landuse==='reservoir')return 'reservoir';
 if(tags.waterway==='riverbank')return 'river';
 return polygonTypes.has(tags.water)?tags.water:'lake';
}
const fields=tags=>({depth:dimension(tags.depth,100,true),seasonal:enabled(tags.seasonal)||enabled(tags.intermittent)});
function intersects(points,half,padding=0){
 let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
 for(const [x,z]of points){minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);}
 return minX<=half+padding&&maxX>=-half-padding&&minZ<=half+padding&&maxZ>=-half-padding;
}

export function processWater(data,t,nodes,ways,ring){
 const water=[],consumed=new Set(),half=(t.size-1)*t.spacing/2;
 let total=0;
 const add=(feature,count)=>{if(water.length<MAX_FEATURES&&count<=MAX_VERTICES&&total+count<=MAX_TOTAL){water.push(feature);total+=count;}};
 const polygon=(id,outer,holes,type,tags)=>{
  if(!validRing(outer)||!Array.isArray(holes)||holes.length>MAX_FEATURES)return;
  let count=outer.length;
  for(const hole of holes){if(!validRing(hole))return;count+=hole.length;if(count>MAX_VERTICES)return;}
  if(intersects(outer,half))add({id,type,outer,holes,...fields(tags)},count);
 };
 for(const rel of data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='multipolygon'&&polygonType(e.tags)&&!excluded(e.tags)).sort(order)){
  // Limit source IDs before stitch's array spreads or ring projection. One relation
  // may contain several polygons, but cannot consume more than the global budget.
  if(!Array.isArray(rel.members)||rel.members.length>MAX_TOTAL)continue;
  // A rejected relation must not fall back to a tagged outer member without
  // its islands. Suppress standalone members even when assembly fails.
  for(const member of rel.members)if(member.type==='way')consumed.add(member.ref);
  const parts={outer:[],inner:[]};let count=0,invalid=false;
  for(const member of rel.members){
   if(member.type!=='way')continue;
   const role=member.role||'outer';if(role!=='outer'&&role!=='inner')continue;
   const ids=ways.get(member.ref)?.nodes;
   if(!Array.isArray(ids)||ids.length<2||ids.length>MAX_VERTICES+1){invalid=true;break;}
   count+=ids.length;if(count>MAX_TOTAL){invalid=true;break;}parts[role].push(ids);
  }
  if(invalid)continue;
  const assemble=source=>{
   const ids=stitch(source);
   // Each closed ring has one edge per retained vertex. Stitch discards open
   // components, so unequal edge totals reveal any silently dropped members.
   if(ids.reduce((n,r)=>n+r.length,0)!==source.reduce((n,r)=>n+r.length-1,0))return null;
   const rings=ids.map(r=>r.length<=MAX_VERTICES?ring(r):null);
   return rings.every(validRing)?rings:null;
  };
  const outers=assemble(parts.outer),inners=assemble(parts.inner);
  if(!outers?.length||!inners||inners.some(hole=>!outers.some(outer=>hole.every(p=>insideRing(outer,...p)))))continue;
  for(const [i,outer]of outers.entries())polygon(`relation/${rel.id}${i?`/${i}`:''}`,outer,inners.filter(hole=>insideRing(outer,...hole[0])),polygonType(rel.tags),rel.tags);
 }
 for(const way of [...ways.values()].sort(order)){
  if(water.length>=MAX_FEATURES||total>=MAX_TOTAL)break;
  const tags=way.tags??{},ids=way.nodes;
  if(consumed.has(way.id)||excluded(tags)||!Array.isArray(ids))continue;
  const type=polygonType(tags);
  if(type){
   if(ids.length>=4&&ids.length<=MAX_VERTICES+1&&ids[0]===ids.at(-1))polygon(`way/${way.id}`,ring(ids.slice(0,-1)),[],type,tags);
   continue;
  }
  if(!Object.hasOwn(widths,tags.waterway)||ids.length>MAX_TOTAL)continue;
  const width=dimension(tags.width,200)??widths[tags.waterway];let points=[],part=0,oversized=false;
  const flush=()=>{if(!oversized&&points.length>=2&&intersects(points,half,width/2))add({id:`way/${way.id}/${part}`,type:tags.waterway,points,width,...fields(tags)},points.length);part++;points=[];oversized=false;};
  for(const id of ids){
   const p=nodes.get(id);if(!point(p)){flush();continue;}
   if(oversized)continue;
   if(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>.001)points.push(p);
   if(points.length>MAX_VERTICES){points=[];oversized=true;}
  }
  flush();
 }
 return water;
}

export function validWaterFields(overlay){
 if(overlay.water===undefined)return true;
 if(!Array.isArray(overlay.water)||overlay.water.length>MAX_FEATURES)return false;
 let total=0;
 for(const feature of overlay.water){
  if(!feature||typeof feature.id!=='string'||typeof feature.seasonal!=='boolean'||!(feature.depth===null||(Number.isFinite(feature.depth)&&feature.depth>=0&&feature.depth<=100)))return false;
  let count;
  if(Object.hasOwn(feature,'outer')){
   if(!polygonTypes.has(feature.type)||Object.hasOwn(feature,'points')||Object.hasOwn(feature,'width')||!validRing(feature.outer)||!Array.isArray(feature.holes)||feature.holes.length>MAX_FEATURES)return false;
   count=feature.outer.length;
   for(const hole of feature.holes){if(!validRing(hole))return false;count+=hole.length;if(count>MAX_VERTICES)return false;}
  }else{
   if(!Object.hasOwn(widths,feature.type)||Object.hasOwn(feature,'holes')||!Array.isArray(feature.points)||feature.points.length<2||feature.points.length>MAX_VERTICES||!feature.points.every(point)||!Number.isFinite(feature.width)||feature.width<=0||feature.width>200)return false;
   count=feature.points.length;
  }
  total+=count;if(count>MAX_VERTICES||total>MAX_TOTAL)return false;
 }
 return true;
}
