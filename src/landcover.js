import {insideRing} from './osm-footprints.js';

export const landcoverKinds=Object.freeze({
 forest:{priority:1,color:[83,111,70],material:'ground'},
 scrub:{priority:2,color:[125,133,86],material:'ground'},
 grass:{priority:3,color:[112,142,75],material:'grass'},
 farmland:{priority:4,color:[160,139,93],material:'dirt'},
 water:{priority:5,color:[88,119,129],material:'ground'},
});

// At most 64 cells per axis; clipped bounds prevent distant complete OSM
// polygons from allocating an unbounded index around this terrain patch.
export function createLandcoverIndex(areas,terrain){
 if(!areas?.length||!terrain)return ()=>null;
 const half=(terrain.size-1)*terrain.spacing/2,cell=Math.max(16,half*2/64),cells=new Map();
 const coord=v=>Math.floor((v+half)/cell),key=(i,j)=>`${i},${j}`;
 const ordered=areas.map(a=>({...a,...landcoverKinds[a.kind]})).sort((a,b)=>b.priority-a.priority||(a.id<b.id?-1:a.id>b.id?1:0));
 for(const a of ordered){
  const xs=a.outer.map(p=>p[0]),zs=a.outer.map(p=>p[1]);
  for(let i=coord(Math.max(-half,Math.min(...xs)));i<=coord(Math.min(half,Math.max(...xs)));i++)for(let j=coord(Math.max(-half,Math.min(...zs)));j<=coord(Math.min(half,Math.max(...zs)));j++){
   const k=key(i,j);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(a);
  }
 }
 return (x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>half||Math.abs(z)>half)return null;
  return (cells.get(key(coord(x),coord(z)))??[]).find(a=>insideRing(a.outer,x,z)&&!a.holes.some(r=>insideRing(r,x,z)))??null;
 };
}
