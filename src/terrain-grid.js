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
export function terrainApproximationWarning(terrain){
 const gap=terrain?.sources?.elevation?.gapFill;
 if(!gap||!Number.isFinite(gap.filledCells)||!Number.isFinite(gap.totalCells)||gap.filledCells<=0||gap.totalCells<gap.filledCells)return '';
 const fraction=gap.filledCells/gap.totalCells,signs=fraction>=.05?3:fraction>=.04?2:1;
 return `${'⚠'.repeat(signs)} ${(fraction*100).toFixed(2)}% of source elevation approximated`;
}
