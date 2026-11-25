import * as T from 'three';

// Original, procedural visual approximation from the user's tan crawler reference.
// Metres, +X forward, +Y up, +Z right. Dimensions follow the existing physics chassis.
export function createCrawler(c){
 const model=new T.Group();model.name='MN-168';
 const materials={
  paint:new T.MeshStandardMaterial({color:0xc8994e,roughness:.43,metalness:.22}),
  grille:new T.MeshStandardMaterial({color:0x55554d,roughness:.65,metalness:.35}),
  edge:new T.MeshStandardMaterial({color:0x8f6631,roughness:.55}),
  black:new T.MeshStandardMaterial({color:0x191d1c,roughness:.8}),
  rubber:new T.MeshStandardMaterial({color:0x252a28,roughness:.97}),
  silver:new T.MeshStandardMaterial({color:0xc4c8c5,metalness:.8,roughness:.28}),
  glass:new T.MeshStandardMaterial({color:0x819797,metalness:.35,roughness:.18,transparent:true,opacity:.66,side:T.DoubleSide}),
  lamp:new T.MeshStandardMaterial({color:0xe1eadc,metalness:.3,roughness:.2,emissive:0xc6d4b7,emissiveIntensity:.12}),
  amber:new T.MeshStandardMaterial({color:0xe9a229,roughness:.4}),
  red:new T.MeshStandardMaterial({color:0xa52c1c,roughness:.4}),
  seat:new T.MeshStandardMaterial({color:0x886b42,roughness:.96})
 };
 const L=c.length,W=c.width,H=c.height,r=c.wheelRadius,wb=c.wheelbase;
 const sx=L/.48,sy=H/.12,sz=W/.24;
 function mesh(geometry,material,parent=model,name=''){
  const o=new T.Mesh(geometry,material);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 }
 function box(size,at,material=materials.paint,parent=model,name=''){
  const o=mesh(new T.BoxGeometry(...size),material,parent,name);o.position.set(...at);return o;
 }
 const b=(size,at,material,parent=model,name='')=>box([size[0]*sx,size[1]*sy,size[2]*sz],[at[0]*sx,at[1]*sy,at[2]*sz],material,parent,name);
 function panel(points,depth,z,material,name){
  const shape=new T.Shape();shape.moveTo(points[0][0]*sx,points[0][1]*sy);for(const p of points.slice(1))shape.lineTo(p[0]*sx,p[1]*sy);shape.closePath();
  const o=mesh(new T.ExtrudeGeometry(shape,{depth:depth*sz,bevelEnabled:false}),material,model,name);o.position.z=z*sz;return o;
 }
 function cylinder(radius,length,at,material,parent=model,axis='z'){
  const o=mesh(new T.CylinderGeometry(radius,radius,length,24),material,parent);if(axis==='z')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.z=Math.PI/2;o.position.set(...at);return o;
 }
 function glazing(points,name){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(([x,y,z])=>[x*sx,y*sy,z*sz]),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return mesh(g,materials.glass,model,name);
 }
 // Narrow ladder frame, exposed axle housings, and a central driveline.
 for(const z of [-.073,.073])b([.43,.017,.012],[0,-.025,z],materials.black);
 b([.39,.022,.12],[0,-.015,0],materials.black,model,'floor');
 b([.06,.022,.23],[0,-.015,0],materials.black,model,'body-crossmember');
 for(const x of [-wb/2,wb/2]){
  cylinder(r*.12,c.track,[x,-c.suspension,0],materials.black);
  mesh(new T.SphereGeometry(r*.3,16,10),materials.black).position.set(x,-c.suspension,0);
  // Visible suspension links join the axle housings to the ladder frame.
  const top=-.025*sy,bottom=-c.suspension;
  for(const z of [-.073,.073])cylinder(r*.1,Math.abs(top-bottom)+.004,[x,(top+bottom)/2,z*sz],materials.silver,model,'y');
 }
 cylinder(r*.11,wb,[0,-c.suspension,0],materials.black,model,'x');
 // Lower side panels have open wheel arches, rather than tyres intersecting a box.
 for(const side of [-1,1]){
  const shape=new T.Shape(),bottom=-.025*sy,arch=r*1.23,cy=-c.suspension;
  shape.moveTo(-L/2,bottom);
  const angle=Math.asin(T.MathUtils.clamp((bottom-cy)/arch,-.99,.99));
  for(const x of [-wb/2,wb/2]){
   shape.lineTo(x-arch*Math.cos(angle),bottom);
   for(let i=0;i<=24;i++){const a=Math.PI-angle-(Math.PI-2*angle)*i/24;shape.lineTo(x+arch*Math.cos(a),cy+arch*Math.sin(a));}
  }
  shape.lineTo(L/2,bottom);shape.lineTo(L/2,.097*sy);shape.lineTo(-L/2,.097*sy);shape.closePath();
  const shell=mesh(new T.ExtrudeGeometry(shape,{depth:.006*sz,bevelEnabled:false}),materials.paint,model,'body-side');shell.position.z=side<0?-W/2:W/2-.006*sz;
  // Door seam, handles, lower sill, and waistline.
  b([.002,.102,.0015],[-.105,.04,side*.1205],materials.edge);
  b([.002,.102,.0015],[.063,.04,side*.1205],materials.edge);
  b([.15,.002,.0015],[-.021,-.01,side*.1205],materials.edge);
  b([.024,.006,.004],[-.078,.083,side*.1215],materials.black);
  b([.46,.003,.004],[0,.099,side*.121],materials.edge);
  b([.14,.013,.02],[-.02,-.032,side*.12],materials.black);
  // Large door glass and rear quarter glass, separated by a thick tan B pillar.
  panel([[-.097,.112],[.053,.112],[-.012,.218],[-.097,.218]],.001,side*.11,materials.glass,'door-window');
  panel([[-.218,.112],[-.115,.112],[-.115,.218],[-.198,.218]],.001,side*.11,materials.glass,'quarter-window');
  panel([[-.115,.10],[-.097,.10],[-.097,.23],[-.115,.23]],.007,side*.109,materials.paint,'b-pillar');
  panel([[.052,.10],[.067,.10],[-.002,.23],[-.017,.23]],.008,side*.108,materials.paint,'a-pillar');
  panel([[-.235,.10],[-.218,.10],[-.198,.23],[-.184,.23]],.008,side*.108,materials.paint,'rear-pillar');
  // Front fender mirrors, with short black stems.
  b([.006,.026,.006],[.178,.115,side*.111],materials.black);
  const mirror=mesh(new T.SphereGeometry(.011,12,10),materials.black);mirror.scale.set(.45*sx,1.1*sy,sz);mirror.position.set(.178*sx,.135*sy,side*.111*sz);
 }
 b([.45,.01,.23],[-.005,.092,0],materials.paint,model,'body-deck');
 b([.174,.012,.24],[.153,.104,0],materials.paint,model,'hood');
 b([.211,.012,.233],[-.11,.23,0],materials.paint,model,'roof');
 b([.21,.004,.003],[-.11,.224,-.116],materials.edge);b([.21,.004,.003],[-.11,.224,.116],materials.edge);
 glazing([[.06,.112,-.105],[.06,.112,.105],[-.008,.218,.105],[-.008,.218,-.105]],'windshield');
 glazing([[-.228,.112,.103],[-.228,.112,-.103],[-.201,.217,-.103],[-.201,.217,.103]],'rear-window');
 b([.01,.015,.22],[.064,.108,0],materials.black);b([.012,.012,.22],[-.007,.219,0],materials.paint);
 b([.01,.013,.223],[-.231,.106,0],materials.paint);b([.01,.012,.22],[-.201,.221,0],materials.paint);
 // Interior remains visible through the glazing.
 b([.035,.027,.209],[.037,.103,0],materials.black);
 for(const z of [-.055,.055]){b([.06,.015,.062],[-.065,.104,z],materials.seat);const seat=b([.018,.073,.064],[-.096,.146,z],materials.seat);seat.rotation.z=-.1;}
 b([.052,.057,.184],[-.17,.125,0],materials.seat);
 const steering=mesh(new T.TorusGeometry(.019,.002,6,20),materials.black);steering.rotation.y=Math.PI/2;steering.position.set(.008*sx,.146*sy,-.054*sz);
 // Flat black nose, vertical grille slats and two round, silver-bezel headlights.
 b([.009,.086,.225],[.243,.057,0],materials.black,model,'grille');
 for(let i=0;i<15;i++)b([.011,.052,.003],[.249,.057,-.066+i*.0095],materials.grille);
 for(const side of [-1,1]){
  const bezel=cylinder(.023*sy,.008*sx,[.252*sx,.059*sy,side*.091*sz],materials.silver,model,'x');bezel.name='headlamp-bezel';
  cylinder(.019*sy,.009*sx,[.254*sx,.059*sy,side*.091*sz],materials.lamp,model,'x');
  b([.012,.022,.013],[.247,.049,side*.117],materials.amber);
  b([.008,.058,.014],[-.244,.047,side*.112],materials.red);
  b([.008,.015,.014],[-.245,.026,side*.112],materials.amber);
 }
 b([.027,.028,.271],[.253,.003,0],materials.black,model,'front-bumper');
 b([.025,.026,.257],[-.252,-.001,0],materials.black,model,'rear-bumper');
 // Four independently animated wheels. Tread blocks are instanced to keep draw calls low.
 const wheels=[],tyreWidth=c.wheelWidth??(.052*sz),transform=new T.Object3D();
 for(let i=0;i<4;i++){
  const steer=new T.Group(),spin=new T.Group();steer.name=`wheel-${i}`;steer.position.set((i<2?1:-1)*wb/2,-c.suspension,(i%2?1:-1)*c.track/2);steer.add(spin);model.add(steer);
  cylinder(r*.94,tyreWidth,[0,0,0],materials.rubber,spin);
  const tread=new T.InstancedMesh(new T.BoxGeometry(r*.17,r*.14,tyreWidth*.31),materials.rubber,28*3);tread.castShadow=true;tread.receiveShadow=true;spin.add(tread);
  for(let n=0;n<28;n++)for(let row=0;row<3;row++){
   const a=(n+(row===1 ? .42 : 0))*2*Math.PI/28;
   transform.position.set(Math.cos(a)*r*.95,Math.sin(a)*r*.95,(row-1)*tyreWidth*.33);transform.rotation.set(0,row===1?0:(row===0?-.22:.22),a-Math.PI/2);transform.updateMatrix();tread.setMatrixAt(n*3+row,transform.matrix);
  }
  for(const side of [-1,1]){
   const sidewall=mesh(new T.TorusGeometry(r*.76,r*.19,8,32),materials.rubber,spin);sidewall.position.z=side*tyreWidth*.34;
   cylinder(r*.57,tyreWidth*.08,[0,0,side*tyreWidth*.52],materials.silver,spin);
   const rim=mesh(new T.TorusGeometry(r*.52,r*.055,8,32),materials.silver,spin);rim.position.z=side*tyreWidth*.57;
   cylinder(r*.19,tyreWidth*.16,[0,0,side*tyreWidth*.57],materials.black,spin);
   for(let n=0;n<6;n++){
    const a=n*Math.PI/3;
    cylinder(r*.075,tyreWidth*.09,[Math.cos(a)*r*.38,Math.sin(a)*r*.38,side*tyreWidth*.57],materials.black,spin);
    cylinder(r*.035,tyreWidth*.13,[Math.cos(a)*r*.235,Math.sin(a)*r*.235,side*tyreWidth*.58],materials.silver,spin);
   }
  }
  wheels.push({steer,spin});
 }
 return {model,wheels,dispose(){
  const geometries=new Set();model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)o.dispose();});for(const g of geometries)g.dispose();for(const m of Object.values(materials))m.dispose();
 }};
}
