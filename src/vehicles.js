// Metres, kilograms, seconds, newtons, radians. +X forward, +Y up, +Z right.
// Estimates, not manufacturer specifications: see README calibration procedure.
const calibration=channel=>({channel,min:1000,trim:1500,max:2000,reversed:false});
const mn={id:'mn168',name:'MN168 · 4WD crawler',drivetrain:'wheeled',mass:3,length:.48,width:.24,height:.12,wheelbase:.30,track:.26,wheelRadius:.065,wheelWidth:.032,suspension:.07,maxSteer:.52,engineForce:4.5,maxSpeed:1.2,rollingResistance:.5,brakeImpulse:.08,
 centerOfGravity:{x:0,y:-.015,z:0},cameraMount:{x:.1,y:.16,z:0},
 suspensionTuning:{stiffness:80,compression:4.4,relaxation:4.4,travel:.045,maxForce:100,grip:2,sideGrip:1},
 drive:{deadband:.025,riseRate:2,fallRate:4,reverseThreshold:.08,neutralBrake:1,reverseBrake:1},
 contactModel:'ray',trackGeometry:{length:.36,width:.06,radius:.065,samples:5,lateralResistance:7},
 collisionBoxes:[{size:[.48,.12,.24],position:[0,0,0]},{size:[.23,.16,.22],position:[-.11,.15,0]}]};
const heavy={...mn,id:'heavy-crawler',name:'Expedition · heavy 4WD',mass:9,length:.72,width:.34,height:.16,wheelbase:.46,track:.38,wheelRadius:.095,wheelWidth:.048,suspension:.09,maxSteer:.48,engineForce:16,maxSpeed:1.5,rollingResistance:1.4,brakeImpulse:.24,
 centerOfGravity:{x:-.025,y:-.015,z:0},cameraMount:{x:.15,y:.24,z:0},
 suspensionTuning:{stiffness:65,compression:4.8,relaxation:5.2,travel:.065,maxForce:280,grip:1.8,sideGrip:1},
 drive:{...mn.drive,riseRate:1.1,fallRate:2.8},collisionBoxes:[{size:[.72,.16,.34],position:[0,0,0]},{size:[.34,.22,.31],position:[-.16,.2,0]}]};
const tracked={...mn,id:'tracked-crawler',name:'Surveyor · twin tracks',drivetrain:'tracked',mass:7,length:.55,width:.29,height:.14,wheelbase:.34,track:.34,wheelRadius:.075,wheelWidth:.075,suspension:.065,maxSteer:.52,engineForce:26,maxSpeed:.85,rollingResistance:1,brakeImpulse:.2,
 centerOfGravity:{x:0,y:-.025,z:0},cameraMount:{x:.13,y:.19,z:0},
 suspensionTuning:{stiffness:380,compression:18,relaxation:18,travel:.04,maxForce:150,grip:1.1,sideGrip:1},
 drive:{...mn.drive,riseRate:1.6,fallRate:3,neutralBrake:1},trackGeometry:{length:.5,width:.075,radius:.075,samples:5,lateralResistance:7},
 collisionBoxes:[{size:[.55,.14,.29],position:[0,0,0]},{size:[.26,.12,.26],position:[-.07,.13,0]}]};
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const vehicleProfiles=freeze([mn,heavy,tracked]);
const fields=Object.keys(mn);
function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`invalid vehicle ${label}`);}
function range(value,min,max,label,inclusive=false){if(!Number.isFinite(value)||(inclusive?value<min:value<=min)||value>max)throw Error(`invalid vehicle ${label}`);}
function vector(v,label){object(v,label);for(const key of ['x','y','z']){if(!Number.isFinite(v[key]))throw Error(`invalid vehicle ${label}.${key}`);}if(Object.keys(v).some(k=>!['x','y','z'].includes(k)))throw Error(`unknown vehicle ${label} field`);}
export function resolveVehicle(value='mn168'){
 if(value===undefined)value='mn168';
 if(typeof value==='string'){const found=vehicleProfiles.find(p=>p.id===value);if(!found)throw Error(`Unknown vehicle profile: ${value}`);return structuredClone(found);}
 object(value,'profile');
 for(const key of Object.keys(value))if(!fields.includes(key)&&key!=='profile')throw Error(`unknown vehicle ${key}`);
 const id=value.profile??(vehicleProfiles.some(p=>p.id===value.id)?value.id:'mn168');
 const base=resolveVehicle(id),v={...base,...value};delete v.profile;
 for(const key of ['centerOfGravity','cameraMount','suspensionTuning','drive','trackGeometry']){object(value[key]??base[key],key);for(const k of Object.keys(value[key]??{}))if(!(k in base[key]))throw Error(`unknown vehicle ${key}.${k}`);v[key]={...base[key],...value[key]};}
 if(!value.id&&!value.profile){v.id=Object.entries(value).some(([k,x])=>JSON.stringify(x)!==JSON.stringify(base[k]))?'custom':base.id;v.name=v.id==='custom'?'Custom · inline vehicle':base.name;}
 if(typeof v.id!=='string'||!v.id||typeof v.name!=='string'||!v.name)throw Error('invalid vehicle identity');
 if(!['wheeled','tracked'].includes(v.drivetrain))throw Error('invalid vehicle drivetrain');
 for(const key of ['mass','length','width','height','wheelbase','track','wheelRadius','wheelWidth','suspension','maxSteer','engineForce','maxSpeed'])range(v[key],0,{mass:10000,engineForce:100000,maxSpeed:100,maxSteer:1.5}[key]??20,key);
 for(const key of ['rollingResistance','brakeImpulse'])range(v[key],0,10000,key,true);
 if(v.wheelbase>v.length+2*v.wheelRadius||v.track>v.width+2*v.wheelWidth||v.height/2>=v.suspension+v.wheelRadius)throw Error('invalid vehicle contact geometry');
 vector(v.centerOfGravity,'centerOfGravity');vector(v.cameraMount,'cameraMount');
 if(Math.abs(v.centerOfGravity.x)>v.length/2||Math.abs(v.centerOfGravity.z)>v.width/2||Math.abs(v.centerOfGravity.y)>v.height)throw Error('invalid vehicle centerOfGravity');
 for(const [k,x] of Object.entries(v.suspensionTuning))range(x,0,k==='travel'?1:100000,`suspensionTuning.${k}`);
 for(const [k,x] of Object.entries(v.drive))range(x,0,['deadband','reverseThreshold'].includes(k)?.99:100,`drive.${k}`,['deadband','neutralBrake','reverseBrake'].includes(k));
 if(!['ray','multi-ray'].includes(v.contactModel))throw Error('invalid vehicle contactModel');
 for(const [k,x] of Object.entries(v.trackGeometry))range(x,0,k==='samples'?9:100,`trackGeometry.${k}`);
 if(!Number.isInteger(v.trackGeometry.samples)||v.trackGeometry.samples<3||v.trackGeometry.length<=v.trackGeometry.radius*2||v.trackGeometry.width>=v.track)throw Error('invalid vehicle trackGeometry');
 if(!value.collisionBoxes)v.collisionBoxes=[{size:[v.length,v.height,v.width],position:[0,0,0]},...base.collisionBoxes.slice(1).map(b=>({size:b.size.map((x,i)=>x*[v.length/base.length,v.height/base.height,v.width/base.width][i]),position:b.position.map((x,i)=>x*[v.length/base.length,v.height/base.height,v.width/base.width][i])}))];
 if(!Array.isArray(v.collisionBoxes)||!v.collisionBoxes.length||v.collisionBoxes.length>8)throw Error('invalid vehicle collisionBoxes');
 for(const b of v.collisionBoxes){object(b,'collision box');if(!Array.isArray(b.size)||!Array.isArray(b.position)||b.size.length!==3||b.position.length!==3||b.size.some(x=>!Number.isFinite(x)||x<=0||x>20)||b.position.some(x=>!Number.isFinite(x)||Math.abs(x)>20))throw Error('invalid vehicle collision box');}
 return v;
}
export function validateCalibration(p,label){if(!p||!Number.isInteger(p.channel)||p.channel<1||p.channel>32||![p.min,p.trim,p.max].every(Number.isFinite)||!(800<=p.min&&p.min<p.trim&&p.trim<p.max&&p.max<=2200)||typeof p.reversed!=='boolean')throw Error(`invalid ${label} calibration`);return p;}
export function resolveVehicleConfig(config,selection){
 const vehicle=resolveVehicle(selection??config.vehicle??'mn168');
 const c={...config,vehicle,steering:config.steering??calibration(2),throttle:config.throttle??calibration(4),leftTrack:config.leftTrack??calibration(2),rightTrack:config.rightTrack??calibration(4)};
 for(const key of ['steering','throttle','leftTrack','rightTrack'])validateCalibration(c[key],key);
 if(c.steering.channel===c.throttle.channel||c.leftTrack.channel===c.rightTrack.channel)throw Error('channels must differ');
 return c;
}
export function vehicleChoices(config){const choices=vehicleProfiles.map(({id,name,drivetrain})=>({id,name,drivetrain}));if(config.vehicle.id==='custom')choices.unshift({id:'custom',name:config.vehicle.name,drivetrain:config.vehicle.drivetrain});return choices;}
