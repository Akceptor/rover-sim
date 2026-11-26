import * as T from '/three.js';

let fenceTexture;
function fenceMap(){
 if(!fenceTexture){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
  ctx.strokeStyle='#a9b5bb';ctx.lineWidth=1.5;
  for(let x=-64;x<=128;x+=8){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+64,64);ctx.moveTo(x,0);ctx.lineTo(x-64,64);ctx.stroke();}
  fenceTexture=new T.CanvasTexture(canvas);fenceTexture.colorSpace=T.SRGBColorSpace;fenceTexture.wrapS=fenceTexture.wrapT=T.RepeatWrapping;
 }
 return fenceTexture;
}
export function addBarrierOverlay(world,shapes,profile=null){
 if(!shapes?.length)return;
 const Material=profile?.materialMode==='lambert'?T.MeshLambertMaterial:T.MeshStandardMaterial;
 const colors={wall:0xa49d8c,retaining_wall:0x90918b,fence:0x7e8990,gate:0xb3854a,lift_gate:0xb5b7bc,bollard:0xd1b342,block:0x999e9c};
 // Spatial batches keep distant barriers independently cullable.
 const batches=new Map();
 for(const shape of shapes){
  const key=`${shape.type}:${shape.shape}:${shape.part}:${Math.floor(shape.position[0]/64)},${Math.floor(shape.position[2]/64)}`;
  if(!batches.has(key))batches.set(key,[]);batches.get(key).push(shape);
 }
 const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
 for(const [key,items]of batches){
  const first=items[0],geometry=first.shape==='cylinder'?new T.CylinderGeometry(.5,.5,1,16):new T.BoxGeometry(1,1,1);
  const material=new Material({color:colors[first.type],...(profile?.materialMode==='lambert'?{}:{roughness:.9}),...(first.type==='fence'?{map:fenceMap(),alphaTest:.3,side:T.DoubleSide}:{})});
  const mesh=new T.InstancedMesh(geometry,material,items.length);mesh.name=`osm-barriers:${key}`;mesh.castShadow=true;mesh.receiveShadow=true;
  for(const [i,b]of items.entries()){
   position.fromArray(b.position);rotation.setFromAxisAngle(new T.Vector3(0,1,0),-b.angle);scale.fromArray(b.size);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;world.add(mesh);
 }
}
