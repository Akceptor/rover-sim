import {prepareWater} from './water-geometry.js';
import {createWaterIndex} from './water.js';
import {mappedVegetation} from './vegetation.js';
import {overlayOccupies} from './osm-footprints.js';
import {terrainHeight} from './terrain-grid.js';
export {validateTerrain,terrainMesh,terrainHeight,terrainApproximationWarning} from './terrain-grid.js';
export function terrainObjects(t,overlay=null,water=null){
 water??=overlay?prepareWater(overlay,t):null;const waterAt=createWaterIndex(water,t);
 const out=[],half=(t.size-1)*t.spacing/2;
 // Boundary segments follow each imported edge; their tops are two metres above ground.
 for(let i=0;i<t.size-1;i++)for(const sign of [-1,1]){
  const v=i*t.spacing-half,next=(i+1)*t.spacing-half;
  const eastTop=Math.max(terrainHeight(t,sign*half,v),terrainHeight(t,sign*half,next));
  const northTop=Math.max(terrainHeight(t,v,sign*half),terrainHeight(t,next,sign*half));
  out.push({kind:'barrier',size:[.25,20,t.spacing],position:[sign*half,eastTop-8,v+t.spacing/2],color:0x687164});
  out.push({kind:'barrier',size:[t.spacing,20,.25],position:[v+t.spacing/2,northTop-8,sign*half],color:0x687164});
 }
 let seed=4617;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<100;i++){
  const x=(random()-.5)*Math.min(half*1.8,220),z=(random()-.5)*Math.min(half*1.8,220);
  if(Math.hypot(x,z)<8)continue;
  const y=terrainHeight(t,x,z),height=2.5+random()*3;
  if(i%3===0){const s=.15+random()*.35;out.push({kind:'rock',size:[s,s*.7,s*.9],position:[x,y+s*.35,z],color:0x777b70});}
  else out.push({kind:'tree',size:[.22,height,.22],position:[x,y+height/2,z],color:0x655039});
 }
 const cleared=overlay?out.filter(o=>!['tree','rock'].includes(o.kind)||!overlayOccupies(overlay,o.position[0],o.position[2],o.kind==='tree'?o.size[1]*.32:Math.max(...o.size))):out;
 return mappedVegetation(t,overlay,cleared,(x,z)=>terrainHeight(t,x,z),waterAt);
}
