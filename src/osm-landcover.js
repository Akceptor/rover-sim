import {insideRing} from './osm-footprints.js';
import {stitch,metres} from './osm-rings.js';
import {landcoverKinds} from './landcover.js';

const landuses={forest:'forest',grass:'grass',meadow:'grass',farmland:'farmland',reservoir:'water',basin:'water'};
const naturals={wood:'forest',scrub:'scrub',grassland:'grass',water:'water'};
const kind=tags=>Object.hasOwn(naturals,tags?.natural)?naturals[tags.natural]:Object.hasOwn(landuses,tags?.landuse)?landuses[tags.landuse]:null;
const order=(a,b)=>a.id-b.id;
export function processLandcover(data,t,nodes,ways,ring){
 const half=(t.size-1)*t.spacing/2,landcover=[],trees=[],consumed=new Set();
 const within=p=>p&&Math.abs(p[0])<=half&&Math.abs(p[1])<=half;
 const intersects=r=>r&&Math.min(...r.map(p=>p[0]))<=half&&Math.max(...r.map(p=>p[0]))>=-half&&Math.min(...r.map(p=>p[1]))<=half&&Math.max(...r.map(p=>p[1]))>=-half;
 const add=(id,outer,holes,k)=>{if(outer&&landcover.length<1024&&outer.length+holes.reduce((n,r)=>n+r.length,0)<=8192&&intersects(outer))landcover.push({id,kind:k,outer,holes});};
 for(const rel of data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='multipolygon'&&kind(e.tags)).sort(order)){
  const parts=role=>(rel.members??[]).filter(m=>m.type==='way'&&(m.role||'outer')===role).map(m=>ways.get(m.ref)?.nodes).filter(Boolean);
  const outers=stitch(parts('outer')).map(ring).filter(Boolean),inners=stitch(parts('inner')).map(ring).filter(Boolean);
  if(outers.length){for(const m of rel.members??[])if(m.type==='way')consumed.add(m.ref);for(const [i,outer]of outers.entries())add(`relation/${rel.id}${i?`/${i}`:''}`,outer,inners.filter(r=>insideRing(outer,...r[0])),kind(rel.tags));}
 }
 for(const way of [...ways.values()].sort(order))if(kind(way.tags)&&!consumed.has(way.id)&&way.nodes?.length>=4&&way.nodes[0]===way.nodes.at(-1))add(`way/${way.id}`,ring(way.nodes.slice(0,-1)),[],kind(way.tags));
 const height=tags=>{const h=metres(tags?.height);return h&&h<=40?h:8;};
 for(const n of data.elements.filter(e=>e.type==='node'&&e.tags?.natural==='tree').sort(order))if(within(nodes.get(n.id))&&trees.length<2048)trees.push({id:`node/${n.id}`,point:nodes.get(n.id),height:height(n.tags),source:'node'});
 for(const way of [...ways.values()].filter(w=>w.tags?.natural==='tree_row').sort(order)){
  let sample=0,along=0,lastSample=-Infinity;
  for(let i=1;i<(way.nodes?.length??0)&&trees.length<2048;i++){
   const a=nodes.get(way.nodes[i-1]),b=nodes.get(way.nodes[i]);if(!a||!b){along=0;lastSample=-Infinity;continue;}
   const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)continue;
   let lo=0,hi=1;
   for(const [v,d]of [[a[0],dx],[a[1],dz]]){
    if(!d){if(Math.abs(v)>half){hi=-1;break;}continue;}
    const p=(-half-v)/d,q=(half-v)/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
   }
   // Clip before sampling, so million-metre ways cannot create million loops.
   for(let distance=Math.max(0,Math.ceil((along+lo*length-1e-8)/6)*6-along);distance<=hi*length+1e-8&&trees.length<2048;distance+=6){
    if(along+distance<=lastSample+1e-8)continue;
    const point=[a[0]+dx*distance/length,a[1]+dz*distance/length];
    if(within(point)){trees.push({id:`row/${way.id}/${sample++}`,point,height:height(way.tags),source:'row'});lastSample=along+distance;}
   }
   along+=length;
  }
 }
 return {landcover,trees};
}

export function validLandcoverFields(o){
 const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1e7);
 const ring=r=>Array.isArray(r)&&r.length>=3&&r.length<=8192&&r.every(point);
 return (o.landcover===undefined||(Array.isArray(o.landcover)&&o.landcover.length<=1024&&o.landcover.every(a=>a&&typeof a.id==='string'&&Object.hasOwn(landcoverKinds,a.kind)&&ring(a.outer)&&Array.isArray(a.holes)&&a.holes.length<=1024&&a.holes.every(ring)&&a.outer.length+a.holes.reduce((n,r)=>n+r.length,0)<=8192)))&&
  (o.trees===undefined||(Array.isArray(o.trees)&&o.trees.length<=2048&&o.trees.every(t=>t&&typeof t.id==='string'&&point(t.point)&&Number.isFinite(t.height)&&t.height>0&&t.height<=40&&['node','row'].includes(t.source))));
}
