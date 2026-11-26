import * as T from '/three.js';
import {terrainMesh} from '/terrain.js';
import {computeTerrainVertexColors} from '/terrain-shading.js';
export function addTerrain(world,terrain,renderer,profile=null,landcoverAt=null){
 const {vertices,indices}=terrainMesh(terrain),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setIndex(new T.BufferAttribute(indices,1));
 const n=terrain.size,uv=new Float32Array(n*n*2),colors=computeTerrainVertexColors(terrain,landcoverAt);
 const extent=(n-1)*terrain.spacing;
 for(let x=0;x<n;x++)for(let z=0;z<n;z++){
  const k=x*n+z;uv.set([x*terrain.spacing/2,z*terrain.spacing/2],k*2);
 }
 geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.computeVertexNormals();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#e8e5da';ctx.fillRect(0,0,256,256);let seed=87;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<14000;i++){ctx.fillStyle=i%3===0?'#bbb5a4':'#f1efdf';ctx.globalAlpha=.25+random()*.4;ctx.fillRect(random()*256,random()*256,1+random()*2,1+random()*5);}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),profile?.anisotropyCap??16);
 const Material=profile?.materialMode==='lambert'?T.MeshLambertMaterial:T.MeshStandardMaterial;
 const opts={map,vertexColors:true,side:T.DoubleSide};if(profile?.materialMode!=='lambert')opts.roughness=1;
 const mesh=new T.Mesh(geometry,new Material(opts));mesh.receiveShadow=true;mesh.name='real-terrain';world.add(mesh);
 return extent;
}
export function addTreeCrown(world,object,profile=null){
 const height=object.size[1];
 const Material=profile?.materialMode==='lambert'?T.MeshLambertMaterial:T.MeshStandardMaterial;
 const opts={color:0x40583c};if(profile?.materialMode!=='lambert')opts.roughness=1;
 const crown=new T.Mesh(new T.ConeGeometry(height*.32,height*.9,7),new Material(opts));
 crown.position.set(object.position[0],object.position[1]+height*.35,object.position[2]);crown.castShadow=true;crown.receiveShadow=true;world.add(crown);
}
