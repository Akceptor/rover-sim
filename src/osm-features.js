export function hasOsmFeatures(overlay){
 return !!overlay&&['buildings','roads','landcover','trees','barriers','barrierFeatures'].some(key=>overlay[key]?.length>0);
}
