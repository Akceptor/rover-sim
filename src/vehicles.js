// Metres, kilograms, seconds, newtons, radians. +X forward, +Y up, +Z right.
// Estimates, not manufacturer specifications: see README calibration procedure.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Read per call so tests and the editor can point at another directory via the environment.
export const vehiclesDir=()=>process.env.ROVER_VEHICLES_DIR?path.resolve(process.env.ROVER_VEHICLES_DIR):fileURLToPath(new URL('../config/vehicles',import.meta.url));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const readProfile=(dir,d)=>JSON.parse(fs.readFileSync(path.join(dir,d,'vehicle.json'),'utf8'));
function loadProfiles(){const dir=vehiclesDir();return freeze(fs.readdirSync(dir).filter(d=>fs.statSync(path.join(dir,d)).isDirectory()&&fs.existsSync(path.join(dir,d,'vehicle.json'))).map(d=>readProfile(dir,d)).sort((a,b)=>a.id==='mn168'?-1:b.id==='mn168'?1:a.name.localeCompare(b.name)));}
export let vehicleProfiles=loadProfiles();
let fields=Object.keys(vehicleProfiles[0]);
export function reloadProfiles(){const next=loadProfiles();vehicleProfiles=next;fields=Object.keys(next.find(p=>p.id==='mn168')??next[0]);}
export function readProfileFiles(id){
 if(!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id))throw Error('invalid profile id');
 const dir=vehiclesDir(),parm=path.join(dir,id,'sitl.parm');
 return {profile:readProfile(dir,id),sitlParm:fs.existsSync(parm)?fs.readFileSync(parm,'utf8'):null};
}
const calibration=channel=>({channel,min:1000,trim:1500,max:2000,reversed:false});
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
 for(const key of ['centerOfGravity','cameraMount','suspensionTuning','drive','trackGeometry','diff']){object(value[key]??base[key],key);for(const k of Object.keys(value[key]??{}))if(!(k in base[key]))throw Error(`unknown vehicle ${key}.${k}`);v[key]={...base[key],...value[key]};}
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
 range(v.steerRate,0,100,'steerRate');for(const key of ['ackermannFactor','torqueSplit'])range(v[key],0,1,key,true);
 for(const [k,x] of Object.entries(v.diff))if(!['locked','open'].includes(x))throw Error(`invalid vehicle diff.${k}`);
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
