const clamp=v=>Math.max(0,Math.min(1,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function skyPalette(elevationDeg=45,cloud=0){
 const day=clamp((elevationDeg+10)/25),sunset=Math.max(0,1-Math.abs(elevationDeg-1)/13)*day,overcast=clamp(cloud);
 let horizon=mix([.055,.075,.12],[.73,.83,.89],day),zenith=mix([.012,.022,.06],[.24,.49,.72],day);
 horizon=mix(horizon,[.93,.54,.36],sunset*.8);zenith=mix(zenith,[.32,.34,.52],sunset*.4);
 horizon=mix(horizon,mix([.06,.07,.09],[.68,.72,.75],day),overcast*.75);
 zenith=mix(zenith,mix([.025,.032,.05],[.48,.54,.60],day),overcast*.8);
 return {horizon,zenith};
}
export function paletteChanged(previous,next){
 return !previous||['horizon','zenith'].some(key=>next[key].some((v,i)=>Math.abs(v-previous[key][i])>1/255));
}
