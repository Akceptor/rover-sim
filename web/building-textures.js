import * as T from '/three.js';
import {foundationMoisture} from '/building-surfaces.js';
// A finite shared texture set survives world reloads; per-building materials are disposed normally.
const records=new Map(),photo=new Image();
const rects={plaster:[.04,.04,.42,.40],brick:[.54,.04,.42,.40],concrete:[.04,.54,.42,.42],roof:[.54,.54,.42,.42]};
const tones={plaster:['#f1e5cb','#cbd6d5','#dec6b6'],brick:['#e8d8ce','#ddc5b1','#c9c2b8'],concrete:['#e4ded5','#cbd4d7','#cbc8bc'],roof:['#8e969e','#99917e','#927c70']};
function paint(record){
 const {canvas,map,finish,tone,kind}=record,c=canvas.getContext('2d'),s=canvas.width;
 c.clearRect(0,0,s,s);
 if(kind==='door'){
  c.fillStyle='#c8c6bc';c.fillRect(18,8,s-36,s-16);c.fillStyle='#222b2c';c.fillRect(30,20,s-60,s-32);
  const g=c.createLinearGradient(30,0,s,0);g.addColorStop(0,'#61574a');g.addColorStop(.5,'#716552');g.addColorStop(1,'#50493e');c.fillStyle=g;c.fillRect(36,26,s-72,s-44);
  c.strokeStyle='#383d3b';c.lineWidth=5;for(const y of [58,270]){c.strokeRect(56,y,s-112,174);}
  c.fillStyle='#bec8c6';c.fillRect(s-70,250,8,46);c.fillStyle='#45443d';c.fillRect(s-66,274,20,6);
 }else{
  c.fillStyle=tones[finish][tone];c.fillRect(0,0,s,s);
  if(photo.naturalWidth){const r=rects[finish];c.drawImage(photo,r[0]*photo.width,r[1]*photo.height,r[2]*photo.width,r[3]*photo.height,0,0,s,s);c.globalCompositeOperation='multiply';c.fillStyle=tones[finish][tone];c.fillRect(0,0,s,s);c.globalCompositeOperation='source-over';}
  else{c.fillStyle='#00000009';for(let i=0;i<1500;i++)c.fillRect((i*73)%s,(i*113)%s,2,2);}
  if(kind==='base'){
   // Full-height V avoids repeating damp bands and stretching top edge pixels on blank margins.
   const traces=foundationMoisture();c.save();c.beginPath();c.moveTo(0,s);
   traces.forEach((h,i)=>c.lineTo(i/(traces.length-1)*s,s*(1-h)));c.lineTo(s,s);c.closePath();c.clip();
   const damp=c.createLinearGradient(0,s,0,s*.89);damp.addColorStop(0,'#343b2c38');damp.addColorStop(.4,'#42483120');damp.addColorStop(1,'#42483100');c.fillStyle=damp;c.fillRect(0,s*.89,s,s*.11);c.restore();
  }
  if(kind==='windows'){
   const x=137,y=110,w=238,h=252;
   c.fillStyle='#00000035';c.fillRect(x-9,y+7,w+22,h+12);
   c.fillStyle='#555951';c.fillRect(x-6,y-6,w+12,h+12);
   c.fillStyle=finish==='concrete'?'#b5bbb9':'#e5e2d6';c.fillRect(x,y,w,h);
   const glass=c.createLinearGradient(0,y,0,y+h);glass.addColorStop(0,'#637b85');glass.addColorStop(.45,'#394f59');glass.addColorStop(1,'#202b30');c.fillStyle=glass;c.fillRect(x+8,y+8,w-16,h-16);
   c.fillStyle='#b9b5a75a';c.fillRect(x+12,y+17,25,h-35);c.fillRect(x+w-43,y+17,25,h-35);
   c.save();c.beginPath();c.rect(x+8,y+8,w-16,h-16);c.clip();c.strokeStyle='#c9dfe435';c.lineWidth=11;c.beginPath();c.moveTo(x-20,y+h*.7);c.lineTo(x+w,y-12);c.stroke();c.lineWidth=3;c.beginPath();c.moveTo(x+12,y+h);c.lineTo(x+w+20,y+45);c.stroke();c.restore();
   c.fillStyle=finish==='concrete'?'#b5bbb9':'#e5e2d6';c.fillRect(x+w/2-3,y+2,6,h-4);c.fillRect(x+2,y+h*.57,w-4,5);
   c.fillStyle='#5a5b53';c.fillRect(x-9,y+h+5,w+18,8);c.fillStyle='#dad6c6';c.fillRect(x-12,y+h,w+24,6);
   // Subtle course between floors, clear wall space at the ends of every bay.
   c.fillStyle='#e6e0cc55';c.fillRect(0,s-7,s,3);
  }
 }
 map.userData.photoReady=kind==='door'||!!photo.naturalWidth;map.needsUpdate=true;
}
photo.onload=()=>{for(const r of records.values())paint(r);};
photo.src='/assets/textures/building-materials.png';
export function buildingTexture(style,kind){
 const finish=kind==='roof'?'roof':style.finish,tone=kind==='roof'?style.roof:style.tone,key=kind==='door'?'door':`${finish}:${tone}:${kind}`;
 if(!records.has(key)){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=T.RepeatWrapping;map.wrapT=kind==='base'?T.ClampToEdgeWrapping:T.RepeatWrapping;map.anisotropy=4;
  const record={canvas,map,finish,tone,kind};records.set(key,record);paint(record);
 }
 return records.get(key).map;
}
