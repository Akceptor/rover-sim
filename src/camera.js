// Camera channels are RC inputs; SERVO2/4 remain steering/throttle outputs.
export function cameraAim(rc){
 const axis=(channel,limit)=>{
  const value=rc?.connected?rc.channels?.[channel-1]:null;
  return Number.isFinite(value)&&value>=800&&value<=2200?Math.max(-1,Math.min(1,(1500-value)/500))*limit:0;
 };
 return {panDeg:axis(4,30),tiltDeg:axis(2,15)};
}
