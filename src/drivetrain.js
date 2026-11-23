const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export function demand(value){return Number.isFinite(value)?clamp(value,-1,1):0;}
export function trackDemands(throttle,steering){const l=throttle+steering,r=throttle-steering,n=Math.max(1,Math.abs(l),Math.abs(r));return {left:l/n,right:r/n};}
// Explicitly prevent drive torque fighting the brake during direction changes.
export function driveStep(previous,requested,speed,dt,tuning){
 const raw=demand(requested),target=Math.abs(raw)<=tuning.deadband?0:Math.sign(raw)*(Math.abs(raw)-tuning.deadband)/(1-tuning.deadband);
 const reversing=target!==0&&speed*target<0&&Math.abs(speed)>tuning.reverseThreshold;
 if(reversing)return {value:0,brake:tuning.reverseBrake};
 // Cross neutral first even when below the reversal speed threshold.
 const nextTarget=target*previous<0?0:target;
 const rate=Math.abs(nextTarget)>Math.abs(previous)?tuning.riseRate:tuning.fallRate;
 const value=previous+clamp(nextTarget-previous,-rate*dt,rate*dt);
 return {value,brake:target===0?tuning.neutralBrake:0};
}
