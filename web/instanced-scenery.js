import * as T from '/three.js';

const _mat=new T.Matrix4(),_pos=new T.Vector3(),_quat=new T.Quaternion(),_scale=new T.Vector3(1,1,1);

/**
 * Batch world objects into InstancedMesh groups.
 * Returns a Group containing all instanced and non-instanced objects.
 * Trees emit trunk + crown instances; cones, rocks and boxes are grouped by kind+color.
 */
export function addWorldObjects(world,objects,profile=null){
 const lambert=profile?.materialMode==='lambert';
 const Material=lambert?T.MeshLambertMaterial:T.MeshStandardMaterial;
 const matOpts=(color,extra={})=>({color,...(lambert?{}:{roughness:.85}),...extra});

 // Group by visual bucket: kind + color (hex).
 const buckets=new Map();
 const crowns=[];
 for(const o of objects){
  const key=`${o.kind}:${o.color}`;
  if(!buckets.has(key))buckets.set(key,{kind:o.kind,color:o.color,items:[]});
  buckets.get(key).items.push(o);
  if(o.kind==='tree')crowns.push(o);
 }

 // Shared crown geometry (all tree crowns use the same cone shape, scaled per-instance).
 const crownGeom=new T.ConeGeometry(1,1,7);
 const crownMat=new Material(matOpts(0x40583c,lambert?{}:{roughness:1}));

 if(crowns.length){
  const mesh=new T.InstancedMesh(crownGeom,crownMat,crowns.length);
  mesh.name='instanced-crowns';
  mesh.castShadow=true;mesh.receiveShadow=true;
  for(let i=0;i<crowns.length;i++){
   const o=crowns[i],h=o.size[1];
   _pos.set(o.position[0],o.position[1]+h*.35,o.position[2]);
   _scale.set(h*.32,h*.9,h*.32);
   _mat.compose(_pos,_quat,_scale);
   mesh.setMatrixAt(i,_mat);
  }
  mesh.instanceMatrix.needsUpdate=true;
  world.add(mesh);
 }

 // Shared geometries per kind (reused across color buckets).
 const sharedGeometries=new Map();
 function getGeometry(kind,o){
  if(kind==='cone'){
   const key=`cone:${o.size[0]}:${o.size[1]}`;
   if(!sharedGeometries.has(key))sharedGeometries.set(key,new T.ConeGeometry(o.size[0]/2,o.size[1],16));
   return sharedGeometries.get(key);
  }
  // box-like: use size as key
  const key=`box:${o.size[0]}:${o.size[1]}:${o.size[2]}`;
  if(!sharedGeometries.has(key))sharedGeometries.set(key,new T.BoxGeometry(...o.size));
  return sharedGeometries.get(key);
 }

 // For each bucket, decide whether to instance or create individual meshes.
 for(const [,bucket] of buckets){
  const {kind,color,items}=bucket;
  if(kind==='ground')continue; // ground is handled separately

  // All items in a bucket share kind+color; check if they also share geometry.
  const sameSize=items.every(o=>o.size[0]===items[0].size[0]&&o.size[1]===items[0].size[1]&&o.size[2]===items[0].size[2]);

  if((sameSize||kind==='tree')&&items.length>=2){
   // Instance them all.
   const geom=getGeometry(kind,kind==='tree'?{size:[1,1,1]}:items[0]);
   const mat=new Material(matOpts(color));
   const mesh=new T.InstancedMesh(geom,mat,items.length);
   mesh.name=`instanced-${kind}`;
   mesh.castShadow=true;mesh.receiveShadow=true;
   const euler=new T.Euler();
   for(let i=0;i<items.length;i++){
    const o=items[i];
    _pos.fromArray(o.position);
    euler.set(0,0,o.angle??0);
    _quat.setFromEuler(euler);
    if(kind==='tree')_scale.fromArray(o.size);else _scale.set(1,1,1);
    _mat.compose(_pos,_quat,_scale);
    mesh.setMatrixAt(i,_mat);
   }
   mesh.instanceMatrix.needsUpdate=true;
   world.add(mesh);
  }else{
   // Fall back to individual meshes for mixed-size buckets.
   for(const o of items){
    const geom=getGeometry(kind,o);
    const mat=new Material(matOpts(color));
    const mesh=new T.Mesh(geom,mat);
    mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.position.fromArray(o.position);
    mesh.rotation.z=o.angle??0;
    world.add(mesh);
   }
  }
 }
}
