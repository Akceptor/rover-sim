import R from '@dimforge/rapier3d-compat';
import {playground} from './world.js';
import {validateTerrain,terrainMesh,terrainObjects} from './terrain.js';
import {ned,rotate,sensors} from './frames.js';
let init;
export class Physics {
  static async create(config,obstacles=true,terrain=null){if(terrain)validateTerrain(terrain);init??=R.init();await init;return new Physics(config,obstacles,terrain);}
  constructor(c,obstacles,terrain) {
    this.c=c;this.world=new R.World({x:0,y:-9.80665,z:0});
    if(terrain){const {vertices,indices}=terrainMesh(terrain);this.world.createCollider(R.ColliderDesc.trimesh(vertices,indices).setFriction(.9));}
    for(const o of (terrain?(obstacles?terrainObjects(terrain):[]):(obstacles?playground:playground.slice(0,1)))){const [x,y,z]=o.position;const a=o.angle??0;const body=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x,y,z).setRotation({x:0,y:0,z:Math.sin(a/2),w:Math.cos(a/2)}));const [sx,sy,sz]=o.size;this.world.createCollider((o.kind==='cone'?R.ColliderDesc.cone(sy/2,sx/2):R.ColliderDesc.cuboid(sx/2,sy/2,sz/2)).setFriction(.9),body);}
    this.body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,this.spawnHeight(),0).setCanSleep(false).setCcdEnabled(true).setLinearDamping(.08).setAngularDamping(.6));
    this.world.createCollider(R.ColliderDesc.cuboid(c.length/2,c.height/2,c.width/2).setMass(c.mass).setFriction(.5),this.body);
    this.car=this.world.createVehicleController(this.body);this.car.indexUpAxis=1;this.car.setIndexForwardAxis=0;
    this.wheelPositions=[];
    for(const x of [c.wheelbase/2,-c.wheelbase/2])for(const z of [-c.track/2,c.track/2]){
      this.wheelPositions.push({x,y:0,z});this.car.addWheel({x,y:0,z},{x:0,y:-1,z:0},{x:0,y:0,z:1},c.suspension,c.wheelRadius);
      const i=this.wheelPositions.length-1;this.car.setWheelSuspensionStiffness(i,80);this.car.setWheelSuspensionCompression(i,4.4);this.car.setWheelSuspensionRelaxation(i,4.4);this.car.setWheelMaxSuspensionForce(i,100);this.car.setWheelFrictionSlip(i,2);this.car.setWheelSideFrictionStiffness(i,1);
    }
    this.time=0;this.acc={x:0,y:0,z:0};this.sensorVelocity={x:0,y:0,z:0};this.inputs={throttle:0,steering:0};
  }
  spawnHeight(){return this.c.wheelRadius+this.c.suspension;}
  reset(){this.body.setTranslation({x:0,y:this.spawnHeight(),z:0},true);this.body.setRotation({x:0,y:0,z:0,w:1},true);this.body.setLinvel({x:0,y:0,z:0},true);this.body.setAngvel({x:0,y:0,z:0},true);this.body.resetForces(true);this.body.resetTorques(true);this.acc={x:0,y:0,z:0};this.sensorVelocity={x:0,y:0,z:0};this.time=0;}
  step(dt,throttle,steering){
    const start=this.body.translation(),oldVelocity=this.sensorVelocity;
    const c=this.c;this.inputs={throttle,steering};const sub=Math.ceil(dt/.005),h=dt/sub;
    for(let k=0;k<sub;k++){
      this.world.timestep=h;const q=this.body.rotation(),v=this.body.linvel();const f=rotate(q,{x:1,y:0,z:0});const speed=v.x*f.x+v.y*f.y+v.z*f.z;
      for(let i=0;i<4;i++){
        // Wheel axle +Z yields traction +X; positive right steering rotates around -Y.
        this.car.setWheelSteering(i,i<2?-steering*c.maxSteer:0);
        const force=throttle*c.engineForce*Math.max(0,1-Math.max(0,speed*Math.sign(throttle))/c.maxSpeed);
        this.car.setWheelEngineForce(i,force/4);
        this.car.setWheelBrake(i,Math.abs(throttle)<.02?c.brakeImpulse:Math.sign(throttle)!==Math.sign(speed)&&Math.abs(speed)>.15?c.brakeImpulse:0);
      }
      const resistance=Math.min(c.rollingResistance,Math.abs(speed)*c.mass/h);
      this.body.addForce({x:-f.x*Math.sign(speed)*resistance,y:-f.y*Math.sign(speed)*resistance,z:-f.z*Math.sign(speed)*resistance},true);
      this.car.updateVehicle(h,R.QueryFilterFlags.EXCLUDE_DYNAMIC);
      this.world.step();this.body.resetForces(true);
      this.time+=h;
    }
    const end=this.body.translation();
    // Rapier's split impulse integration leaves a small support velocity at rest.
    // Differentiate actual poses for mutually consistent GPS and IMU observations.
    this.sensorVelocity={x:(end.x-start.x)/dt,y:(end.y-start.y)/dt,z:(end.z-start.z)/dt};
    this.acc={x:(this.sensorVelocity.x-oldVelocity.x)/dt,y:(this.sensorVelocity.y-oldVelocity.y)/dt,z:(this.sensorVelocity.z-oldVelocity.z)/dt};
  }
  frozenIMU(){const s=sensors(this.body.rotation(),{x:0,y:0,z:0},{x:0,y:0,z:0});return {gyro:s.gyro,accel_body:s.accel_body};}
  state(){
    const position=this.body.translation(),rotation=this.body.rotation(),velocity=this.body.linvel();
    const s=sensors(rotation,this.body.angvel(),this.acc);const f=rotate(rotation,{x:1,y:0,z:0});
    return {position,rotation,velocity,speed:velocity.x*f.x+velocity.y*f.y+velocity.z*f.z,heading:(Math.atan2(f.z,f.x)*180/Math.PI+360)%360,inputs:this.inputs,wheels:this.wheelPositions.map((p,i)=>({...p,y:-(this.car.wheelSuspensionLength(i)??this.c.suspension),rotation:this.car.wheelRotation(i)??0,contact:this.car.wheelIsInContact(i)})),sensor:{timestamp:this.time,imu:{gyro:s.gyro,accel_body:s.accel_body},position:ned({x:position.x,y:position.y-this.spawnHeight(),z:position.z}),velocity:ned(this.sensorVelocity),quaternion:s.quaternion}};
  }
  free(){this.world.free();}
}
