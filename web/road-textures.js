import * as T from '/three.js';
import {roadPixels} from '/road-surface.js';
import {roadMaterials} from '/road-materials.js';
// One texture per bounded material preset, retained across world reloads.
const maps=new Map();
export function roadTexture(paved,material){
 const key=Object.hasOwn(roadMaterials,material)?material:(paved?'paved':'unpaved');if(!maps.has(key)){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d'),data=context.createImageData(256,256);data.data.set(roadPixels(roadMaterials[key].paved,256,roadMaterials[key].color));context.putImageData(data,0,0);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;maps.set(key,map);
 }
 return maps.get(key);
}
