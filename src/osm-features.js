export function hasOsmFeatures(overlay){
 return !!overlay&&['buildings','roads','landcover','trees'].some(key=>overlay[key]?.length>0);
}
