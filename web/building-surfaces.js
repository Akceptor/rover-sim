// Render-only surface layout. The input mesh and its Rapier prisms are never mutated.
export function buildingStyle(id){
 let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 return {finish:['plaster','brick','concrete'][hash%3],tone:(hash>>>5)%3,roof:(hash>>>8)%3};
}
export function buildingSurfaces(b){
 const part=()=>({positions:[],uv:[]}),walls=part(),foundation=part(),roof=part(),n=b.vertices.length/6;
 const point=id=>b.vertices.slice(id*3,id*3+3),edges=new Map();
 const height=b.height??Math.min(6,b.top-b.bottom),base=Math.max(b.bottom,b.top-height),floors=Math.max(1,Math.round(height/3)),storey=(b.top-base)/floors;
 for(let k=0;k<b.indices.length;k+=3){
  const tri=b.indices.slice(k,k+3);
  if(tri.every(id=>point(id)[1]===b.top)){for(const id of tri){const p=point(id);roof.positions.push(...p);roof.uv.push(p[0]/4,p[2]/4);}continue;}
  const ids=[...new Set(tri.map(id=>id%n))].sort((a,c)=>a-c);
  if(ids.length===2)edges.set(ids.join(','),ids.map(point));
 }
 let door=null;
 for(const [a,c]of edges.values()){
  const dx=c[0]-a[0],dz=c[2]-a[2],length=Math.hypot(dx,dz);if(length<1e-6)continue;
  function quad(target,start,end,low,high,windowed=false){
   if(end-start<1e-6||high-low<1e-6)return;
   const p=(u,y)=>[a[0]+dx*u/length,y,a[2]+dz*u/length];
   const coords=[[start,low],[end,low],[start,high],[end,low],[end,high],[start,high]];
   for(const [u,y]of coords){target.positions.push(...p(u,y));target.uv.push(windowed?(u-start)/2.8:u/2.8,windowed?(y-base)/storey:y/3);}
  }
  quad(foundation,0,length,b.bottom,base);
  const bays=Math.floor(length/2.8),margin=(length-bays*2.8)/2;
  if(bays&&height>=2.4){quad(foundation,0,margin,base,b.top);quad(walls,margin,length-margin,base,b.top,true);quad(foundation,length-margin,length,base,b.top);}
  else quad(foundation,0,length,base,b.top);
  if(length>=2.5&&height>=2.4&&(!door||length>door.edgeLength)){
   // Place the door on a blank seam between window bays where possible.
   const along=Math.max(.6,Math.min(length-.6,margin+Math.round(bays/2)*2.8));
   door={x:a[0]+dx*along/length,z:a[2]+dz*along/length,base,angle:Math.atan2(-dz,dx),height:2.2,edgeLength:length};
  }
 }
 return {walls,foundation,roof,door};
}
