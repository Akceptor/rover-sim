// The rendered triangles are also the sole source of water contact physics.
export function waterFeatures(overlay){
 if(overlay?.water!==undefined)return overlay.water;
 return (overlay?.landcover??[]).filter(f=>f.kind==='water').map(f=>({id:f.id,type:'pond',outer:f.outer,holes:f.holes??[],depth:null,seasonal:false}));
}
export function normalizeWaterSettings(value=undefined){
 if(value===undefined)return {maxCrossingDepth:.2};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='maxCrossingDepth'))throw Error('Invalid water settings');
 const maxCrossingDepth=value.maxCrossingDepth===undefined?.2:value.maxCrossingDepth;
 if(!Number.isFinite(maxCrossingDepth)||maxCrossingDepth<0||maxCrossingDepth>2)throw Error('Invalid maximum water crossing depth');
 return {maxCrossingDepth};
}
export function createWaterIndex(prepared,terrain){
 if(!prepared?.features?.length||!terrain)return ()=>null;
 const half=(terrain.size-1)*terrain.spacing/2,n=Math.min(64,terrain.size-1),step=half*2/n,cells=new Map();
 const cell=v=>Math.max(0,Math.min(n-1,Math.floor((v+half)/step)));
 const features=[...(prepared?.features??[])].sort((a,b)=>(a.depth===null?-Infinity:-a.depth)-(b.depth===null?-Infinity:-b.depth)||String(a.id).localeCompare(String(b.id)));
 for(const f of features){const v=f.vertices;for(let i=0;i+8<v.length;i+=9){
  const xs=[v[i],v[i+3],v[i+6]],zs=[v[i+2],v[i+5],v[i+8]];
  for(let x=cell(Math.min(...xs));x<=cell(Math.max(...xs));x++)for(let z=cell(Math.min(...zs));z<=cell(Math.max(...zs));z++){
   const key=x*n+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({f,i});
  }
 }}
 return (x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>half||Math.abs(z)>half)return null;
  for(const {f,i}of cells.get(cell(x)*n+cell(z))??[]){
   const v=f.vertices,ax=v[i],az=v[i+2],bx=v[i+3],bz=v[i+5],cx=v[i+6],cz=v[i+8],d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
   if(Math.abs(d)<1e-14)continue;
   const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,c=1-a-b;
   if(a>=-1e-9&&b>=-1e-9&&c>=-1e-9)return {id:f.id,depth:f.depth,surfaceY:a*v[i+1]+b*v[i+4]+c*v[i+7],seasonal:f.seasonal};
  }
  return null;
 };
}
