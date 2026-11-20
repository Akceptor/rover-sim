// GEM's signed cell IDs use "m" for negative coordinates, not a minus sign.
export function gemItemUrl(lat,lon){
 const groupPart=n=>`${n<0?'m':'p'}${Math.abs(n)}`;
 const cellPart=n=>n<0?`m${Math.abs(n)}`:String(n);
 const group=`${groupPart(Math.floor(lat/10)*10)}_${groupPart(Math.floor(lon/10)*10)}`;
 const cell=`w${cellPart(Math.floor(lon))}s${cellPart(Math.floor(lat))}`;
 return `https://storage.googleapis.com/climate-and-sustainability/gem-15/stac/gem-15/${group}/${cell}/${cell}.json`;
}
