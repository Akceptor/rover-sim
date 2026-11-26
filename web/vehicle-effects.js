import * as T from '/three.js';

/**
 * Lightweight tire-track + dust-particle system.
 * Recycled ring buffers; ground placement is independent of chassis height.
 */
export function createVehicleEffects(parent,{groundHeight=()=>0,track=.4}={}){
 // --- Tire tracks (recycled InstancedMesh ring buffer) ---
 const TRACK_MAX=80;
 const trackGeom=new T.PlaneGeometry(.12,.18);
 const trackCanvas=document.createElement('canvas');trackCanvas.width=trackCanvas.height=32;
 const tCtx=trackCanvas.getContext('2d');
 const tg=tCtx.createRadialGradient(16,16,2,16,16,14);
 tg.addColorStop(0,'rgba(60,55,45,0.35)');tg.addColorStop(1,'rgba(60,55,45,0)');
 tCtx.fillStyle=tg;tCtx.fillRect(0,0,32,32);
 const trackMap=new T.CanvasTexture(trackCanvas);
 const trackMat=new T.MeshBasicMaterial({map:trackMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const tracks=new T.InstancedMesh(trackGeom,trackMat,TRACK_MAX);
 tracks.name='tire-tracks';tracks.frustumCulled=false;tracks.renderOrder=2;
 const hidden=new T.Matrix4().makeScale(0,0,0);
 for(let i=0;i<TRACK_MAX;i++)tracks.setMatrixAt(i,hidden);
 tracks.instanceMatrix.needsUpdate=true;
 parent.add(tracks);

 let trackHead=0,trackDist=0,initialized=false;
 const lastTrackPos=new T.Vector3();
 const _mat=new T.Matrix4(),_pos=new T.Vector3(),_forward=new T.Vector3(),_side=new T.Vector3(),_normal=new T.Vector3();
 const height=(x,z)=>{try{return groundHeight(x,z);}catch{return null;}};

 // --- Dust particles (Points pool) ---
 const DUST_MAX=50;
 const dustPositions=new Float32Array(DUST_MAX*3);
 const dustAlphas=new Float32Array(DUST_MAX);
 const dustVelocities=new Float32Array(DUST_MAX*3);
 for(let i=0;i<DUST_MAX*3;i++)dustPositions[i]=-999;
 const dustGeom=new T.BufferGeometry();
 dustGeom.setAttribute('position',new T.BufferAttribute(dustPositions,3));
 const dustMat=new T.PointsMaterial({color:0xc0b89a,size:.12,transparent:true,opacity:.4,depthWrite:false});
 const dust=new T.Points(dustGeom,dustMat);
 dust.name='wheel-dust';dust.frustumCulled=false;dust.visible=false;
 parent.add(dust);

 let dustHead=0,dustEmission=0;

 return {
  tracks,dust,
  update(roverPosition,roverQuaternion,speed,dt,hasTerrain){
   dt=Math.max(0,Math.min(dt,.1));
   speed=Math.abs(speed);
   const moved=initialized?lastTrackPos.distanceTo(roverPosition):0;
   initialized=true;lastTrackPos.copy(roverPosition);
   const moving=moved>1e-5&&moved<3;
   if(moved>=3){
    for(let i=0;i<TRACK_MAX;i++)tracks.setMatrixAt(i,hidden);
    tracks.instanceMatrix.needsUpdate=true;trackDist=0;
    dustAlphas.fill(0);dustPositions.fill(-999);dustGeom.attributes.position.needsUpdate=true;
   }
   if(!hasTerrain)trackDist=0;else if(moving)trackDist+=moved;
   if(speed>.15&&trackDist>.25&&hasTerrain){
    trackDist=0;
    _forward.set(1,0,0).applyQuaternion(roverQuaternion);_forward.y=0;_forward.normalize();
    for(const side of [-1,1]){
     _pos.copy(roverPosition);_pos.x-=_forward.z*side*track/2;_pos.z+=_forward.x*side*track/2;
     const y=height(_pos.x,_pos.z);
     if(!Number.isFinite(y))continue;
     const dx=height(_pos.x+.05,_pos.z),dz=height(_pos.x,_pos.z+.05);
     if(!Number.isFinite(dx)||!Number.isFinite(dz))continue;
     _normal.set(-(dx-y)/.05,1,-(dz-y)/.05).normalize();
     _side.crossVectors(_normal,_forward).normalize();
     _forward.crossVectors(_side,_normal).normalize();
     _mat.makeBasis(_forward,_side,_normal);_pos.y=y+.005;_mat.setPosition(_pos);
     tracks.setMatrixAt(trackHead,_mat);trackHead=(trackHead+1)%TRACK_MAX;
    }
    tracks.instanceMatrix.needsUpdate=true;
   }

   const dustActive=speed>.4&&moving&&hasTerrain;
   if(dustActive){
    dustEmission+=dt*Math.min(90,speed*30);
    const count=Math.floor(dustEmission);dustEmission-=count;
    for(let i=0;i<count;i++){
     const idx=dustHead*3;
     dustPositions[idx]=roverPosition.x+(Math.random()-.5)*.4;
     const y=height(dustPositions[idx],roverPosition.z);
     dustPositions[idx+1]=(Number.isFinite(y)?y:roverPosition.y)+.02+Math.random()*.08;
     dustPositions[idx+2]=roverPosition.z+(Math.random()-.5)*.4;
     dustVelocities[idx]=(Math.random()-.5)*.3;
     dustVelocities[idx+1]=.3+Math.random()*.4;
     dustVelocities[idx+2]=(Math.random()-.5)*.3;
     dustAlphas[dustHead]=1;
     dustHead=(dustHead+1)%DUST_MAX;
    }
   }
   // Animate all dust particles.
   let anyVisible=false;
   for(let i=0;i<DUST_MAX;i++){
    if(dustAlphas[i]<=0)continue;
    anyVisible=true;
    const idx=i*3;
    dustPositions[idx]+=dustVelocities[idx]*dt;
    dustPositions[idx+1]+=dustVelocities[idx+1]*dt;
    dustPositions[idx+2]+=dustVelocities[idx+2]*dt;
    dustVelocities[idx+1]-=.5*dt; // gravity
    dustAlphas[i]-=dt*1.2;
    if(dustAlphas[i]<=0)dustPositions[idx+1]=-999;
   }
   if(anyVisible||dustActive){
    dustGeom.attributes.position.needsUpdate=true;
    if(dustActive)dustMat.opacity=.25+Math.min(speed*.05,.35);
   }
   dust.visible=anyVisible;
  },
  dispose(){
   tracks.dispose();trackGeom.dispose();trackMat.dispose();trackMap.dispose();
   dustGeom.dispose();dustMat.dispose();
   parent.remove(tracks);parent.remove(dust);
  }
 };
}
