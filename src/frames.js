// Physics: +X north/forward, +Y up, +Z east/right. Proper rotation to NED/FRD.
export const ned=v=>[v.x,v.z||0,-v.y||0];
export function rotate(q,v) {
  const u={x:q.x,y:q.y,z:q.z};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const t=cross(u,v),s=cross(u,t);
  return {x:v.x+2*(q.w*t.x+s.x),y:v.y+2*(q.w*t.y+s.y),z:v.z+2*(q.w*t.z+s.z)};
}
export function sensors(q,angular,acceleration) {
  const inverse={x:-q.x,y:-q.y,z:-q.z,w:q.w};
  return {quaternion:[q.w,q.x,q.z||0,-q.y||0],gyro:ned(rotate(inverse,angular)),accel_body:ned(rotate(inverse,{x:acceleration.x,y:acceleration.y+9.80665,z:acceleration.z}))};
}
