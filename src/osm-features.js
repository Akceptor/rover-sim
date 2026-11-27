export function hasOsmFeatures(overlay){
 return !!overlay&&(overlay.water?.features?.length>0||overlay.waterFeatureCount>0||['buildings','roads','landcover','trees','barriers','barrierFeatures','water'].some(key=>overlay[key]?.length>0));
}
