import * as T from '/three.js';
export function addOsmOverlay(world,overlay){
 if(!overlay)return;
 function mesh(vertices,indices,material,name){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));if(indices)geometry.setIndex(indices);geometry.computeVertexNormals();const object=new T.Mesh(geometry,material);object.name=name;object.receiveShadow=true;world.add(object);return object;}
 for(const b of overlay.buildings){
  const object=mesh(b.vertices,b.indices,new T.MeshStandardMaterial({color:0xc5b9a1,roughness:.95,side:T.DoubleSide}),`osm-building:${b.id}`);object.castShadow=true;
 }
 for(const r of overlay.roads){
  const object=mesh(r.vertices,null,new T.MeshStandardMaterial({color:r.paved?0x66676a:0x9d8866,roughness:1,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),`osm-road:${r.id}`);object.renderOrder=1;
 }
}
