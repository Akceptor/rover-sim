import R from '@dimforge/rapier3d-compat';
import {resolveVehicle} from './vehicles.js';
import {driveStep,demand,trackDemands,axleForces} from './drivetrain.js';
import {playground} from './world.js';
import {validateTerrain,terrainMesh,terrainObjects} from './terrain.js';
import {ned,rotate,sensors} from './frames.js';
import {overlayGeometry} from './osm.js';
import {applyLiveFields} from './profile-fields.js';
import {createRoadIndex} from './road-index.js';
import {roadMaterials} from './road-materials.js';
import {createWaterIndex,normalizeWaterSettings} from './water.js';
let init;
export class Physics {
  static async create(config,obstacles=true,terrain=null,overlay=null,geometry=null,waterSettings){if(terrain)validateTerrain(terrain);init??=R.init();await init;return new Physics(config,obstacles,terrain,overlay,geometry,waterSettings);}
  constructor(c,obstacles,terrain,overlay,geometry,waterSettings) {
    c=resolveVehicle(c);this.c=c;this.world=new R.World({x:0,y:-9.80665,z:0});
    this.roadAt=createRoadIndex(overlay,terrain);
    geometry??=overlay?overlayGeometry(overlay,terrain):null;
    this.waterAt=createWaterIndex(geometry?.water,terrain);this.waterSettings=normalizeWaterSettings(waterSettings);this.waterFailure=null;this.waterEncounter=null;
    if(terrain){const {vertices,indices}=terrainMesh(terrain);this.terrainCollider=this.world.createCollider(R.ColliderDesc.trimesh(vertices,indices).setFriction(.9));}
    for(const o of (terrain?(obstacles?terrainObjects(terrain,overlay,geometry?.water):[]):(obstacles?playground:playground.slice(0,1)))){const [x,y,z]=o.position;const a=o.angle??0;const body=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x,y,z).setRotation({x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)}));const [sx,sy,sz]=o.size;this.world.createCollider((o.kind==='cone'?R.ColliderDesc.cone(sy/2,sx/2):R.ColliderDesc.cuboid(sx/2,sy/2,sz/2)).setFriction(.9),body);}
    if(overlay)for(const building of (geometry??overlayGeometry(overlay,terrain)).buildings)for(const prism of building.prisms){
      const shape=R.ColliderDesc.convexHull(new Float32Array(prism));
      if(!shape)throw Error(`Invalid building collider: ${building.id}`);
      this.world.createCollider(shape.setFriction(.9));
    }
    for(const b of (geometry??(overlay?overlayGeometry(overlay,terrain):null))?.barriers??[]){
      const [x,y,z]=b.position,[sx,sy,sz]=b.size,shape=b.shape==='cylinder'?R.ColliderDesc.cylinder(sy/2,sx/2):R.ColliderDesc.cuboid(sx/2,sy/2,sz/2);
      this.world.createCollider(shape.setTranslation(x,y,z).setRotation({x:0,y:Math.sin(-b.angle/2),z:0,w:Math.cos(b.angle/2)}).setFriction(.9));
    }
    this.body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,this.spawnHeight(),0).setCanSleep(false).setCcdEnabled(true).setLinearDamping(.08).setAngularDamping(.6));
    for(const box of c.collisionBoxes)this.world.createCollider(R.ColliderDesc.cuboid(...box.size.map(x=>x/2)).setTranslation(...box.position).setMass(0).setFriction(.5),this.body);
    this.applyMass();
    this.wheelPositions=[];this.wheelGroups=[];this.trackStates=[];
    if(c.drivetrain==='wheeled'){
      this.car=this.world.createVehicleController(this.body);this.car.indexUpAxis=1;this.car.setIndexForwardAxis=0;
      const offsets=c.contactModel==='multi-ray'?[-c.wheelRadius*.55,0,c.wheelRadius*.55]:[0];
      // Rapier side friction is disabled: resolve_single_bilateral uses a wrong effective mass and fixed 0.2 damping, making lateral grip soft and mass/inertia dependent. stepWheels applies it instead.
      for(const x of [c.wheelbase/2,-c.wheelbase/2])for(const z of [-c.track/2,c.track/2]){
        const group=[];this.wheelPositions.push({x,y:0,z});
        for(const offset of offsets){
          const i=this.car.numWheels();group.push(i);
          // Bounded longitudinal samples follow the lower tyre arc. The tyre is
          // still a compact contact approximation, never a physical wheel body.
          const radius=Math.sqrt(c.wheelRadius*c.wheelRadius-offset*offset);
          this.car.addWheel({x:x+offset,y:0,z},{x:0,y:-1,z:0},{x:0,y:0,z:1},c.suspension,radius);
          this.tuneWheel(i,offsets.length);this.car.setWheelSideFrictionStiffness(i,0);
        }
        this.wheelGroups.push(group);
      }
    }else{
      this.trackStates=['left','right'].map((side,i)=>({side,distance:0,rotation:0,speed:0,contacts:[],z:(i?1:-1)*c.track/2}));
    }
    this.time=0;this.steerAngle=0;this.acc={x:0,y:0,z:0};this.sensorVelocity={x:0,y:0,z:0};this.inputs={throttle:0,steering:0,left:0,right:0};this.driveDemand=c.drivetrain==='tracked'?[0,0]:[0];
  }
  applyMass(){
    const c=this.c;
    // Give collision shells no extra mass; keep total mass and CoG explicit.
    const inertia={x:c.mass*(c.height*c.height+c.width*c.width)/12,y:c.mass*(c.length*c.length+c.width*c.width)/12,z:c.mass*(c.length*c.length+c.height*c.height)/12};
    this.body.setAdditionalMassProperties(c.mass,c.centerOfGravity,inertia,{x:0,y:0,z:0,w:1},true);
    this.body.recomputeMassPropertiesFromColliders();
  }
  tuneWheel(i,n){const t=this.c.suspensionTuning;this.car.setWheelSuspensionStiffness(i,t.stiffness/n);this.car.setWheelSuspensionCompression(i,t.compression/n);this.car.setWheelSuspensionRelaxation(i,t.relaxation/n);this.car.setWheelMaxSuspensionTravel(i,t.travel);this.car.setWheelMaxSuspensionForce(i,t.maxForce/n);this.car.setWheelFrictionSlip(i,t.grip);}
  contactMaterial(at,collider){
    if(!at||!this.terrainCollider||collider?.handle!==this.terrainCollider.handle)return roadMaterials.ground;
    const water=this.waterAt(at.x,at.z);
    if(water&&water.depth!==0&&at.y<=water.surfaceY+.02){
      this.waterEncounter=water;
      if(water.depth===null||water.depth>this.waterSettings.maxCrossingDepth){
        this.waterFailure??={...water,state:'sinking',controlsDisabled:true,reason:water.depth===null?'Unknown water depth':'Deep water'};
      }
      return {...roadMaterials.water,offset:Math.max(0,water.surfaceY-at.y)};
    }
    return this.roadAt(at.x,at.z);
  }
  stepSinking(h){
    this.inputs={throttle:0,steering:0,left:0,right:0};this.driveDemand.fill(0);
    this.body.resetForces(true);this.body.resetTorques(true);this.body.setGravityScale(0,true);
    for(let i=0;i<this.body.numColliders();i++)this.body.collider(i).setSensor(true);
    const y=this.body.translation().y,target=Math.min(this.waterFailure.surfaceY-2,y);
    this.body.setAngvel({x:0,y:0,z:0},true);this.body.setLinvel({x:0,y:y>target?-Math.min(.4,(y-target)/h):0,z:0},true);
    this.world.step();
    if(this.body.translation().y<=target+1e-5){const p=this.body.translation();this.body.setTranslation({x:p.x,y:target,z:p.z},true);this.body.setLinvel({x:0,y:0,z:0},true);this.waterFailure.state='submerged';}
    for(const track of this.trackStates){track.contacts=[];track.speed=0;}
  }
  applyTuning(v){
    applyLiveFields(this.c,v);
    for(const group of this.wheelGroups)for(const i of group)this.tuneWheel(i,group.length);
    this.applyMass();
  }
  spawnHeight(){return (this.c.drivetrain==='tracked'?this.c.trackGeometry.radius:this.c.wheelRadius)+this.c.suspension;}
  reset(){this.waterFailure=null;this.waterEncounter=null;this.body.setGravityScale(1,true);for(let i=0;i<this.body.numColliders();i++)this.body.collider(i).setSensor(false);this.body.setTranslation({x:0,y:this.spawnHeight(),z:0},true);this.body.setRotation({x:0,y:0,z:0,w:1},true);this.body.setLinvel({x:0,y:0,z:0},true);this.body.setAngvel({x:0,y:0,z:0},true);this.body.resetForces(true);this.body.resetTorques(true);this.acc={x:0,y:0,z:0};this.sensorVelocity={x:0,y:0,z:0};this.time=0;this.steerAngle=0;this.driveDemand.fill(0);this.inputs={throttle:0,steering:0,left:0,right:0};for(const t of this.trackStates){t.distance=0;t.rotation=0;t.speed=0;t.contacts=[];}}
  step(dt,throttle,steering,tracks){
    if(!Number.isFinite(dt)||dt<=0||dt>.1)throw Error('invalid physics timestep');
    const start=this.body.translation(),oldVelocity=this.sensorVelocity;
    const c=this.c;throttle=demand(throttle);steering=demand(steering);
    const mixed=tracks?{left:demand(tracks.left),right:demand(tracks.right)}:trackDemands(throttle,steering);
    this.inputs={throttle,steering,...mixed};const sub=Math.ceil(dt/.005),h=dt/sub;
    for(let k=0;k<sub;k++){
      this.world.timestep=h;
      this.waterEncounter=null;
      if(!this.waterFailure){if(this.car)this.stepWheels(h,throttle,steering);else this.stepTracks(h,mixed);}
      if(this.waterFailure)this.stepSinking(h);else this.world.step();this.body.resetForces(true);this.body.resetTorques(true);this.time+=h;
    }
    const end=this.body.translation();
    // Pose differences keep GPS and IMU consistent despite split-impulse support.
    this.sensorVelocity={x:(end.x-start.x)/dt,y:(end.y-start.y)/dt,z:(end.z-start.z)/dt};
    this.acc={x:(this.sensorVelocity.x-oldVelocity.x)/dt,y:(this.sensorVelocity.y-oldVelocity.y)/dt,z:(this.sensorVelocity.z-oldVelocity.z)/dt};
  }
  stepWheels(h,throttle,steering){
    const c=this.c,t=c.suspensionTuning,q=this.body.rotation(),v=this.body.linvel(),f=rotate(q,{x:1,y:0,z:0});
    const speed=dot(v,f),drive=driveStep(this.driveDemand[0],throttle,speed,h,c.drive);this.driveDemand[0]=drive.value;
    const taper=Math.max(0,1-Math.max(0,speed*Math.sign(drive.value))/c.maxSpeed);
    const com=this.body.worldCom(),m=this.body.mass(),nc=this.wheelGroups.flat().filter(i=>this.car.wheelIsInContact(i)).length;
    const L=c.wheelbase,T=c.track,target=-steering*c.maxSteer,d=this.steerAngle=this.steerAngle+clamp(target-this.steerAngle,-c.steerRate*h,c.steerRate*h);
    const loads=this.wheelGroups.map(group=>group.map(i=>this.car.wheelIsInContact(i)?Math.max(0,this.car.wheelSuspensionForce(i)??0):0));
    const origin=this.body.translation(),reach=Math.hypot(c.length,c.width,c.height)+c.suspension+c.wheelRadius+t.travel;
    const materials=Array.from({length:this.car.numWheels()},(_,i)=>{
      const at=this.car.wheelContactPoint(i);
      return this.car.wheelIsInContact(i)&&(this.car.wheelSuspensionForce(i)??0)>0&&at&&Math.hypot(at.x-origin.x,at.y-origin.y,at.z-origin.z)<reach?this.contactMaterial(at,this.car.wheelGroundObject(i)):roadMaterials.ground;
    });
    if(this.waterFailure)return;
    const budget=loads.map((l,g)=>l.reduce((sum,load,j)=>sum+load*t.grip*materials[this.wheelGroups[g][j]].grip,0)),total=drive.value*c.engineForce*taper;
    const wheelForce=[...axleForces(total*c.torqueSplit,[budget[0],budget[1]],c.diff.front),...axleForces(total*(1-c.torqueSplit),[budget[2],budget[3]],c.diff.rear)];
    for(let g=0;g<4;g++){
      const inner=(d<0)===(g===1),ack=d===0?0:Math.sign(d)*Math.atan2(L,L/Math.tan(Math.abs(d))+(inner?-T/2:T/2)),angle=g<2?d+c.ackermannFactor*(ack-d):0;
      const rays=this.wheelGroups[g].filter(i=>this.car.wheelIsInContact(i)).length;
      for(const i of this.wheelGroups[g]){
      this.car.setWheelSteering(i,angle);
      // Rapier applies impulses only to contacting wheels and limits the tire
      // friction budget using suspension load; also cap requested motor force.
      const contact=this.car.wheelIsInContact(i),load=Math.max(0,this.car.wheelSuspensionForce(i)??0);
      const grip=t.grip*materials[i].grip;this.car.setWheelFrictionSlip(i,grip);
      const n=this.wheelGroups[g].length,requested=wheelForce[g]/(rays||1);
      // Side force acts at CoM height with plain mass (not contact-point mEff, which only rolls the chassis against stiff suspension and leaves the CoM creeping); lat includes this substep's gravity so slopes hold.
      let engine=0;
      if(contact){
        const at=this.car.wheelContactPoint(i),nrm=this.car.wheelContactNormal(i),st=this.car.wheelSteering(i)??0;
        const ax=rotate(q,{x:Math.sin(st),y:0,z:Math.cos(st)}),axle=normalize(add(ax,scale(nrm,-dot(ax,nrm)))),lift=add(at,scale(nrm,dot({x:com.x-at.x,y:com.y-at.y,z:com.z-at.z},nrm)));
        const lat=dot(this.body.velocityAtPoint(at),axle)-9.80665*h*axle.y;
        let F=-lat*t.sideGrip*m/(nc*h);engine=requested;
        const avail=load*grip,mag=Math.hypot(engine,F);
        if(mag>avail){const k=avail/mag;engine*=k;F*=k;}
        this.body.addForceAtPoint(scale(axle,F),lift,true);
      }
      this.car.setWheelEngineForce(i,engine);
      this.car.setWheelBrake(i,c.brakeImpulse*drive.brake*(h/.005)/n);
      }
    }
    // Rolling loss acts through contacts, never as an airborne body drag force.
    const contacts=Array.from({length:this.car.numWheels()},(_,i)=>i).filter(i=>this.car.wheelIsInContact(i));
    if(contacts.length)for(const i of contacts){const resistance=Math.min(c.rollingResistance*materials[i].rolling,Math.abs(speed)*c.mass/h)/contacts.length,at=this.car.wheelContactPoint(i);if(at)this.body.addForceAtPoint(scale(f,-Math.sign(speed)*resistance),at,true);}
    this.car.updateVehicle(h,R.QueryFilterFlags.EXCLUDE_DYNAMIC);
  }
  stepTracks(h,inputs){
    const c=this.c,t=c.suspensionTuning,g=c.trackGeometry,q=this.body.rotation(),origin=this.body.translation();
    const up=rotate(q,{x:0,y:1,z:0}),down=scale(up,-1),forward=rotate(q,{x:1,y:0,z:0}),N=g.samples*2;
    for(let side=0;side<2;side++){
      const track=this.trackStates[side],localSpeed=dot(this.body.velocityAtPoint(add(origin,rotate(q,{x:0,y:0,z:track.z}))),forward);
      const drive=driveStep(this.driveDemand[side],inputs[track.side],localSpeed,h,c.drive);this.driveDemand[side]=drive.value;track.contacts=[];
      let measuredSpeed=0,hits=0;
      for(let i=0;i<g.samples;i++){
        const x=(i/(g.samples-1)-.5)*(g.length-2*g.radius),from=add(origin,rotate(q,{x,y:0,z:track.z}));
        const ray=new R.Ray(from,down),rest=c.suspension+g.radius;
        const hit=this.world.castRayAndGetNormal(ray,rest+t.travel,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC,undefined,undefined,this.body);
        if(!hit){track.contacts.push({x,y:-rest,z:track.z,contact:false,normalForce:0});continue;}
        const at=ray.pointAt(hit.timeOfImpact),normal=hit.normal,velocity=this.body.velocityAtPoint(at);
        const compression=rest-hit.timeOfImpact;
        // No attractive springs, including while the footprint hangs over an edge.
        const damping=dot(velocity,normal)<0?t.compression:t.relaxation;
        const load=clamp((t.stiffness*compression-damping*dot(velocity,normal))*c.mass/N,0,t.maxForce);
        const material=load>0?this.contactMaterial(at,hit.collider):roadMaterials.ground;
        if(this.waterFailure)return;
        const tangent=normalize(add(forward,scale(normal,-dot(forward,normal)))),lateral=cross(tangent,normal);
        const longitudinalSpeed=dot(velocity,tangent),lateralSpeed=dot(velocity,lateral);
        const engine=drive.value*c.engineForce/(2*g.samples)*Math.max(0,1-Math.max(0,longitudinalSpeed*Math.sign(drive.value))/c.maxSpeed);
        // Legacy brakeImpulse is an impulse at the original 5 ms substep.
        // Convert to force so actuator packet rate cannot change deceleration.
        const passive=Math.min(c.rollingResistance*material.rolling/N+c.brakeImpulse*drive.brake/(N*.005),Math.abs(longitudinalSpeed)*c.mass/(N*h));
        let longitudinal=engine-Math.sign(longitudinalSpeed)*passive;
        let sideways=-lateralSpeed*Math.min(c.mass*g.lateralResistance/N,c.mass/(N*h));
        const available=load*t.grip*material.grip,magnitude=Math.hypot(longitudinal,sideways),ratio=magnitude>available?available/(magnitude||1):1;
        longitudinal*=ratio;sideways*=ratio;
        this.body.addForceAtPoint(add(scale(normal,load),add(scale(tangent,longitudinal),scale(lateral,sideways))),at,true);
        track.contacts.push({x,y:-hit.timeOfImpact,z:track.z,contact:true,normalForce:load,longitudinalForce:longitudinal,lateralForce:sideways,ground:this.terrainCollider?.handle===hit.collider.handle,position:at,surface:material.id,roadOffset:material.offset??(material.road?.035:0)});
        measuredSpeed+=longitudinalSpeed;hits++;
      }
      track.speed=hits?measuredSpeed/hits:localSpeed;track.distance+=track.speed*h;track.rotation=track.distance/g.radius;
    }
  }
  frozenIMU(){const s=sensors(this.body.rotation(),{x:0,y:0,z:0},{x:0,y:0,z:0});return {gyro:s.gyro,accel_body:s.accel_body};}
  state(){
    const position=this.body.translation(),rotation=this.body.rotation(),velocity=this.body.linvel();
    const s=sensors(rotation,this.body.angvel(),this.acc);const f=rotate(rotation,{x:1,y:0,z:0});
    const wheels=this.wheelPositions.map((p,g)=>{const group=this.wheelGroups[g],i=group[Math.floor(group.length/2)];return {...p,y:-(this.car.wheelSuspensionLength(i)??this.c.suspension),rotation:this.car.wheelRotation(i)??0,steering:this.car.wheelSteering(i)??0,contact:group.some(j=>this.car.wheelIsInContact(j)),normalForce:group.reduce((sum,j)=>sum+(this.car.wheelSuspensionForce(j)??0),0)};});
    const groundContacts=[];
    if(!this.waterFailure&&this.car&&this.terrainCollider)for(const group of this.wheelGroups){
      const i=[group[Math.floor(group.length/2)],...group].find(j=>this.car.wheelIsInContact(j)&&(this.car.wheelSuspensionForce(j)??0)>0&&this.car.wheelGroundObject(j)?.handle===this.terrainCollider.handle);
      if(i!==undefined){const at=this.car.wheelContactPoint(i);if(at){const water=this.waterAt(at.x,at.z),wet=water&&water.depth!==0&&at.y<=water.surfaceY+.02,material=wet?roadMaterials.water:this.roadAt(at.x,at.z);groundContacts.push({position:at,surface:material.id,offset:wet?Math.max(0,water.surfaceY-at.y):(material.road?.035:0)});}}
    }
    for(const track of this.trackStates)for(const contact of track.contacts)if(contact.ground&&contact.normalForce>0)groundContacts.push({position:contact.position,surface:contact.surface,offset:contact.roadOffset});
    return {water:this.waterFailure??{state:this.waterEncounter?'shallow':'dry',controlsDisabled:false,...(this.waterEncounter?{depth:this.waterEncounter.depth,surfaceY:this.waterEncounter.surfaceY,seasonal:this.waterEncounter.seasonal}:{})},position,rotation,velocity,speed:velocity.x*f.x+velocity.y*f.y+velocity.z*f.z,heading:(Math.atan2(f.z,f.x)*180/Math.PI+360)%360,inputs:this.inputs,driveDemand:[...this.driveDemand],wheels,groundContacts,tracks:this.trackStates.map(t=>({...t,contacts:t.contacts.map(c=>({...c}))})),sensor:{timestamp:this.time,imu:{gyro:s.gyro,accel_body:s.accel_body},position:ned({x:position.x,y:position.y-this.spawnHeight(),z:position.z}),velocity:ned(this.sensorVelocity),quaternion:s.quaternion}};
  }
  free(){this.world.free();}
}

const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const scale=(a,n)=>({x:a.x*n,y:a.y*n,z:a.z*n});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const normalize=a=>scale(a,1/(Math.hypot(a.x,a.y,a.z)||1));
