import * as T from 'three';

// Twin-track surveyor — armored scout platform. Metres, +X forward, +Y up, +Z right.
// 'body' group holds ONLY the collision envelope; armor, turret and masts live outside it.
export function createTrackedCrawler(c){
 const model=new T.Group();model.name=c.id;
 const materials={
  paint:new T.MeshStandardMaterial({color:0x5f6b5a,roughness:.55,metalness:.35}),
  dark:new T.MeshStandardMaterial({color:0x39413a,roughness:.7,metalness:.3}),
  armor:new T.MeshStandardMaterial({color:0x46524a,roughness:.5,metalness:.45}),
  plastic:new T.MeshStandardMaterial({color:0x22261f,roughness:.85}),
  rubber:new T.MeshStandardMaterial({color:0x1e211e,roughness:.97}),
  steel:new T.MeshStandardMaterial({color:0x8f9a93,roughness:.3,metalness:.7}),
  glass:new T.MeshStandardMaterial({color:0x6d8288,roughness:.14,metalness:.45,transparent:true,opacity:.7,side:T.DoubleSide}),
  lamp:new T.MeshStandardMaterial({color:0xe8ecd8,emissive:0xd6dfc0,emissiveIntensity:.4,roughness:.25}),
  amber:new T.MeshStandardMaterial({color:0xe09a1f,emissive:0xc97a10,emissiveIntensity:.35,roughness:.4}),
  red:new T.MeshStandardMaterial({color:0xa52c1c,emissive:0x7a1608,emissiveIntensity:.3,roughness:.4}),
  canvas:new T.MeshStandardMaterial({color:0x4a4636,roughness:.95}),
  accent:new T.MeshStandardMaterial({color:0xd8b13a,roughness:.5,metalness:.3}),
 };
 const L=c.length,W=c.width,H=c.height,wb=c.wheelbase;
 function mesh(geometry,material,parent=model,name=''){
  const o=new T.Mesh(geometry,material);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 }
 function box(size,at,material=materials.paint,parent=model,name=''){
  const o=mesh(new T.BoxGeometry(...size),material,parent,name);o.position.set(...at);return o;
 }
 function cyl(radius,length,at,material,parent=model,axis='z',name=''){
  const o=mesh(new T.CylinderGeometry(radius,radius,length,24),material,parent,name);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;o.position.set(...at);return o;
 }
 // ---- body: collision envelope EXACTLY ----
 const body=new T.Group();body.name='body';model.add(body);
 for(const b of c.collisionBoxes??[{size:[L,H,W],position:[0,0,0]}])box(b.size,b.position,materials.armor,body);

 // ---- chassis keel + belly ----
 box([L*.82,.045,.16],[0,-.045,0],materials.plastic,model,'keel');
 box([L*.9,.05,W*.55],[0,-.02,0],materials.dark,model,'belly');
 box([.3,.03,W*.9],[.1,-.015,0],materials.dark,model,'front-deck');
 box([.18,.03,W*.9],[-.18,-.015,0],materials.dark,model,'rear-deck');

 // ---- armored hull over body (above tracking band, angled slopes) ----
 const hullBase=-.02,hullTop=.075;
 for(const side of [-1,1]){
  const hull=box([L*.86,.075,.028],[0,hullBase+.0375,side*(W/2-.014)],materials.armor,model,'hull-side');
  // angular armor plates: two sloped facets per side
  const slope=mesh(new T.BoxGeometry(L*.8,.07,.015),materials.dark,model,'hull-slope');
  slope.position.set(0,hullTop-.01,side*(W/2-.02));slope.rotation.x=side*-.35;
  // side panels: vent ducts
  for(let i=0;i<4;i++)box([.05,.03,.012],[L*.3-i*.12,hullBase+.02,side*(W/2+.004)],materials.plastic,model,'duct');
 }
 box([L*.86,.06,W*.52],[0,hullTop+.02,0],materials.paint,model,'hull-bed');
 box([L*.86,.05,W*.52],[-.05,hullTop+.045,0],materials.dark,model,'hull-bed-upper');

 // ---- angular cabin with glazed windshield + AM overhangs ----
 const cabFront=.15,cabRear=-.21;
 for(const side of [-1,1]){
  // side wall panels (glass top)
  box([cabFront-cabRear,.07,.02],[(cabFront+cabRear)/2,.1,side*.125],materials.armor,model,'cabin-wall');
  // glass band
  const glass=box([cabFront-cabRear-.03,.045,.02],[(cabFront+cabRear)/2,.17,side*.125],materials.glass,model,'cabin-glass-side');glass.castShadow=false;
 }
 // turret collar atop cabin
 box([.16,.03,.16],[.02,.2,0],materials.dark,model,'turret-collar');
 // windshield slope
 {const g=new T.BufferGeometry();const y0=.135,top=.2;
  g.setAttribute('position',new T.Float32BufferAttribute([[cabFront,y0,-.115],[cabFront,y0,.115],[cabFront-.04,top,.115],[cabFront-.04,top,-.115]].flatMap(p=>p),3));
  g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();mesh(g,materials.glass,model,'windshield');}
 // rear hatch
 box([.05,.06,.2],[cabRear-.03,.12,0],materials.armor,model,'rear-hatch');

 // ---- turret + sensor mast ----
 const turret=new T.Group();turret.position.set(.02,.23,0);model.add(turret);
 box([.13,.055,.13],[0,0,0],materials.paint,turret,'turret-base');
 const turretHead=mesh(new T.CylinderGeometry(.045,.055,.09,16),materials.paint,turret,'turret-head');turretHead.position.set(0,.07,0);
 // sensor eye (front)
 cyl(.02,.028,[.052,.07,0],materials.plastic,turret,'x','sensor-eye');
 cyl(.014,.012,[.069,.07,0],materials.glass,turret,'x','sensor-lens');
 // turret hatch ring
 const hatch=mesh(new T.TorusGeometry(.032,.008,8,20),materials.steel,turret,'hatch-ring');hatch.position.set(0,.12,0);hatch.rotation.x=Math.PI/2;
 // mast + antenna
 // Seat the mast and beacon on the turret base, with overlap at each joint.
 cyl(.008,.22,[-.045,.13,.045],materials.steel,turret,'y','mast');
 cyl(.014,.03,[-.045,.04,.045],materials.dark,turret,'y','mast-joint');
 cyl(.004,.09,[-.045,.28,.045],materials.plastic,turret,'y','antenna');
 box([.014,.02,.014],[-.045,.33,.045],materials.accent,turret,'antenna-tip');
 // beacon
 cyl(.018,.025,[-.045,.038,-.045],materials.red,turret,'y','beacon');

 // ---- exhaust + front lights ----
 const exhaustX=L*.42;
 cyl(.016,.1,[exhaustX,.05,-.06],materials.steel,model,'y','exhaust');
 cyl(.02,.04,[exhaustX+.018,.09,-.06],materials.plastic,model,'x','exhaust-tip');
 for(const side of [-1,1]){
  cyl(.024,.02,[L/2+.008,.06,side*.1],materials.steel,model,'x','lamp-bezel');
  cyl(.02,.024,[L/2+.02,.06,side*.1],materials.lamp,model,'x','lamp-lens');
 }
 box([.04,.05,.3],[L/2+.012,.0,0],materials.plastic,model,'front-bumper');
 box([.03,.04,.3],[-L/2-.008,-.01,0],materials.plastic,model,'rear-bumper');
 for(const side of [-1,1]){
  box([.014,.04,.03],[-L/2-.02,.015,side*.1],materials.red,model,'taillight');
  box([.014,.018,.03],[-L/2-.02,-.005,side*.1],materials.amber,model,'rear-marker');
 }

 // ---- container / canister along side track edge ----
 box([.34,.05,.03],[-.02,.02,-.152],materials.canvas,model,'canister-0');
 box([.34,.05,.03],[-.02,.02,.152],materials.canvas,model,'canister-1');

 // ---- tracks (stadium math kept identical to the existing tracked profile) ----
 const wheels=[];const g=c.trackGeometry,r=g.radius,halfStraight=g.length/2-r,perimeter=4*halfStraight+2*Math.PI*r;
 const blockLength=perimeter/48*.84,transform=new T.Object3D();
 function point(distance){let d=((distance%perimeter)+perimeter)%perimeter;if(d<2*halfStraight)return [halfStraight-d,r,0];d-=2*halfStraight;if(d<Math.PI*r){const a=Math.PI/2+d/r;return [-halfStraight+Math.cos(a)*r,Math.sin(a)*r,a-Math.PI/2];}d-=Math.PI*r;if(d<2*halfStraight)return [-halfStraight+d,-r,Math.PI];d-=2*halfStraight;const a=-Math.PI/2+d/r;return [halfStraight+Math.cos(a)*r,Math.sin(a)*r,a-Math.PI/2];}
 const tracks=[];
 for(const [side,z] of [['left',-c.track/2],['right',c.track/2]]){
  const carrier=new T.Group();carrier.position.set(0,-c.suspension,z);carrier.name=`track-${side}`;model.add(carrier);
  // idler, drive and 2 mid rollers (detailed)
  const rollerX=[-halfStraight,-halfStraight/3,halfStraight/3,halfStraight];
  for(const x of rollerX){
   const group=new T.Group();group.position.x=x;carrier.add(group);
   cyl(r*.78,g.width*.82,[0,0,0],materials.rubber,group);
   cyl(r*.45,g.width*.9,[0,0,0],materials.steel,group);
  }
  // track armor plate shading
  box([g.length*.9,.018,g.width*.9],[0,r+.02,0],materials.dark,carrier,'shield');
  const belt=new T.InstancedMesh(new T.BoxGeometry(blockLength,r*.11,g.width),materials.rubber,48);belt.name=`tread-${side}`;belt.castShadow=true;belt.receiveShadow=true;carrier.add(belt);
  const track={side,carrier,mesh:belt,distance:0,animate(distance){this.distance=distance;for(let i=0;i<48;i++){const [x,y,a]=point(i*perimeter/48-distance);transform.position.set(x,y,0);transform.rotation.set(0,0,a);transform.updateMatrix();belt.setMatrixAt(i,transform.matrix);}belt.instanceMatrix.needsUpdate=true;belt.computeBoundingSphere();}};track.animate(0);tracks.push(track);
 }
 return {model,wheels,tracks,dispose(){const gs=new Set(),ms=new Set();model.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);if(o.isInstancedMesh)o.dispose();});for(const g of gs)g.dispose();for(const m of ms)m.dispose();}};
}
