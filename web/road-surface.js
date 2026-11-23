// Four metres per repeat, shared world coordinates keep adjacent triangles seamless.
export function roadUV(vertices){
 const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/4,vertices[i+2]/4);return uv;
}
export function roadPixels(paved,size=256){
 const pixels=new Uint8ClampedArray(size*size*4),base=paved?[103,104,106]:[153,130,96];
 const hash=(x,y)=>{let h=Math.imul(x+137,374761393)^Math.imul(y+857,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
 // Copy periodic boundary samples so filtering and mipmaps never reveal a tile edge.
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x%(size-1),v=y%(size-1),grain=hash(u,v),wave=Math.sin(u/(size-1)*Math.PI*4)*Math.cos(v/(size-1)*Math.PI*6);
  const value=(grain-.5)*(paved?24:35)+wave*(paved?2:5)+(grain>.975?(paved?13:19):0),i=(y*size+x)*4;
  for(let c=0;c<3;c++)pixels[i+c]=base[c]+value;pixels[i+3]=255;
 }
 return pixels;
}
