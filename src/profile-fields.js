export const LIVE_FIELDS=['mass','centerOfGravity','maxSteer','steerRate','ackermannFactor','torqueSplit','diff','engineForce','maxSpeed','rollingResistance','brakeImpulse','drive','suspensionTuning','trackGeometry.lateralResistance','fpvFov'];
export const RELOAD_FIELDS=['id','name','drivetrain','length','width','height','wheelbase','track','wheelRadius','wheelWidth','suspension','contactModel','cameraMount','collisionBoxes','trackGeometry.length','trackGeometry.width','trackGeometry.radius','trackGeometry.samples'];
const covers=(list,path)=>list.some(f=>path===f||path.startsWith(f+'.'));
export function fieldClass(path){if(covers(LIVE_FIELDS,path))return 'live';if(covers(RELOAD_FIELDS,path))return 'reload';throw Error(`unclassified profile field: ${path}`);}
export function applyLiveFields(target,source){for(const path of LIVE_FIELDS){const [a,b]=path.split('.');if(b)target[a][b]=source[a][b];else target[a]=structuredClone(source[a]);}}
