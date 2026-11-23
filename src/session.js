import {FrameClock,encodeSensors,pwm} from './protocol.js';
export class Session {
  constructor(physics,config){this.physics=physics;this.config=config;this.clock=new FrameClock();this.peer=null;this.last=-Infinity;this.cached=null;this.running=true;this.time=0;this.inputs={steering:0,throttle:0};this.stats={packets:0,duplicates:0,skipped:0,restarts:0,old:0,gaps:0};}
  stageVehicle(config,physics,onActivate){
    if(this.pendingVehicle)throw Error('A vehicle change is already pending');
    this.pendingVehicle={config,physics,onActivate};this.running=false;
  }
  receive(p,peer,now){
    const restarts=this.stats.restarts;
    const expired=now-this.last>this.config.timeoutMs;
    if(this.peer!==null&&peer!==this.peer&&!expired)return null;
    // A pending profile never consumes old-session actuators. A silent interval plus
    // a changed endpoint or regressed counter establishes a fresh SITL process.
    if(this.pendingVehicle&&expired&&(peer!==this.peer||this.clock.count!==null&&p.count<this.clock.count&&((p.count-this.clock.count)>>>0)>0x80000000)){
      const pending=this.pendingVehicle;this.pendingVehicle=null;
      this.config=pending.config;this.physics=pending.physics;this.inputs={steering:0,throttle:0,left:0,right:0};
      this.cached=null;pending.onActivate?.();
    }
    if(this.peer!==peer){this.peer=peer;this.clock=new FrameClock();this.physics.reset();this.time=0;this.stats.restarts++;}
    // Regression after timeout is a reboot, even if first observed count is not zero.
    if(expired&&this.clock.count!==null&&p.count<this.clock.count&&((p.count-this.clock.count)>>>0)>0x80000000){this.clock=new FrameClock();this.physics.reset();this.time=0;this.stats.restarts++;}
    const f=this.clock.accept(p.count,p.rate);this.stats.packets++;
    if(f.kind==='duplicate'){this.stats.duplicates++;this.last=now;return {bytes:this.cached,dt:0,event:'duplicate'};}
    if(f.kind==='old'){this.stats.old++;return null;}
    if(f.kind==='gap'){this.stats.gaps++;this.clock.count=p.count;f.steps=1;f.dt=1/p.rate;}
    // Frame zero while a peer is live is ambiguous with UDP reordering. Require timeout.
    if(f.kind==='restart'&&!expired){this.clock.count=this.previousCount;this.stats.old++;return null;}
    if(f.kind==='restart'){this.physics.reset();this.time=0;this.stats.restarts++;}
    if(this.stats.restarts!==restarts&&this.pendingHome!==undefined){this.home=this.pendingHome;this.pendingHome=undefined;}
    this.previousCount=p.count;this.last=now;this.rate=p.rate;this.raw=p.pwm;
    this.stats.skipped+=f.steps-1;
    const next={steering:pwm(p.pwm[this.config.steering.channel-1],this.config.steering),throttle:pwm(p.pwm[this.config.throttle.channel-1],this.config.throttle)};
    if(this.config.vehicle.drivetrain==='tracked'){
      next.left=pwm(p.pwm[this.config.leftTrack.channel-1],this.config.leftTrack);
      next.right=pwm(p.pwm[this.config.rightTrack.channel-1],this.config.rightTrack);
    }
    for(let i=0;i<f.steps;i++){const input=i===f.steps-1?next:this.inputs;if(this.running)this.physics.step(f.dt,input.throttle,input.steering,this.config.vehicle.drivetrain==='tracked'?{left:input.left,right:input.right}:undefined);this.time+=f.dt;}
    this.inputs=next;const sensor=this.physics.state().sensor;
    if(!this.running){sensor.velocity=[0,0,0];sensor.imu.gyro=[0,0,0]; // hold pose, but keep estimator time alive
      // Specific force for frozen pose is computed from attitude, not last collision.
      const {rotation}=this.physics.state();if(rotation){sensor.imu=this.physics.frozenIMU();}}
    if(this.home){
      const [north,east,down]=sensor.position,metresPerDegree=111318.845;
      sensor.latitude=this.home.lat+north/metresPerDegree;
      const longitude=this.home.lon+east/(metresPerDegree*Math.cos((this.home.lat+sensor.latitude)*Math.PI/360));
      sensor.longitude=longitude>=-180&&longitude<=180?longitude:((longitude+180)%360+360)%360-180;
      sensor.altitude=this.home.alt-down;
    }
    sensor.timestamp=this.time;this.cached=encodeSensors(sensor);
    return {bytes:this.cached,dt:f.steps*f.dt,event:f.kind};
  }
}
