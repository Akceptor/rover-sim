import {roadMaterial,roadMaterials} from './road-materials.js';

// Clip indexing to the terrain and at most 64 cells per axis, even for enormous
// ways crossing a patch. Runtime queries inspect only their own cell's segments.
export function createRoadIndex(overlay,terrain){
 if(!overlay?.roads.length||!terrain)return ()=>roadMaterials.ground;
 const half=(terrain.size-1)*terrain.spacing/2,cell=Math.max(16,half*2/64),cells=new Map();
 const key=(i,j)=>`${i},${j}`,coord=v=>Math.floor((v+half)/cell);
 for(const road of overlay.roads){
  const material=roadMaterial(road),radius=road.width/2;
  for(let n=1;n<road.points.length;n++){
   const a=road.points[n-1],b=road.points[n],dx=b[0]-a[0],dz=b[1]-a[1];
   const minX=Math.max(-half,Math.min(a[0],b[0])-radius),maxX=Math.min(half,Math.max(a[0],b[0])+radius);
   const minZ=Math.max(-half,Math.min(a[1],b[1])-radius),maxZ=Math.min(half,Math.max(a[1],b[1])+radius);
   const segment={a,dx,dz,length2:dx*dx+dz*dz,radius2:radius*radius,material,id:road.id};
   for(let i=coord(minX);i<=coord(maxX);i++)for(let j=coord(minZ);j<=coord(maxZ);j++){
    const k=key(i,j);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(segment);
   }
  }
 }
 for(const segments of cells.values())segments.sort((a,b)=>b.material.priority-a.material.priority||(a.id<b.id?-1:a.id>b.id?1:0));
 return (x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>half||Math.abs(z)>half)return roadMaterials.ground;
  for(const s of cells.get(key(coord(x),coord(z)))??[]){
   const u=s.length2?Math.max(0,Math.min(1,((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/s.length2)):0;
   if((x-s.a[0]-u*s.dx)**2+(z-s.a[1]-u*s.dz)**2<=s.radius2)return s.material;
  }
  return roadMaterials.ground;
 };
}
