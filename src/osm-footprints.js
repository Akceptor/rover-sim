// Shared footprint tests for generated scenery and OSM processing.
export function insideRing(r,x,z){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>z)!==(r[j][1]>z)&&x<(r[j][0]-r[i][0])*(z-r[i][1])/(r[j][1]-r[i][1])+r[i][0])inside=!inside;return inside;}
function distanceSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz,u=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/d)):0;return Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);}
function nearRing(r,x,z,radius){return r.some((p,i)=>distanceSegment(x,z,p,r[(i+1)%r.length])<=radius);}
export function overlayOccupies(o,x,z,radius=0){
 if(!o)return false;
 return o.buildings.some(b=>(insideRing(b.outer,x,z)&&!b.holes.some(r=>insideRing(r,x,z)))||[b.outer,...b.holes].some(r=>nearRing(r,x,z,radius)))||o.roads.some(r=>r.points.slice(1).some((p,i)=>distanceSegment(x,z,r.points[i],p)<=r.width/2+radius))||barrierOccupies(o.barriers,x,z,radius);
}

export function barrierOccupies(barriers,x,z,radius=0){
 return (barriers??[]).some(b=>{
  if(b.type==='entrance')return false;
  if(b.points.length===1)return Math.hypot(x-b.points[0][0],z-b.points[0][1])<=b.width/2+radius;
  if(!b.open&&distanceSegment(x,z,...b.points)<=b.thickness/2+radius)return true;
  const [a,c]=b.points,dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
  return b.endPosts.some((post,i)=>post&&Math.hypot(x-b.points[i][0]-(i?1:-1)*dx/(length||1)*.06,z-b.points[i][1]-(i?1:-1)*dz/(length||1)*.06)<=.09+radius);
 });
}
