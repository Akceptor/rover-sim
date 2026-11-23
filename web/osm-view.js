import * as T from '/three.js';
import {buildingSurfaces,buildingStyle} from '/building-surfaces.js';
import {buildingTexture} from '/building-textures.js';
import {roadTexture} from '/road-textures.js';
import {roadUV} from '/road-surface.js';
import {terrainHeight} from '/terrain.js';
export function addOsmOverlay(world,overlay,terrain){
 if(!overlay)return;
 function mesh(vertices,indices,material,name,uv){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));if(uv)geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));if(indices)geometry.setIndex(indices);geometry.computeVertexNormals();const object=new T.Mesh(geometry,material);object.name=name;object.receiveShadow=true;world.add(object);return object;}
 for(const b of overlay.buildings){
  const surfaces=buildingSurfaces(b),style=buildingStyle(b.id),positions=[],uv=[],groups=[],materials=[];
  for(const [kind,part]of [['windows',surfaces.walls],['roof',surfaces.roof],['base',surfaces.foundation]]){
   const start=positions.length/3;positions.push(...part.positions);uv.push(...part.uv);groups.push({start,count:part.positions.length/3,materialIndex:materials.length});
   const map=buildingTexture(style,kind);materials.push(new T.MeshStandardMaterial({map,bumpMap:kind==='windows'?map:null,bumpScale:kind==='windows'?.018:0,roughness:.92,side:T.DoubleSide}));
  }
  const object=mesh(positions,null,materials,`osm-building:${b.id}`,uv);object.geometry.clearGroups();for(const g of groups)object.geometry.addGroup(g.start,g.count,g.materialIndex);object.castShadow=true;
  const door=surfaces.door;
  if(door){
   let base=door.base;if(terrain){const h=(terrain.size-1)*terrain.spacing/2;base=terrainHeight(terrain,Math.max(-h,Math.min(h,door.x)),Math.max(-h,Math.min(h,door.z)));}
   if(base+door.height+.1>b.top)continue;
   const entry=new T.Mesh(new T.PlaneGeometry(1,door.height),new T.MeshStandardMaterial({map:buildingTexture(style,'door'),transparent:true,side:T.DoubleSide,roughness:.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
   entry.name=`osm-door:${b.id}`;entry.position.set(door.x,base+door.height/2,door.z);entry.rotation.y=door.angle;world.add(entry);
  }
 }
 for(const r of overlay.roads){
  const object=mesh(r.vertices,null,new T.MeshStandardMaterial({map:roadTexture(r.paved),roughness:1,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),`osm-road:${r.id}`,roadUV(r.vertices));object.renderOrder=1;
 }
}
