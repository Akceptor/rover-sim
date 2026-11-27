import * as T from '/three.js';

export function addWaterOverlay(world,prepared,profile){
 if(!prepared?.features?.length)return;
 const Material=profile?.materialMode==='lambert'?T.MeshLambertMaterial:T.MeshStandardMaterial;
 const materials=[];
 for(const feature of prepared.features){
  const batches=new Map(),v=feature.vertices;
  for(let i=0;i<v.length;i+=9){const key=`${Math.floor(v[i]/128)},${Math.floor(v[i+2]/128)}`;if(!batches.has(key))batches.set(key,[]);const target=batches.get(key);for(let j=0;j<9;j++)target.push(v[i+j]);}
  const material=new Material({color:0x397b92,transparent:true,opacity:.76,side:T.DoubleSide,depthWrite:false,...(profile?.materialMode==='lambert'?{}:{roughness:.24,metalness:.12})});
  material.onBeforeCompile=shader=>{
   shader.uniforms.waterTime={value:0};material.userData.shader=shader;
   shader.vertexShader='varying vec2 waterXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterXZ=position.xz;');
   shader.fragmentShader='uniform float waterTime;varying vec2 waterXZ;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(waterXZ.x*5.0+waterTime*1.3)*sin(waterXZ.y*4.0-waterTime);diffuseColor.rgb*=.94+.06*ripple;');
  };
  materials.push(material);
  for(const [key,vertices]of batches){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,material);mesh.name=`osm-water:${feature.id}:${key}`;mesh.renderOrder=2;world.add(mesh);}
 }
 world.userData.waterMaterials=materials;
 const rings=new T.InstancedMesh(new T.RingGeometry(.025,.04,16),new T.MeshBasicMaterial({color:0xd2eff5,transparent:true,opacity:.4,depthWrite:false,side:T.DoubleSide}),32);
 rings.name='water-contact-ripples';rings.frustumCulled=false;world.add(rings);
 const matrix=new T.Matrix4().makeScale(0,0,0);for(let i=0;i<32;i++)rings.setMatrixAt(i,matrix);
 world.userData.waterRipples={mesh:rings,items:Array(32).fill(null),next:0,last:0};
}

export function updateWater(world,now,contacts=[],speed=0){
 for(const m of world?.userData.waterMaterials??[])if(m.userData.shader)m.userData.shader.uniforms.waterTime.value=now/1000;
 const ripples=world?.userData.waterRipples;if(!ripples)return;
 if(Math.abs(speed)>.02&&now-ripples.last>90){
  for(const c of (contacts??[]).filter(c=>c.surface==='water').slice(0,2)){ripples.items[ripples.next]={born:now,x:c.position.x,y:c.position.y+(c.offset??.05)+.008,z:c.position.z};ripples.next=(ripples.next+1)%32;}
  ripples.last=now;
 }
 const matrix=new T.Matrix4(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);
 for(let i=0;i<32;i++){const r=ripples.items[i],age=r?(now-r.born)/700:2,scale=age<1?1+age*5:0;matrix.compose(new T.Vector3(r?.x??0,r?.y??0,r?.z??0),q,new T.Vector3(scale,scale,scale));ripples.mesh.setMatrixAt(i,matrix);}
 ripples.mesh.instanceMatrix.needsUpdate=true;
}
