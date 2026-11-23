import * as T from '/three.js';
import {roadPixels} from '/road-surface.js';
// Exactly two textures, retained across world reloads and never attached to disposal lists.
const maps=new Map();
export function roadTexture(paved){
 const key=!!paved;if(!maps.has(key)){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d'),data=context.createImageData(256,256);data.data.set(roadPixels(key));context.putImageData(data,0,0);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;maps.set(key,map);
 }
 return maps.get(key);
}
