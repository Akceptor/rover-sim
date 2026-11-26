import {terrainHeight} from './terrain.js';

export function barrierGeometry(barriers,terrain){
 if(!barriers?.length)return [];
 const half=(terrain.size-1)*terrain.spacing/2,shapes=[];
 const sample=(x,z)=>terrainHeight(terrain,Math.max(-half,Math.min(half,x)),Math.max(-half,Math.min(half,z)));
 const total=barriers.reduce((n,b)=>n+(b.points.length===2?Math.hypot(...b.points[1].map((v,i)=>v-b.points[0][i])):0),0),step=Math.max(1,total/4096);
 function box(b,a,c,width,extra='panel'){
  const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length<.001)return;
  const angle=Math.atan2(dz,dx),offset=[-Math.sin(angle)*width/2,Math.cos(angle)*width/2],corners=[a,c].flatMap(p=>[-1,1].map(s=>p.map((v,i)=>v+offset[i]*s)));
  let low=Infinity,high=-Infinity;const consider=(x,z)=>{const y=sample(x,z);low=Math.min(low,y);high=Math.max(high,y);};
  for(const p of corners)consider(...p);
  const minX=Math.max(0,Math.floor((Math.min(...corners.map(p=>p[0]))+half)/terrain.spacing)),maxX=Math.min(terrain.size-1,Math.ceil((Math.max(...corners.map(p=>p[0]))+half)/terrain.spacing));
  const minZ=Math.max(0,Math.floor((Math.min(...corners.map(p=>p[1]))+half)/terrain.spacing)),maxZ=Math.min(terrain.size-1,Math.ceil((Math.max(...corners.map(p=>p[1]))+half)/terrain.spacing));
  for(let i=minX;i<=maxX;i++)for(let j=minZ;j<=maxZ;j++)consider(i*terrain.spacing-half,j*terrain.spacing-half);
  const bottom=low-.05,top=high+b.height;
  shapes.push({id:b.id,type:b.type,part:extra,shape:'box',position:[(a[0]+c[0])/2,(bottom+top)/2,(a[1]+c[1])/2],size:[length+.002,top-bottom,width],angle});
 }
 for(const b of barriers){
  if(b.type==='entrance')continue;
  if(b.points.length===1){
   const [x,z]=b.points[0],bottom=sample(x,z)-.05;
   shapes.push({id:b.id,type:b.type,part:'point',shape:b.type==='bollard'?'cylinder':'box',position:[x,bottom+(b.height+.05)/2,z],size:[b.width,b.height+.05,b.width],angle:0});continue;
  }
  const [a,c]=b.points,dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length<.001)continue;
  if(!b.open){const n=Math.ceil(length/step);for(let i=0;i<n;i++)box(b,a.map((v,j)=>v+(c[j]-v)*i/n),a.map((v,j)=>v+(c[j]-v)*(i+1)/n),b.thickness);}
  for(let i=0;i<2;i++)if(b.endPosts[i]){
   const p=b.points[i],sign=i?1:-1,centre=p.map((v,j)=>v+sign*[dx,dz][j]/length*.06),along=[dx/length*.06,dz/length*.06];
   box(b,centre.map((v,j)=>v-along[j]),centre.map((v,j)=>v+along[j]),.12,'post');
  }
 }
 return shapes;
}

export function barrierSpawnWarning(shapes,vehicle){
 const spawn=(vehicle.drivetrain==='tracked'?vehicle.trackGeometry.radius:vehicle.wheelRadius)+vehicle.suspension;
 const boxes=vehicle.collisionBoxes??[{size:[vehicle.length,vehicle.height,vehicle.width],position:[0,0,0]}];
 const hit=shapes?.some(b=>boxes.some(v=>{
  const centre=[v.position[0],spawn+v.position[1],v.position[2]];
  if(b.position[1]-b.size[1]/2>centre[1]+v.size[1]/2||b.position[1]+b.size[1]/2<centre[1]-v.size[1]/2)return false;
  const dx=b.position[0]-centre[0],dz=b.position[2]-centre[2];
  if(b.shape==='cylinder')return Math.hypot(Math.max(0,Math.abs(dx)-v.size[0]/2),Math.max(0,Math.abs(dz)-v.size[2]/2))<=b.size[0]/2;
  const c=Math.cos(b.angle),s=Math.sin(b.angle);
  return [[1,0],[0,1],[c,s],[-s,c]].every(([x,z])=>Math.abs(dx*x+dz*z)<=v.size[0]/2*Math.abs(x)+v.size[2]/2*Math.abs(z)+b.size[0]/2*Math.abs(c*x+s*z)+b.size[2]/2*Math.abs(-s*x+c*z));
 }));
 return hit?'Selected start intersects a mapped barrier; choose a nearby start.':'';
}

export function barrierStatus(status,shapes,vehicle){
 const previous=status.spawnWarning?` · Warning: ${status.spawnWarning}`:'',base=previous&&status.message?.endsWith(previous)?status.message.slice(0,-previous.length):status.message??'';
 const spawnWarning=barrierSpawnWarning(shapes,vehicle);
 return {...status,spawnWarning,message:base+(spawnWarning?` · Warning: ${spawnWarning}`:'')};
}
