import {metres} from './osm-rings.js';

const defaults={wall:[2,.2,.2],retaining_wall:[2,.2,.2],fence:[1.5,.06,.06],gate:[1.2,.08,3],lift_gate:[1.2,.08,3],entrance:[1,.08,3],bollard:[.8,.15,.15],block:[.6,.6,.6]};
const gateType=type=>['gate','lift_gate','entrance'].includes(type);
const lineType=type=>['wall','retaining_wall','fence','gate','lift_gate','entrance'].includes(type);
const dimension=(value,fallback,max)=>{const n=metres(value);return n&&n<=max?n:fallback;};
function properties(tags){
 const type=tags.barrier,[h,thickness,w]=defaults[type];
 return {type,height:dimension(tags.height,h,10),thickness:dimension(tags.thickness??(!gateType(type)?tags.width:undefined),thickness,2),width:dimension(tags.width??tags['maxwidth:physical'],w,gateType(type)?20:2),open:type==='entrance'||(gateType(type)&&String(tags.open).trim().toLowerCase()==='yes')};
}
function clip(a,b,half){
 let lo=0,hi=1;
 for(let i=0;i<2;i++){const d=b[i]-a[i];if(!d){if(Math.abs(a[i])>half)return null;continue;}const p=(-half-a[i])/d,q=(half-a[i])/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}
 return hi>lo?[a.map((v,i)=>v+(b[i]-v)*lo),a.map((v,i)=>v+(b[i]-v)*hi)]:null;
}
export function processBarriers(data,terrain,nodes,ways){
 const half=(terrain.size-1)*terrain.spacing/2,barriers=[],raw=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e])),directions=new Map(),represented=new Set(),inferredWidths=new Map(),gateWays=new Map();
 const ordered=[...ways.values()].sort((a,b)=>(gateType(a.tags?.barrier)?0:1)-(gateType(b.tags?.barrier)?0:1)||a.id-b.id);
 for(const way of ordered){
  const type=way.tags?.barrier,isLine=lineType(type);
  if(!isLine&&!way.tags?.highway)continue;
  for(let i=0;i<(way.nodes?.length??0);i++){
   const id=way.nodes[i],point=nodes.get(id);if(!point||!gateType(raw.get(id)?.tags?.barrier))continue;
   const before=nodes.get(way.nodes[i-1])??point,after=nodes.get(way.nodes[i+1])??point;
   if(Math.hypot(after[0]-before[0],after[1]-before[1])>.001&&(!directions.has(id)||isLine))directions.set(id,Math.atan2(after[1]-before[1],after[0]-before[0])+(isLine?0:Math.PI/2));
  }
  if(gateType(type)&&way.nodes?.length>=2&&way.nodes.length<=4096&&way.nodes.every(id=>nodes.has(id))){
   const points=way.nodes.map(id=>nodes.get(id)),length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
   for(const id of way.nodes){if(type!=='entrance'&&['gate','lift_gate'].includes(raw.get(id)?.tags?.barrier))represented.add(id);if(length>0&&length<=20)inferredWidths.set(id,length);if(!gateWays.has(id))gateWays.set(id,[]);gateWays.get(id).push(points);}
  }
 }
 const add=(id,props,points,endPosts=[false,false])=>{
  if(barriers.length>=2048)return;
  if(points.length===1){if(Math.abs(points[0][0])>half||Math.abs(points[0][1])>half)return;}
  else {const cut=clip(points[0],points[1],half);if(!cut)return;endPosts=endPosts.map((v,i)=>v&&Math.hypot(...cut[i].map((x,j)=>x-points[i][j]))<.001);points=cut;}
  barriers.push({id,...props,points,endPosts});
 };
 for(const n of [...raw.values()].sort((a,b)=>a.id-b.id)){
  const type=n.tags?.barrier;if(!Object.hasOwn(defaults,type)||['wall','retaining_wall','fence'].includes(type)||represented.has(n.id)||!nodes.has(n.id))continue;
  const props=properties(n.tags),point=nodes.get(n.id);
  if(gateType(type)){
   const angle=directions.get(n.id)??Math.PI/2,dx=Math.cos(angle)*props.width/2,dz=Math.sin(angle)*props.width/2;
   add(`node/${n.id}`,props,[[point[0]-dx,point[1]-dz],[point[0]+dx,point[1]+dz]],[true,true]);
  }else add(`node/${n.id}`,props,[point]);
 }
 for(const way of ordered){
  const type=way.tags?.barrier;if(!lineType(type)||(way.nodes?.length??0)>4096)continue;
  const props=properties(way.tags),runs=[];let run=[];
  for(const id of way.nodes??[]){const point=nodes.get(id);if(point)run.push({id,point});else{if(run.length>1)runs.push(run);run=[];}}if(run.length>1)runs.push(run);
  for(const [ri,points]of runs.entries()){
   const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+Math.hypot(...points[i].point.map((v,j)=>v-points[i-1].point[j])));
   const total=distances.at(-1),gaps=[];
   if(!gateType(type))for(let i=0;i<points.length;i++){
    const marker=raw.get(points[i].id)?.tags;if(!gateType(marker?.barrier)||represented.has(points[i].id))continue;
    const width=dimension(marker.width??marker['maxwidth:physical'],inferredWidths.get(points[i].id)??3,20),at=distances[i];gaps.push([at-width/2,at+width/2]);
    if(points[0].id===points.at(-1).id){if(at<width/2)gaps.push([total+at-width/2,total]);if(at+width/2>total)gaps.push([0,at+width/2-total]);}
   }
   if(!gateType(type)){
    const candidates=new Set(points.flatMap(p=>gateWays.get(p.id)??[]));
    for(let i=1;i<points.length;i++){
     const a=points[i-1].point,c=points[i].point,dx=c[0]-a[0],dz=c[1]-a[1],length=distances[i]-distances[i-1];if(length<.001)continue;
     for(const gate of candidates)for(let j=1;j<gate.length;j++){
      const p=gate[j-1],q=gate[j];
      if([p,q].some(v=>Math.abs((v[0]-a[0])*dz-(v[1]-a[1])*dx)/length>.01))continue;
      const project=v=>((v[0]-a[0])*dx+(v[1]-a[1])*dz)/length,lo=Math.max(0,Math.min(project(p),project(q))),hi=Math.min(length,Math.max(project(p),project(q)));
      if(hi-lo>.001)gaps.push([distances[i-1]+lo,distances[i-1]+hi]);
     }
    }
   }
   gaps.sort((a,b)=>a[0]-b[0]);
   const merged=[];for(const gap of gaps){const last=merged.at(-1);if(last&&last[1]>=gap[0])last[1]=Math.max(last[1],gap[1]);else merged.push([...gap]);}
   const effective={...props,open:props.open||(gateType(type)&&points.some(p=>raw.get(p.id)?.tags?.open==='yes'))};
   for(let i=1;i<points.length;i++){
    const start=distances[i-1],end=distances[i],length=end-start;if(length<.001)continue;
    let cursor=start,part=0;
    const emit=(a,b)=>{if(b-a<.001)return;const interpolate=d=>points[i-1].point.map((v,j)=>v+(points[i].point[j]-v)*(d-start)/length);add(`way/${way.id}/${ri}/${i}/${part++}`,effective,[interpolate(a),interpolate(b)],gateType(type)?[i===1&&a===start,i===points.length-1&&b===end]:[false,false]);};
    for(const [a,b]of merged){if(b<=cursor)continue;if(a>=end)break;emit(cursor,Math.min(a,end));cursor=Math.max(cursor,b);if(cursor>=end)break;}if(cursor<end)emit(cursor,end);
   }
  }
 }

 return barriers;
}

export function validBarrierFields(overlay){
 if(overlay.barriers===undefined)return true;
 return Array.isArray(overlay.barriers)&&overlay.barriers.length<=2048&&overlay.barriers.every(b=>b&&typeof b.id==='string'&&Object.hasOwn(defaults,b.type)&&Array.isArray(b.points)&&b.points.length===(['bollard','block'].includes(b.type)?1:2)&&b.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1e7))&&Number.isFinite(b.height)&&b.height>0&&b.height<=10&&Number.isFinite(b.thickness)&&b.thickness>0&&b.thickness<=2&&Number.isFinite(b.width)&&b.width>0&&b.width<=20&&typeof b.open==='boolean'&&(b.type!=='entrance'||b.open)&&Array.isArray(b.endPosts)&&b.endPosts.length===2&&b.endPosts.every(v=>typeof v==='boolean'));
}
