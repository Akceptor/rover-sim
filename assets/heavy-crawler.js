import * as T from 'three';

// Expedition heavy 4WD — rugged off-road build. Metres, +X forward, +Y up, +Z right.
// 'body' group holds ONLY the collision envelope (tests diff it); decorations live outside it.
export function createHeavyCrawler(c){
 const model=new T.Group();model.name=c.id;
 const materials={
  paint:new T.MeshStandardMaterial({color:0x4a5240,roughness:.62,metalness:.25}),
  paintDark:new T.MeshStandardMaterial({color:0x353c2e,roughness:.7,metalness:.2}),
  plastic:new T.MeshStandardMaterial({color:0x23251f,roughness:.85}),
  rubber:new T.MeshStandardMaterial({color:0x1e211e,roughness:.97}),
  steel:new T.MeshStandardMaterial({color:0x909a90,roughness:.35,metalness:.75}),
  glass:new T.MeshStandardMaterial({color:0x6d8288,roughness:.14,metalness:.45,transparent:true,opacity:.7,side:T.DoubleSide}),
  lamp:new T.MeshStandardMaterial({color:0xe8ecd8,emissive:0xd6dfc0,emissiveIntensity:.35,roughness:.25}),
  amber:new T.MeshStandardMaterial({color:0xe09a1f,emissive:0xc97a10,emissiveIntensity:.3,roughness:.4}),
  red:new T.MeshStandardMaterial({color:0xa52c1c,emissive:0x7a1608,emissiveIntensity:.25,roughness:.4}),
  canvas:new T.MeshStandardMaterial({color:0x5c5640,roughness:.95}),
  skid:new T.MeshStandardMaterial({color:0x2c2e26,roughness:.6,metalness:.5}),
 };
 const L=c.length,W=c.width,H=c.height,r=c.wheelRadius,wb=c.wheelbase,tyreW=c.wheelWidth??.048;
 const sx=L/.72,sy=H/.16,sz=W/.34;
 function mesh(geometry,material,parent=model,name=''){
  const o=new T.Mesh(geometry,material);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 }
 function box(size,at,material=materials.paint,parent=model,name=''){
  const o=mesh(new T.BoxGeometry(...size),material,parent,name);o.position.set(...at);return o;
 }
 function panel(points,depth,z,material,name){
  const shape=new T.Shape();shape.moveTo(points[0][0]*sx,points[0][1]*sy);for(const p of points.slice(1))shape.lineTo(p[0]*sx,p[1]*sy);shape.closePath();
  const o=mesh(new T.ExtrudeGeometry(shape,{depth:depth*sz,bevelEnabled:false}),material,model,name);o.position.z=z*sz;return o;
 }
 function cyl(radius,length,at,material,parent=model,axis='z',name=''){
  const o=mesh(new T.CylinderGeometry(radius,radius,length,24),material,parent,name);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;o.position.set(...at);return o;
 }
 // ---- body: collision envelope EXACTLY ----
 const body=new T.Group();body.name='body';model.add(body);
 for(const b of c.collisionBoxes??[{size:[L,H,W],position:[0,0,0]}])box(b.size,b.position,materials.paint,body);

 // ---- chassis (visible under-floor) ----
 box([.62,.035,.055],[0,-.095,-.085],materials.plastic);
 box([.62,.035,.055],[0,-.095,.085],materials.plastic);
 box([.3,.03,.16],[.05,-.105,0],materials.plastic);
 cyl(.02,.38,[wb/2,-.085,0],materials.steel,model,'z');
 cyl(.02,.38,[-wb/2,-.085,0],materials.steel,model,'z');
 // front and rear bumpers + skid plate
 box([.06,.055,W*1.06],[L/2+.015,-.075,0],materials.plastic,model,'front-bumper');
 box([.06,.055,W*1.06],[-L/2-.015,-.075,0],materials.plastic,model,'rear-bumper');
 box([.42,.02,.2],[.02,-.145,0],materials.skid,model,'skid-plate');
 for(const x of [-.14,.14])for(const z of [-.085,.085])box([.025,.045,.025],[x,-.1225,z],materials.steel,model,'skid-mount');
 const frontSkid=box([.16,.02,.2],[L/2-.075,-.12,0],materials.skid,model,'front-skid');frontSkid.rotation.z=.35;

 // ---- lower tub with open wheel arches ----
 const tub=new T.Shape(),bottom=-.06*sy,arch=r*1.28,cy=-c.suspension;
 tub.moveTo(-L/2,bottom);
 const angle=Math.asin(T.MathUtils.clamp((bottom-cy)/arch,-.99,.99));
 for(const x of [-wb/2,wb/2]){
  tub.lineTo(x-arch*Math.cos(angle),bottom);
  for(let i=0;i<=20;i++){const a=Math.PI-angle-(Math.PI-2*angle)*i/20;tub.lineTo(x+arch*Math.cos(a),cy+arch*Math.sin(a));}
 }
 tub.lineTo(L/2,bottom);tub.lineTo(L/2,.045*sy);tub.lineTo(-L/2,.045*sy);tub.closePath();
 for(const side of [-1,1]){
  const shell=mesh(new T.ExtrudeGeometry(tub,{depth:.008*sz,bevelEnabled:false}),materials.paint,model,'side-shell');shell.position.z=side<0?-W/2:W/2-.008*sz;
  // sill, door seams, waistline trim
  box([.002,.1,.0016],[-.17*sx,.02*sy,side*W*.503],materials.plastic);
  box([.002,.1,.0016],[.13*sx,.02*sy,side*W*.503],materials.plastic);
  box([.36,.003,.0016],[-.02*sx,.043*sy,side*W*.503],materials.plastic);
  box([.34,.012,.012],[-.02*sx,-.028*sy,side*W*.51],materials.plastic);
  // winch-side step on each side
  box([.2,.02,.045],[-.06*sx,-.05*sy,side*(W/2+.02)],materials.plastic);
  // tow hooks
  const hook=mesh(new T.TorusGeometry(.012,.0035,6,14),materials.steel);hook.position.set(L/2+.045,-.06*sy,side*.09);hook.rotation.y=Math.PI/2;
 }
 // rocker guards, lower black band
 box([L*.96,.026,W*.98],[0,-.058*sy,0],materials.plastic,model,'rocker-guard');
 box([L*.97,.02,W*.995],[0,-.075*sy,0],materials.skid);

 // ---- cabin ----
 // Body structure visible through glass: dash, windshield pillars, seats, spare
 const cabFront=.16,cabRear=-.27,roofY=.145,baseY=.045;
 // A pillars
 for(const side of [-1,1]){
  panel([[cabFront,baseY],[cabFront+.045,baseY],[cabFront-.005,roofY],[cabFront-.04,roofY]],.012,side*.148,materials.paintDark,'a-pillar');
  // B pillar
  panel([[-.095,baseY],[-.065,baseY],[-.065,roofY],[-.09,roofY]],.014,side*.15,materials.paintDark,'b-pillar');
  // C pillar
  panel([[cabRear+.02,baseY],[cabRear+.05,baseY],[cabRear+.05,roofY],[cabRear+.01,roofY]],.014,side*.15,materials.paintDark,'c-pillar');
 }
 // glass
 panel([[cabFront,baseY],[cabFront+.045,baseY],[-.005,roofY],[cabRear+.03,roofY],[cabRear+.03,baseY]],.001,-.151,materials.glass,'side-glass-left');
 panel([[cabFront,baseY],[cabFront+.045,baseY],[-.005,roofY],[cabRear+.03,roofY],[cabRear+.03,baseY]],.001,.151,materials.glass,'side-glass-right');
 // windshield (slanted)
 {const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([[cabFront,baseY,-.15],[cabFront,baseY,.15],[cabFront-.03,roofY,.15],[cabFront-.03,roofY,-.15]].flatMap(p=>p),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();mesh(g,materials.glass,model,'windshield');}
 // rear window
 {const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([[cabRear+.04,baseY,-.15],[cabRear+.04,baseY,.15],[cabRear+.05,roofY,.15],[cabRear+.05,roofY,-.15]].flatMap(p=>p),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();mesh(g,materials.glass,model,'rear-window');}
 // roof with rails
 box([cabRear-cabFront,0.022,.31],[(cabFront+cabRear)/2,roofY+.011,0],materials.paint,model,'roof');
 for(const side of [-1,1])box([cabRear-cabFront+.02,.012,.018],[(cabFront+cabRear)/2,roofY+.027,side*.13],materials.steel);
 // roll cage bars
 for(const x of [-.04,-.2]){box([.02,.003,0.262],[x,roofY+.032,0],materials.steel);}
 box([.17,.003,.003],[-.115,roofY+.032,.128],materials.steel);box([.17,.003,.003],[-.115,roofY+.032,-.128],materials.steel);
 // cargo / jerry cans on roof rack
 box([.16,.02,.06],[-.14,roofY+.045,-.09],materials.canvas,model,'roof-cargo-0');
 box([.16,.02,.06],[-.14,roofY+.045,.02],materials.canvas,model,'roof-cargo-1');
 box([.03,.06,.045],[-.045,roofY+.062,.1],materials.plastic,model,'jerrycan');

 // cabin interior: dashboard, seats, spare tire on roof behind
 box([.05,.055,.28],[cabFront-.05,.10,0],materials.plastic,model,'dashboard');
 box([.03,.02,.06],[cabFront-.04,.13,.07],materials.plastic,model,'cluster');
 for(const z of [-.065,.065]){
  box([.055,.018,.07],[-.1,.075,z],materials.plastic,model,'seat-base');
  const back=box([.016,.075,.07],[-.135,.13,z],materials.plastic,model,'seat-back');back.rotation.z=.12;
 }
 box([.22,.035,.30],[cabRear+.09,.098,0],materials.canvas,model,'rear-bulkhead');

 // ---- nose / hood area ----
 box([.24,.045,W*.92],[.36*sx+.02,.075,0],materials.paint,model,'hood');
 // hood vents (three slats)
 for(let i=0;i<3;i++)box([.09,.006,.02],[.395*sx,.099,-.07+i*.07],materials.plastic);
 // snorkel on passenger side behind A pillar
 cyl(.02,.16,[.245,.13,.155],materials.plastic,model,'y');
 box([.035,.028,.02],[.245,.223,.155],materials.plastic,model,'snorkel-head');

 // ---- grille, lights, mirrors ----
 box([.02,.085,W*.78],[.375,.055,0],materials.plastic,model,'grille-face');
 for(let i=0;i<9;i++)box([.008,.06,.012],[.386,.055,-.075+i*.019],materials.steel,model,'grille-slat');
 for(const side of [-1,1]){
  // headlamp bezel + lens
  cyl(.028*sy,.012,[.388,.075,side*.115],materials.steel,model,'x');
  cyl(.024*sy,.014,[.395,.075,side*.115],materials.lamp,model,'x');
  // amber corner lamp
  box([.02,.028,.018],[.378,.075,side*.163],materials.amber,model,'amber-corner');
  // roof mirrors
  box([.03,.012,.125],[cabFront-.015,.13,side*.1975],materials.plastic,model,'mirror-stem');
  box([.02,.05,.045],[cabFront-.015,.14,side*.26],materials.plastic,model,'mirror-head');
  box([.006,.038,.035],[cabFront-.023,.14,side*.26],materials.glass,model,'mirror-glass');
 }
 // taillights + rear plate
 for(const side of [-1,1]){
  box([.012,.05,.03],[-L/2-.004,.045,side*.105],materials.red,model,'taillight');
  box([.012,.022,.03],[-L/2-.004,-.005,side*.105],materials.amber,model,'rear-side-marker');
 }
 box([.008,.02,.09],[-.375,.075,0],materials.steel,model,'rear-plate');

 // ---- rear-mounted spare wheel ----
 {const spare=new T.Group();spare.position.set(-.365,.075,0);model.add(spare);
  cyl(r*.78,tyreW*1.15,[0,0,0],materials.rubber,spare);
  cyl(r*.45,tyreW*1.2,[0,0,0],materials.steel,spare);
  cyl(r*.2,tyreW*1.3,[0,0,0],materials.plastic,spare);
  spare.rotation.y=Math.PI/2;spare.rotation.z=0;
 }

 // ---- chunky wheels ----
 const wheels=[];const treadTransform=new T.Object3D();
 for(let i=0;i<4;i++){
  const steer=new T.Group(),spin=new T.Group();steer.name=`wheel-${i}`;
  steer.position.set((i<2?1:-1)*wb/2,-c.suspension,(i%2?1:-1)*c.track/2);steer.add(spin);model.add(steer);
  cyl(r*.94,tyreW,[0,0,0],materials.rubber,spin);
  // aggressive tread blocks
  const tread=new T.InstancedMesh(new T.BoxGeometry(r*.22,r*.16,tyreW*.34),materials.rubber,32*3);tread.castShadow=true;tread.receiveShadow=true;spin.add(tread);
  for(let n=0;n<32;n++)for(let row=0;row<3;row++){
   const a=(n+(row===1?.5:0))*2*Math.PI/32;
   treadTransform.position.set(Math.cos(a)*r*.98,Math.sin(a)*r*.98,(row-1)*tyreW*.335);
   treadTransform.rotation.set(0,row===1?0:(row===0?-.35:.35),a-Math.PI/2);treadTransform.updateMatrix();tread.setMatrixAt(n*3+row,treadTransform.matrix);
  }
  tread.instanceMatrix.needsUpdate=true;
  for(const side of [-1,1]){
   const sidewall=mesh(new T.TorusGeometry(r*.72,r*.2,8,30),materials.rubber,spin);sidewall.position.z=side*tyreW*.36;
   cyl(r*.56,tyreW*.1,[0,0,side*tyreW*.52],materials.steel,spin);
   const rim=mesh(new T.TorusGeometry(r*.5,r*.06,8,28),materials.steel,spin);rim.position.z=side*tyreW*.58;
   cyl(r*.22,tyreW*.15,[0,0,side*tyreW*.58],materials.plastic,spin);
   for(let n=0;n<8;n++){const a=n*Math.PI/4;cyl(r*.07,tyreW*.09,[Math.cos(a)*r*.37,Math.sin(a)*r*.37,side*tyreW*.58],materials.plastic,spin);}
  }
  wheels.push({steer,spin});
 }
 return {model,wheels,tracks:[],dispose(){const gs=new Set(),ms=new Set();model.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);if(o.isInstancedMesh)o.dispose();});for(const g of gs)g.dispose();for(const m of ms)m.dispose();}};
}
