import * as T from 'three';
import {createCrawler} from './MN-168.js';

// Metres, +X forward, +Y up, +Z right; all animation consumes physics state.
export function createVehicle(c){
 const legacy=c.id==='mn168'||!c.id;
 const v=legacy?createCrawler(c):createProfileModel(c);
 v.tracks??=[];
 v.update=s=>{
  for(let i=0;i<v.wheels.length;i++){
   const w=s.wheels?.[i];if(!w)continue;
   v.wheels[i].steer.position.set(w.x,w.y,w.z);
   v.wheels[i].steer.rotation.y=w.steering??0;
   v.wheels[i].spin.rotation.z=w.rotation??0;
  }
  for(const track of v.tracks){const motion=s.tracks?.find(t=>t.side===track.side);if(motion&&Number.isFinite(motion.distance))track.animate(motion.distance);if(motion){const contacts=motion.contacts?.filter(p=>p.contact&&Number.isFinite(p.y))??[];const rest=-c.suspension,travel=c.suspensionTuning?.travel??c.suspension;track.carrier.position.y=contacts.length?T.MathUtils.clamp(contacts.reduce((sum,p)=>sum+p.y,0)/contacts.length+c.trackGeometry.radius*1.055,rest-travel,rest+travel):rest;}}
 };
 return v;
}
function createProfileModel(c){
 const model=new T.Group();model.name=c.id;
 const paint=new T.MeshStandardMaterial({color:c.drivetrain==='tracked'?0x65714e:0x426b79,roughness:.65,metalness:.2});
 const rubber=new T.MeshStandardMaterial({color:0x202522,roughness:.95});
 const metal=new T.MeshStandardMaterial({color:0x8c9997,roughness:.4,metalness:.65});
 const glass=new T.MeshStandardMaterial({color:0x77969c,roughness:.18,metalness:.4});
 function mesh(geometry,material,parent=model,name=''){const m=new T.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 const body=new T.Group();body.name='body';model.add(body);
 for(const b of c.collisionBoxes??[{size:[c.length,c.height,c.width],position:[0,0,0]}])mesh(new T.BoxGeometry(...b.size),paint,body).position.fromArray(b.position);
 // Recessed windows and lamp faces stay inside the physical body envelope.
 const upper=(c.collisionBoxes??[]).at(-1);if(upper){const [l,h,w]=upper.size,[x,y,z]=upper.position;for(const side of [-1,1])mesh(new T.BoxGeometry(l*.56,h*.45,.001),glass).position.set(x,y+h*.08,z+side*(w/2-.001));}
 const wheels=[],tracks=[];
 function roller(radius,width,parent){const m=mesh(new T.CylinderGeometry(radius,radius,width,20),rubber,parent);m.rotation.x=Math.PI/2;const hub=mesh(new T.CylinderGeometry(radius*.48,radius*.48,width*1.02,12),metal,parent);hub.rotation.x=Math.PI/2;}
 if(c.drivetrain!=='tracked'){
  for(let i=0;i<4;i++){const steer=new T.Group(),spin=new T.Group();steer.name=`wheel-${i}`;steer.position.set((i<2?1:-1)*c.wheelbase/2,-c.suspension,(i%2?1:-1)*c.track/2);model.add(steer);steer.add(spin);roller(c.wheelRadius,c.wheelWidth,spin);const marker=mesh(new T.BoxGeometry(c.wheelRadius*1.6,c.wheelRadius*.12,c.wheelWidth*1.04),metal,spin);marker.name='wheel-spoke';wheels.push({steer,spin});}
 }else{
  const g=c.trackGeometry,r=g.radius,halfStraight=g.length/2-r,perimeter=4*halfStraight+2*Math.PI*r;
  const blockLength=perimeter/48*.84,transform=new T.Object3D();
  // Constant-size instances around a stadium path, no physical or rendered links.
  function point(distance){let d=((distance%perimeter)+perimeter)%perimeter;if(d<2*halfStraight)return [halfStraight-d,r,0];d-=2*halfStraight;if(d<Math.PI*r){const a=Math.PI/2+d/r;return [-halfStraight+Math.cos(a)*r,Math.sin(a)*r,a-Math.PI/2];}d-=Math.PI*r;if(d<2*halfStraight)return [-halfStraight+d,-r,Math.PI];d-=2*halfStraight;const a=-Math.PI/2+d/r;return [halfStraight+Math.cos(a)*r,Math.sin(a)*r,a-Math.PI/2];}
  for(const [side,z] of [['left',-c.track/2],['right',c.track/2]]){
   const carrier=new T.Group();carrier.position.set(0,-c.suspension,z);carrier.name=`track-${side}`;model.add(carrier);
   for(const x of [-halfStraight,0,halfStraight]){const group=new T.Group();group.position.x=x;carrier.add(group);roller(r*.86,g.width*.85,group);}
   const belt=new T.InstancedMesh(new T.BoxGeometry(blockLength,r*.11,g.width),rubber,48);belt.name=`tread-${side}`;belt.castShadow=true;belt.receiveShadow=true;carrier.add(belt);
   const track={side,carrier,mesh:belt,distance:0,animate(distance){this.distance=distance;for(let i=0;i<48;i++){const [x,y,a]=point(i*perimeter/48-distance);transform.position.set(x,y,0);transform.rotation.set(0,0,a);transform.updateMatrix();belt.setMatrixAt(i,transform.matrix);}belt.instanceMatrix.needsUpdate=true;belt.computeBoundingSphere();}};track.animate(0);tracks.push(track);
  }
 }
 return {model,wheels,tracks,dispose(){const geometries=new Set(),materials=new Set();model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
