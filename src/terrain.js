// Shared north/up/east terrain geometry. Rows increase north (+X), columns east (+Z).
export function validateTerrain(t){
 if(!t||t.version!==1||typeof t.name!=='string'||!t.name||!Number.isInteger(t.size)||t.size<3||t.size>257||t.size%2!==1||!Number.isFinite(t.spacing)||t.spacing<.25||t.spacing>100)throw Error('Invalid terrain grid');
 if(!Array.isArray(t.heights)||t.heights.length!==t.size*t.size||!t.heights.every(h=>Number.isFinite(h)&&Math.abs(h)<10000))throw Error('Invalid terrain elevations');
 if(Math.abs(t.heights[(t.heights.length-1)/2])>.001)throw Error('Terrain spawn elevation must be zero');
 if(!t.home||!Number.isFinite(t.home.lat)||Math.abs(t.home.lat)>85||!Number.isFinite(t.home.lon)||Math.abs(t.home.lon)>180||!Number.isFinite(t.home.alt))throw Error('Invalid terrain geographic home');
 if(typeof t.attribution!=='string'||!t.attribution)throw Error('Terrain attribution is required');
 if(t.colors&&(!Array.isArray(t.colors)||t.colors.length!==t.heights.length*3||!t.colors.every(v=>Number.isInteger(v)&&v>=0&&v<=255)))throw Error('Invalid terrain colours');
 return t;
}
export function terrainMesh(t){
 const n=t.size,half=(n-1)*t.spacing/2,vertices=new Float32Array(n*n*3),indices=new Uint32Array((n-1)*(n-1)*6);
 for(let x=0;x<n;x++)for(let z=0;z<n;z++){const k=x*n+z;vertices.set([x*t.spacing-half,t.heights[k],z*t.spacing-half],k*3);}
 let k=0;for(let x=0;x<n-1;x++)for(let z=0;z<n-1;z++){const a=x*n+z,b=a+1,c=a+n,d=c+1;indices.set([a,b,c,b,d,c],k);k+=6;}
 return {vertices,indices};
}
export function terrainHeight(t,x,z){
 const half=(t.size-1)*t.spacing/2;let u=(x+half)/t.spacing,v=(z+half)/t.spacing;
 if(!Number.isFinite(u)||!Number.isFinite(v)||u< -1e-8||v< -1e-8||u>t.size-1+1e-8||v>t.size-1+1e-8)throw Error('Position outside terrain');
 u=Math.max(0,Math.min(t.size-1,u));v=Math.max(0,Math.min(t.size-1,v));
 const i=Math.min(Math.floor(u),t.size-2),j=Math.min(Math.floor(v),t.size-2),a=u-i,b=v-j,k=i*t.size+j;
 const [h00,h01,h10,h11]=[t.heights[k],t.heights[k+1],t.heights[k+t.size],t.heights[k+t.size+1]];
 return a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
}
export function terrainObjects(t){
 const out=[],half=(t.size-1)*t.spacing/2;
 // Boundary segments follow each imported edge; their tops are two metres above ground.
 for(let i=0;i<t.size-1;i++)for(const sign of [-1,1]){
  const v=i*t.spacing-half,next=(i+1)*t.spacing-half;
  const eastTop=Math.max(terrainHeight(t,sign*half,v),terrainHeight(t,sign*half,next));
  const northTop=Math.max(terrainHeight(t,v,sign*half),terrainHeight(t,next,sign*half));
  out.push({kind:'barrier',size:[.25,20,t.spacing],position:[sign*half,eastTop-8,v+t.spacing/2],color:0x687164});
  out.push({kind:'barrier',size:[t.spacing,20,.25],position:[v+t.spacing/2,northTop-8,sign*half],color:0x687164});
 }
 let seed=4617;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<100;i++){
  const x=(random()-.5)*Math.min(half*1.8,220),z=(random()-.5)*Math.min(half*1.8,220);
  if(Math.hypot(x,z)<8)continue;
  const y=terrainHeight(t,x,z),height=2.5+random()*3;
  if(i%3===0){const s=.15+random()*.35;out.push({kind:'rock',size:[s,s*.7,s*.9],position:[x,y+s*.35,z],color:0x777b70});}
  else out.push({kind:'tree',size:[.22,height,.22],position:[x,y+height/2,z],color:0x655039});
 }
 return out;
}
