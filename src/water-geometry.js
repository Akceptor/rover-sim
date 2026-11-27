import {ShapeUtils,Vector2} from 'three';
import {terrainHeight} from './terrain.js';
import {insideRing} from './osm-footprints.js';
import {waterFeatures} from './water.js';

const MAX_TRIANGLES=200000,MAX_WORK=4000000,EPS=1e-10;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
// Sutherland-Hodgman clipping, retaining an interpolated crossing exactly.
function clip(poly,distance){
 const out=[];if(!poly.length)return out;
 let a=poly.at(-1),da=distance(a);
 for(const b of poly){const db=distance(b);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}if(db>=0)out.push(b);a=b;da=db;}
 return out;
}
function convex(poly,triangle){
 const sign=cross(...triangle)>=0?1:-1;
 for(let i=0;i<3&&poly.length;i++)poly=clip(poly,p=>sign*cross(triangle[i],triangle[(i+1)%3],p));
 return poly;
}
function triangulate(outer,holes=[]){
 const rings=[outer,...holes].map(r=>r.length>1&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r.slice(0,-1):r),points=rings.flat(),vectors=rings.map(r=>r.map(p=>new Vector2(...p)));
 return ShapeUtils.triangulateShape(vectors[0],vectors.slice(1)).map(ids=>ids.map(i=>points[i]));
}
function bounds(points){
 let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
 for(const [x,z]of points){x0=Math.min(x0,x);z0=Math.min(z0,z);x1=Math.max(x1,x);z1=Math.max(z1,z);}return [x0,z0,x1,z1];
}
function subtract(poly,triangle){
 const sign=cross(...triangle)>=0?1:-1,out=[];let remaining=poly;
 for(let i=0;i<3&&remaining.length;i++){
  const distance=p=>sign*cross(triangle[i],triangle[(i+1)%3],p),outside=clip(remaining,p=>-distance(p));
  if(outside.length>=3)out.push(outside);remaining=clip(remaining,distance);
 }
 return out;
}
export function prepareWater(overlay,terrain){
 const result={features:[],omitted:0,mismatched:0};if(!terrain)return result;
 const half=(terrain.size-1)*terrain.spacing/2,n=terrain.size-1,spacing=terrain.spacing;
 let work=0,total=0;
 const spend=(amount=1)=>{work+=amount;if(work>MAX_WORK)throw Error('Water preparation budget exceeded');};
 const sources=waterFeatures(overlay)??[];
 // Polygon metadata and islands override independently mapped centerlines.
 // Mask the complete outer domain, including its dry holes and clipped banks.
 const masks=[];
 for(const f of sources)if(f.outer){
  try{spend(f.outer.length);for(const triangle of triangulate(f.outer))masks.push({triangle,bounds:bounds(triangle)});}
  catch{return {...result,omitted:sources.length};}
 }
 const patch=poly=>{
  for(const distance of [p=>p[0]+half,p=>half-p[0],p=>p[1]+half,p=>half-p[1]])poly=clip(poly,distance);
  return poly;
 };
 const inWater=(f,x,z)=>insideRing(f.outer,x,z)&&!(f.holes??[]).some(h=>insideRing(h,x,z));
 function level(f){
  let lowest=Infinity;
  for(const ring of [f.outer,...(f.holes??[])])for(let i=0;i<ring.length;i++){
   spend();const a=ring[i],b=ring[(i+1)%ring.length];
   // Clip a segment parametrically before sampling, including distant endpoints.
   let lo=0,hi=1;
   for(let axis=0;axis<2;axis++){
    const delta=b[axis]-a[axis];if(!delta){if(Math.abs(a[axis])>half){hi=-1;break;}continue;}
    const t0=(-half-a[axis])/delta,t1=(half-a[axis])/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
   }
   if(lo>hi)continue;
   const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*(hi-lo)/(spacing/2)));spend(count+1);
   for(let j=0;j<=count;j++){const t=lo+(hi-lo)*j/count,x=Math.max(-half,Math.min(half,a[0]+(b[0]-a[0])*t)),z=Math.max(-half,Math.min(half,a[1]+(b[1]-a[1])*t));lowest=Math.min(lowest,terrainHeight(terrain,x,z));}
  }
  if(!Number.isFinite(lowest)){
   for(let i=0;i<=n;i++)for(let j=0;j<=n;j++){spend();const x=i*spacing-half,z=j*spacing-half;if(inWater(f,x,z))lowest=Math.min(lowest,terrain.heights[i*terrain.size+j]);}
   // A small polygon may contain no terrain node.
   if(!Number.isFinite(lowest))for(const tri of triangulate(f.outer,f.holes??[])){
    const clipped=patch(tri);for(const p of clipped){spend();lowest=Math.min(lowest,terrainHeight(terrain,...p));}
   }
  }
  return lowest+.05;
 }
 for(const f of sources){
  if(f.depth===0)continue;
  if(work>MAX_WORK){result.omitted++;continue;}
  try{
   let underfilled=false;
   const vertices=[],flat=!!f.outer&&f.type!=='river',height=flat?level(f):null;
   let triangles=[];
   if(f.outer){spend(f.outer.length+(f.holes??[]).reduce((s,h)=>s+h.length,0));triangles=triangulate(f.outer,f.holes??[]);}
   else for(let i=1;i<f.points.length;i++){
    spend();const a=f.points[i-1],b=f.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;
    const dx=-(b[1]-a[1])*f.width/(2*length),dz=(b[0]-a[0])*f.width/(2*length),p=[a[0]+dx,a[1]+dz],q=[a[0]-dx,a[1]-dz],r=[b[0]+dx,b[1]+dz],s=[b[0]-dx,b[1]-dz];triangles.push([p,q,r],[q,s,r]);
   }
   for(const tri of triangles){
    spend();let fragments=[patch(tri)];
    if(!f.outer)for(const hole of masks){
     const [a,b,c,d]=hole.bounds,next=[];
     for(const poly of fragments){spend();const [x0,z0,x1,z1]=bounds(poly);if(x1<a||x0>c||z1<b||z0>d)next.push(poly);else next.push(...subtract(poly,hole.triangle));}fragments=next;
    }
    for(const poly of fragments){if(poly.length<3)continue;const [x0,z0,x1,z1]=bounds(poly),cell=v=>Math.max(0,Math.min(n-1,Math.floor((v+half)/spacing)));
     for(let i=cell(x0);i<=cell(x1);i++)for(let j=cell(z0);j<=cell(z1);j++){
      spend();const x=i*spacing-half,z=j*spacing-half,a=[x,z],b=[x,z+spacing],c=[x+spacing,z],d=[x+spacing,z+spacing];
      for(const ground of [[a,b,c],[b,d,c]]){
       let clipped=convex(poly,ground);if(flat){
        const area=clipped.reduce((sum,p,k)=>sum+p[0]*clipped[(k+1)%clipped.length][1]-p[1]*clipped[(k+1)%clipped.length][0],0);
        if(Math.abs(area)>EPS&&clipped.some(p=>terrainHeight(terrain,...p)>height+1e-8))underfilled=true;
        clipped=clip(clipped,p=>height-terrainHeight(terrain,...p));
       }
       for(let k=1;k<clipped.length-1;k++){
        const triangle=[clipped[0],clipped[k],clipped[k+1]];if(Math.abs(cross(...triangle))<EPS)continue;
        if(total+vertices.length/9+1>MAX_TRIANGLES)throw Error('Water triangle budget exceeded');
        // Counterclockwise viewed from above (+Y).
        if(cross(...triangle)>0)triangle.reverse();
        for(const p of triangle)vertices.push(p[0],flat?height:terrainHeight(terrain,...p)+.05,p[1]);
       }
      }
     }
    }
   }
   if(vertices.length){result.features.push({id:f.id,type:f.type,depth:f.depth,seasonal:f.seasonal,vertices});total+=vertices.length/9;}
   if((f.outer&&!vertices.length)||underfilled)result.mismatched++;
  }catch{result.omitted++;}
 }
 return result;
}
