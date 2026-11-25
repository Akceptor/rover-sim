// Profile coordinates: +X forward, +Y up, +Z right.
export function resizeCollisionBoxes(vehicle,reference){
 const scale=[vehicle.length/reference.length,vehicle.height/reference.height,vehicle.width/reference.width];
 return reference.collisionBoxes.map(box=>({...box,
  size:box.size.map((v,i)=>v*scale[i]),
  position:box.position.map((v,i)=>v*scale[i])
 }));
}
