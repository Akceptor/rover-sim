import {createLandcoverIndex} from './landcover.js';
import {overlayOccupies} from './osm-footprints.js';

export function mappedVegetation(terrain,overlay,objects,heightAt,waterAt=()=>null){
 if(!overlay?.landcover?.length&&!overlay?.trees?.length&&!overlay?.water?.length)return objects;
 const half=(terrain.size-1)*terrain.spacing/2,coverAt=createLandcoverIndex(overlay.landcover,terrain),at=(x,z)=>{const c=coverAt(x,z);return c?.kind==='water'&&!waterAt(x,z)?null:c;},trees=[],cells=new Map();
 const key=(x,z)=>`${Math.floor(x/16)},${Math.floor(z/16)}`;
 const radius=o=>o.size[1]*.32;
 function nearby(x,z,r){
  const result=[];
  for(let i=Math.floor((x-r-13)/16);i<=Math.floor((x+r+13)/16);i++)for(let j=Math.floor((z-r-13)/16);j<=Math.floor((z+r+13)/16);j++)result.push(...(cells.get(`${i},${j}`)??[]));
  return result;
 }
 const collides=(x,z,r,mapped=false)=>nearby(x,z,r).some(o=>Math.hypot(x-o.position[0],z-o.position[2])<(mapped?.8:Math.max(.8,(r+radius(o))*.8)));
 const safe=(x,z,r)=>Math.abs(x)+r<half&&Math.abs(z)+r<half&&Math.hypot(x,z)>=8+r&&!overlayOccupies(overlay,x,z,r)&&![0,1,2,3,4,5,6,7,8].some(i=>{const a=i*Math.PI/4;return waterAt(x+(i===8?0:Math.cos(a)*r),z+(i===8?0:Math.sin(a)*r));});
 function add(x,z,h,extra){
  const r=h*.32;if(trees.length>=512||!safe(x,z,r)||collides(x,z,r,!!extra.osmId))return;
  const o={kind:'tree',size:[h>10?.4:.22,h,h>10?.4:.22],position:[x,heightAt(x,z)+h/2,z],color:extra.vegetation==='scrub'?0x596841:0x655039,...extra};
  trees.push(o);const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(o);
 }
 for(const t of [...(overlay.trees??[])].sort((a,b)=>(a.source==='node'?0:1)-(b.source==='node'?0:1)||(a.id<b.id?-1:a.id>b.id?1:0)))add(...t.point,t.height,{osmId:t.id});
 // Seeded shuffled grid avoids favoring one corner when a large patch hits the
 // cap. Every load and both renderer/physics callers produce identical objects.
 let seed=4617;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const spacing=Math.max(12,half*2/64),n=Math.ceil(half*2/spacing),candidates=[];
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)candidates.push([-half+(i+.2+random()*.6)*spacing,-half+(j+.2+random()*.6)*spacing,random(),random()]);
 candidates.sort((a,b)=>a[2]-b[2]);
 for(const [x,z,,v]of candidates){
  const cover=at(x,z);if(!cover||!['forest','scrub'].includes(cover.kind))continue;
  const h=cover.kind==='scrub'?.7+v*.8:3+v*4,r=h*.32;
  if([0,1,2,3,4,5,6,7].some(i=>at(x+Math.cos(i*Math.PI/4)*r,z+Math.sin(i*Math.PI/4)*r)?.id!==cover.id))continue;
  add(x,z,h,{vegetation:cover.kind});
 }
 const retained=objects.filter(o=>{
  if(!['tree','rock'].includes(o.kind))return true;
  const [x,,z]=o.position,r=o.kind==='tree'?radius(o):Math.max(...o.size);
  if(waterAt(x,z)||[0,1,2,3,4,5,6,7].some(i=>waterAt(x+Math.cos(i*Math.PI/4)*r,z+Math.sin(i*Math.PI/4)*r))||at(x,z)||[0,1,2,3,4,5,6,7].some(i=>at(x+Math.cos(i*Math.PI/4)*r,z+Math.sin(i*Math.PI/4)*r)))return false;
  return !collides(x,z,r);
 });
 // Generic unmapped fallback is small (100 candidates); cap the combined trees.
 let count=trees.length;return [...retained.filter(o=>o.kind!=='tree'||count++<512),...trees];
}
