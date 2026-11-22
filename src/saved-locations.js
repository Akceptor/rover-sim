import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateTerrain} from './terrain.js';
import {validateOsmOverlay} from './osm-cache.js';

const osmAttribution={text:'© OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright'};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function packageUuid(id){
 if(typeof id!=='string'||!id.startsWith('saved:')||!uuidPattern.test(id.slice(6)))throw Error('Invalid saved location ID');
 return id.slice(6);
}
function validateName(name){
 if(typeof name!=='string'||/[\u0000-\u001f\u007f-\u009f]/u.test(name)||!name.trim()||name.trim().length>80)throw Error('Invalid saved location name (use 1–80 characters without controls)');
 return name.trim();
}
function validateSettings(timeZone,defaultHeight){
 if(timeZone!==null){
  if(typeof timeZone!=='string'||!timeZone||/^[+-]/.test(timeZone))throw Error('Invalid saved location time zone');
  try{new Intl.DateTimeFormat('en',{timeZone});}catch{throw Error('Invalid saved location time zone');}
 }
 if(!Number.isFinite(defaultHeight)||defaultHeight<=0||defaultHeight>500)throw Error('Invalid saved location default height');
}
function validateData(terrain,overlay,defaultHeight){
 validateTerrain(terrain);
 if(!Array.isArray(terrain.colors))throw Error('Saved locations require satellite RGB colours');
 validateOsmOverlay(overlay,terrain,{defaultHeight});
}
function summary({manifest,terrain}){
 let min=Infinity,max=-Infinity;for(const height of terrain.heights){min=Math.min(min,height);max=Math.max(max,height);}
 return {id:manifest.id,name:manifest.name,favorite:true,description:'Available offline',lat:terrain.home.lat,lon:terrain.home.lon,timeZone:manifest.timeZone,reliefM:max-min};
}
async function requireDirectory(directory){
 const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Saved location must be a directory, not a symbolic link');
}
async function readJson(file){
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Saved location data must be a regular file, not a symbolic link');
 return JSON.parse(await fs.readFile(file,'utf8'));
}

export class SavedLocations {
 constructor({directory,report=()=>{}}){
  if(typeof directory!=='string'||!directory.trim())throw Error('Saved locations directory is required');
  this.directory=directory;this.report=report;
 }
 async list(){
  let entries;
  try{await requireDirectory(this.directory);entries=await fs.readdir(this.directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const locations=[];
  for(const entry of entries){
   if(entry.name.startsWith('.tmp-'))continue;
   try{
    if(!uuidPattern.test(entry.name))throw Error('Invalid saved location package ID');
    locations.push(summary(await this.read('saved:'+entry.name)));
   }catch(error){this.report(error);}
  }
  return locations;
 }
 async save({name,terrain,overlay,timeZone=null,defaultHeight=6}){
  name=validateName(name);validateSettings(timeZone,defaultHeight);
  // Clone before the first await: callers may replace or mutate their world while disk I/O runs.
  const data=structuredClone({terrain,overlay});validateData(data.terrain,data.overlay,defaultHeight);
  const uuid=randomUUID(),id='saved:'+uuid;
  const manifest={version:1,id,name,createdAt:new Date().toISOString(),home:structuredClone(data.terrain.home),size:data.terrain.size,spacing:data.terrain.spacing,timeZone,defaultHeight,attribution:{osm:{...osmAttribution}}};
  const files={manifest,...data};
  await fs.mkdir(this.directory,{recursive:true});await requireDirectory(this.directory);
  const temp=await fs.mkdtemp(path.join(this.directory,'.tmp-'));
  try{
   // Sequential writes ensure every pending write is finished before failure cleanup.
   for(const [name,value]of Object.entries(files))await fs.writeFile(path.join(temp,name+'.json'),JSON.stringify(value)+'\n',{flag:'wx'});
   await fs.rename(temp,path.join(this.directory,uuid));
  }catch(error){await fs.rm(temp,{recursive:true,force:true});throw error;}
  return summary(files);
 }
 async read(id){
  const uuid=packageUuid(id);await requireDirectory(this.directory);
  const directory=path.join(this.directory,uuid);await requireDirectory(directory);
  const manifest=await readJson(path.join(directory,'manifest.json'));
  if(!manifest||manifest.version!==1||manifest.id!==id||validateName(manifest.name)!==manifest.name||typeof manifest.createdAt!=='string'||!Number.isFinite(Date.parse(manifest.createdAt)))throw Error('Invalid saved location manifest');
  validateSettings(manifest.timeZone,manifest.defaultHeight);
  const terrain=await readJson(path.join(directory,'terrain.json')),overlay=await readJson(path.join(directory,'overlay.json'));
  validateData(terrain,overlay,manifest.defaultHeight);
  if(manifest.size!==terrain.size||manifest.spacing!==terrain.spacing||!manifest.home||['lat','lon','alt'].some(key=>manifest.home[key]!==terrain.home[key]))throw Error('Saved location manifest does not match terrain');
  return {manifest,terrain,overlay};
 }
 async remove(id){
  const uuid=packageUuid(id);await requireDirectory(this.directory);
  const directory=path.join(this.directory,uuid);await requireDirectory(directory);
  await fs.rm(directory,{recursive:true});
 }
}
