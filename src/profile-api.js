import fs from 'node:fs';
import path from 'node:path';
import {vehiclesDir,vehicleProfiles,readProfileFiles,resolveVehicle} from './vehicles.js';
import {RELOAD_FIELDS} from './profile-fields.js';
const ID=/^[a-z0-9][a-z0-9-]{0,40}$/,MAX_BODY=64*1024,PREFIX='/api/vehicles';
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const dig=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o);
function readBody(req){return new Promise((resolve,reject)=>{
 const chunks=[];let size=0;
 // Keep draining after the limit so the client still receives the 413.
 req.on('data',c=>{size+=c.length;if(size<=MAX_BODY)chunks.push(c);});
 req.on('end',()=>size>MAX_BODY?reject(new HttpError(413,'Request body too large')):resolve(Buffer.concat(chunks).toString('utf8')));
 req.on('error',reject);
});}
async function jsonBody(req){let body;try{body=JSON.parse(await readBody(req));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid JSON body');}if(!plain(body))throw new HttpError(400,'Body must be an object');return body;}
// resolveVehicle fills gaps from mn168, which would hide a truncated profile; saved files must be complete.
function validate(profile,id){
 if(!plain(profile))throw new HttpError(400,'profile must be an object');
 if(profile.id!==id)throw new HttpError(400,'profile.id must match the URL id');
 if('profile' in profile)throw new HttpError(400,'unknown vehicle profile field');
 const full=readProfileFiles('mn168').profile;
 for(const [k,x] of Object.entries(full)){
  if(!(k in profile))throw new HttpError(400,`missing vehicle ${k}`);
  if(plain(x))for(const n of Object.keys(x))if(!plain(profile[k])||!(n in profile[k]))throw new HttpError(400,`missing vehicle ${k}.${n}`);
 }
 try{return resolveVehicle(profile);}catch(e){throw new HttpError(400,e.message);}
}
function write(file,text){const tmp=`${file}.${process.pid}.tmp`;try{fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);}catch(e){fs.rmSync(tmp,{force:true});throw e;}}
export function createProfileApi(ctx){
 return async(req,res,url)=>{
  const raw=req.url.split('?')[0];
  if(raw!==PREFIX&&!raw.startsWith(PREFIX+'/'))return false;
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  try{
   const rest=raw.slice(PREFIX.length+1),parts=rest===''?[]:rest.split('/').map(p=>{try{return decodeURIComponent(p);}catch{throw new HttpError(400,'invalid id');}});
   if(!parts.length){
    if(req.method!=='GET')throw new HttpError(405,'Method not allowed');
    return send(200,{active:ctx.activeId(),profiles:vehicleProfiles.map(p=>({id:p.id,...readProfileFiles(p.id)}))}),true;
   }
   const live=parts.length===2&&parts[1]==='live';
   if(parts.length>2||(parts.length===2&&!live)||!ID.test(parts[0])||(!live&&parts[0]==='custom'))throw new HttpError(400,'invalid id');
   const id=parts[0];
   if(req.method!==(live?'POST':'PUT'))throw new HttpError(405,'Method not allowed');
   if(req.headers.origin!==`http://${req.headers.host}`)throw new HttpError(403,'Cross-origin request refused');
   const body=await jsonBody(req),resolved=validate(body.profile,id);
   if(live){
    if(ctx.activeId()==='custom')throw new HttpError(409,'Active vehicle is an inline config override; edit its profile file and select it');
    if(id!==ctx.activeId())throw new HttpError(409,'Profile is not the active vehicle');
    if(ctx.transitioning())throw new HttpError(409,'Vehicle change in progress');
    ctx.applyLive(resolved);return send(200,{ok:true}),true;
   }
   if(body.sitlParm!==undefined&&body.sitlParm!==null&&typeof body.sitlParm!=='string')throw new HttpError(400,'sitlParm must be a string');
   const active=id===ctx.activeId(),transitioning=active&&ctx.transitioning();
   const reloadNeeded=active&&(transitioning||RELOAD_FIELDS.some(f=>JSON.stringify(dig(resolved,f))!==JSON.stringify(dig(ctx.activeVehicle(),f))));
   const target=path.join(vehiclesDir(),id);fs.mkdirSync(target,{recursive:true});
   write(path.join(target,'vehicle.json'),JSON.stringify(body.profile,null,2)+'\n');
   if(typeof body.sitlParm==='string')write(path.join(target,'sitl.parm'),body.sitlParm);
   if(active&&!transitioning)ctx.applyLive(resolved);
   ctx.afterSave(id);
   send(200,{ok:true,reloadNeeded});return true;
  }catch(e){
   if(!(e instanceof HttpError))console.error(e);
   send(e.status??500,{error:e instanceof HttpError?e.message:'Internal error'});return true;
  }
 };
}
