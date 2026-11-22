// GEM-15 masks some small areas. Estimate only sparse, local elevation voids;
// never extend repairs through other estimated cells or across large gaps.
export function fillSmallElevationGaps(source,width,height,nodata){
 if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1||source.length!==width*height)throw Error('Invalid elevation raster dimensions');
 const valid=value=>Number.isFinite(value)&&value!==nodata,missing=[];
 for(let k=0;k<source.length;k++)if(!valid(source[k]))missing.push(k);
 const maxRadiusCells=2;
 if(!missing.length)return {values:source,filledCells:0,maxRadiusCells};
 if(missing.length>source.length*.01)throw Error('Source has too much missing elevation data in this patch; choose a different centre');
 const values=new Float32Array(source);
 for(const k of missing){
  const x=k%width,y=Math.floor(k/width);let weighted=0,weights=0;
  for(let dy=-maxRadiusCells;dy<=maxRadiusCells;dy++)for(let dx=-maxRadiusCells;dx<=maxRadiusCells;dx++){
   const distance=dx*dx+dy*dy,nx=x+dx,ny=y+dy;
   if(!distance||distance>maxRadiusCells**2||nx<0||nx>=width||ny<0||ny>=height)continue;
   const value=source[ny*width+nx];if(!valid(value))continue;
   const weight=1/distance;weighted+=value*weight;weights+=weight;
  }
  if(!weights)throw Error('Source missing elevation area is too wide to estimate locally; choose a different centre');
  values[k]=weighted/weights;
 }
 return {values,filledCells:missing.length,maxRadiusCells};
}
