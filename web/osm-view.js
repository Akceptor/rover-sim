import * as T from '/three.js';
import {buildingSurfaces,buildingStyle} from '/building-surfaces.js';
import {buildingTexture} from '/building-textures.js';
import {roadTexture} from '/road-textures.js';
import {roadUV} from '/road-surface.js';
import {terrainHeight} from '/terrain.js';
const CELL=500;
export function addOsmOverlay(world,overlay,terrain,profile=null){
 if(!overlay)return;
 const lambert=profile?.materialMode==='lambert',Material=lambert?T.MeshLambertMaterial:T.MeshStandardMaterial,useBump=profile?.useBumpMap??true;
 const batches=new Map();
 function batch(key,x,z,make){const k=`${key}|${Math.floor(x/CELL)},${Math.floor(z/CELL)}`;let b=batches.get(k);if(!b){b={key,make,positions:[],uv:[]};batches.set(k,b);}return b;}
 function push(target,source){for(let i=0;i<source.length;i++)target.push(source[i]);}
 const materials=new Map();
 function material(key,make){let m=materials.get(key);if(!m){m=make();materials.set(key,m);}return m;}
 for(const b of overlay.buildings){
  const surfaces=buildingSurfaces(b),style=buildingStyle(b.id),p0=surfaces.walls.positions;
  for(const [kind,part]of [['windows',surfaces.walls],['roof',surfaces.roof],['base',surfaces.foundation]]){
   const map=buildingTexture(style,kind),target=batch(`b:${kind}:${map.uuid}`,p0[0],p0[2],()=>material(`b:${kind}:${map.uuid}`,()=>new Material({map,...(useBump&&kind==='windows'?{bumpMap:map,bumpScale:.018}:{}),...(lambert?{}:{roughness:.92}),side:T.DoubleSide})));
   push(target.positions,part.positions);push(target.uv,part.uv);
  }
  const door=surfaces.door;
  if(door){
   let base=door.base;if(terrain){const h=(terrain.size-1)*terrain.spacing/2;base=terrainHeight(terrain,Math.max(-h,Math.min(h,door.x)),Math.max(-h,Math.min(h,door.z)));}
   if(base+door.height+.1>b.top)continue;
   const map=buildingTexture(style,'door'),target=batch(`d:${map.uuid}`,door.x,door.z,()=>material(`d:${map.uuid}`,()=>new Material({map,transparent:true,side:T.DoubleSide,...(lambert?{}:{roughness:.8}),polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}))),c=Math.cos(door.angle),s=Math.sin(door.angle),y=base+door.height/2,hh=door.height/2;
   const corner=(u,v)=>{target.positions.push(u*c+door.x,v*hh+y,-u*s+door.z);target.uv.push(u+.5,v/2+.5);};
   for(const [u,v]of [[-.5,1],[-.5,-1],[.5,1],[-.5,-1],[.5,-1],[.5,1]])corner(u,v);
  }
 }
 for(const r of overlay.roads){
  const target=batch(`r:${r.paved?1:0}`,r.vertices[0],r.vertices[2],()=>material(`r:${r.paved?1:0}`,()=>{const m=new Material({map:roadTexture(r.paved),...(lambert?{}:{roughness:1}),side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});m.userData.roadPaved=!!r.paved;return m;}));
  push(target.positions,r.vertices);push(target.uv,roadUV(r.vertices));
 }
 world.userData.roadMaterials=[...materials.values()].filter(m=>m.userData.roadPaved!==undefined);
 for(const [id,b]of batches){
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));geometry.computeVertexNormals();
  const object=new T.Mesh(geometry,b.make());object.name=`osm-${{b:'buildings',d:'doors',r:'roads'}[b.key[0]]}:${id.slice(2)}`;object.receiveShadow=true;
  if(b.key[0]==='b')object.castShadow=true;if(b.key[0]==='r')object.renderOrder=1;
  world.add(object);
 }
}
