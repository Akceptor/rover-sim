import * as T from '/three.js';
// Deterministic, local textures: no image downloads or changes to collision geometry.
function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function texture(size,paint){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;paint(canvas.getContext('2d'),size);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return map;}
export function createScenery(renderer){
 const rng=random(1827);
 const grass=texture(512,(c,size)=>{
  c.fillStyle='#647447';c.fillRect(0,0,size,size);
  for(let i=0;i<23000;i++){const x=rng()*size,y=rng()*size;c.fillStyle=['#798558','#506039','#9b966b','#6d7948','#84905b'][i%5];c.globalAlpha=.3+rng()*.4;c.fillRect(x,y,1+rng()*3,1+rng()*7);}
  c.globalAlpha=1;for(let i=0;i<160;i++){c.fillStyle=['#b1aa8d','#8b876f','#47583a'][i%3];c.beginPath();c.ellipse(rng()*size,rng()*size,1+rng()*2,1+rng()*2,0,0,Math.PI*2);c.fill();}
 });
 grass.wrapS=grass.wrapT=T.RepeatWrapping;grass.repeat.set(25,25);grass.anisotropy=renderer.capabilities.getMaxAnisotropy();
 const markings=texture(1024,(c,size)=>{
  const point=(x,z)=>[size/2+x*size/100,size/2+z*size/100];
  // Two worn tyre tracks and ground paint offer scale without adding obstacles.
  for(const offset of [-.18,.18]){c.strokeStyle='#b3a17bb0';c.lineWidth=2.4;c.lineJoin='round';c.beginPath();
   for(const [i,[x,z]] of [[0,[0,0]],[1,[5,0]],[2,[5,-3]],[3,[-5,-3]],[4,[-5,4]],[5,[0,4]],[6,[0,0]]]){const p=point(x,z+offset);if(i===0)c.moveTo(...p);else c.lineTo(...p);}c.stroke();}
  c.font='bold 17px sans-serif';c.textAlign='center';c.textBaseline='middle';
  for(const [label,x,z] of [['N',12,0],['E',0,12],['S',-12,0],['W',0,-12]]){c.save();c.translate(...point(x,z));c.rotate(Math.PI/2);c.fillStyle='#e0dfc0d9';c.fillText(label,0,0);c.restore();}
  c.strokeStyle='#e2dfbaaa';c.lineWidth=1.5;
  for(let x=-15;x<=15;x+=5)for(let z=-15;z<=15;z+=5){const [px,py]=point(x,z);c.beginPath();c.moveTo(px-2,py);c.lineTo(px+2,py);c.moveTo(px,py-2);c.lineTo(px,py+2);c.stroke();}
 });
 markings.anisotropy=grass.anisotropy;
 const sky=new T.Group();
 const skyMap=texture(64,(c,size)=>{const g=c.createLinearGradient(0,0,0,size);g.addColorStop(0,'#4a86b7');g.addColorStop(.5,'#b9d8e8');g.addColorStop(1,'#d7e5e6');c.fillStyle=g;c.fillRect(0,0,size,size);});
 const dome=new T.Mesh(new T.SphereGeometry(110,32,16),new T.MeshBasicMaterial({map:skyMap,side:T.BackSide,depthWrite:false,fog:false}));dome.renderOrder=-2;sky.add(dome);
 const cloudMap=texture(256,(c)=>{for(const [x,y,r] of [[62,144,48],[105,111,61],[158,131,57],[199,148,36]]){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#ffffffed');g.addColorStop(.65,'#ffffffe0');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}});
 for(let i=0;i<15;i++){const a=i*Math.PI*2/15+.1,r=65+rng()*20;const cloud=new T.Sprite(new T.SpriteMaterial({map:cloudMap,depthWrite:false,fog:false,opacity:.78+rng()*.2}));cloud.position.set(Math.cos(a)*r,13+rng()*20,Math.sin(a)*r);cloud.scale.set(18+rng()*16,10+rng()*10,1);cloud.renderOrder=-1;sky.add(cloud);}
 return {sky,setWeather(color,visual){
  dome.material.color.copy(color);
  for(const cloud of sky.children.slice(1)){cloud.material.opacity=visual.cloud*(.25+visual.daylight*.65);cloud.material.color.setScalar(.18+visual.daylight*.82);}
 },decorate(world){
  const ground=world.children[0];ground.material.map=grass;ground.material.color.set(0xffffff);ground.material.needsUpdate=true;
  const paint=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({map:markings,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1}));paint.rotation.x=-Math.PI/2;paint.position.y=.003;paint.receiveShadow=true;world.add(paint);
 }};
}
