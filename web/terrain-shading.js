function srgbToLinear(c){
 return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
}

function clamp(v,min,max){
 return v<min?min:v>max?max:v;
}

function smoothstep(edge0,edge1,x){
 const t=clamp((x-edge0)/(edge1-edge0),0,1);
 return t*t*(3-2*t);
}

const DEFAULT_BASE=[srgbToLinear(0x74/255),srgbToLinear(0x83/255),srgbToLinear(0x59/255)];
const ROCK_TINT=[srgbToLinear(0x7a/255),srgbToLinear(0x78/255),srgbToLinear(0x70/255)];

/**
 * Compute linear RGB vertex colors with baked concavity ambient occlusion
 * and subtle slope-based rock tinting for a heightmap terrain.
 */
export function computeTerrainVertexColors(terrain){
 const n=terrain.size,spacing=terrain.spacing,heights=terrain.heights,src=terrain.colors;
 const colors=new Float32Array(n*n*3);
 const at=(x,z)=>heights[clamp(x,0,n-1)*n+clamp(z,0,n-1)];

 for(let x=0;x<n;x++){
  const dx=x>0&&x<n-1?2*spacing:spacing;
  for(let z=0;z<n;z++){
   const dz=z>0&&z<n-1?2*spacing:spacing;
   const k=x*n+z,h=heights[k];

   // 4-neighbor concavity: negative diff means vertex sits in a hollow/valley.
   const avg=(at(x-1,z)+at(x+1,z)+at(x,z-1)+at(x,z+1))*.25;
   const diff=(h-avg)/spacing;
   const ao=diff<0?1-clamp(-diff*.45,0,.35):1+clamp(diff*.15,0,.08);

   // Finite-difference slope for subtle exposed-rock tinting on steep faces.
   const dhdx=(at(x+1,z)-at(x-1,z))/dx;
   const dhdz=(at(x,z+1)-at(x,z-1))/dz;
   const slope=Math.hypot(dhdx,dhdz);
   const rockMix=smoothstep(.45,1.1,slope)*.45;

   let r,g,b;
   if(src){
    r=srgbToLinear(src[k*3]/255);
    g=srgbToLinear(src[k*3+1]/255);
    b=srgbToLinear(src[k*3+2]/255);
   }else{
    [r,g,b]=DEFAULT_BASE;
   }

   r=(r+(ROCK_TINT[0]-r)*rockMix)*ao;
   g=(g+(ROCK_TINT[1]-g)*rockMix)*ao;
   b=(b+(ROCK_TINT[2]-b)*rockMix)*ao;

   colors.set([clamp(r,0,1),clamp(g,0,1),clamp(b,0,1)],k*3);
  }
 }
 return colors;
}
