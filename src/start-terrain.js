import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateTerrain} from './terrain.js';
import {locationPresets} from './locations.js';
const root=fileURLToPath(new URL('..',import.meta.url)),run=promisify(execFile);
export function terrainImportArguments(home,out){
 // Node treats a separate negative value as another option; inline coordinates work in every hemisphere.
 return [path.join(root,'scripts/import-terrain.mjs'),`--lat=${home.lat}`,`--lon=${home.lon}`,'--name',`Mission Planner ${home.lat.toFixed(5)}, ${home.lon.toFixed(5)}`,'--out',out];
}
async function importPatch(home,out,signal){
 await run(process.execPath,terrainImportArguments(home,out),{cwd:root,signal,timeout:180000,maxBuffer:4*1024*1024});
}
export async function loadStartTerrain(home,{cacheDir=path.join(root,'.run/terrain-cache'),importer=importPatch,signal}={}){
 if(!home||!Number.isFinite(home.lat)||Math.abs(home.lat)>85||!Number.isFinite(home.lon)||Math.abs(home.lon)>180)throw Error('Invalid start coordinates');
 const read=async file=>{
  const terrain=validateTerrain(JSON.parse(await fs.readFile(file,'utf8')));
  if(Math.abs(terrain.home.lat-home.lat)>1e-7||Math.abs(terrain.home.lon-home.lon)>1e-7)throw Error('Terrain origin differs from selected start');
  return terrain;
 };
 signal?.throwIfAborted();
 // Bundled presets are an offline cache for their exact origins.
 const bundled=locationPresets.find(p=>Math.abs(home.lat-p.lat)<1e-7&&Math.abs(home.lon-p.lon)<1e-7);
 if(bundled)return {terrain:await read(path.join(root,'assets/terrain',bundled.terrain)),cached:true};
 const file=path.join(cacheDir,`${home.lat.toFixed(7)}_${home.lon.toFixed(7)}.json`);
 try{return {terrain:await read(file),cached:true};}catch(error){if(error.name==='AbortError')throw error;}
 await fs.mkdir(cacheDir,{recursive:true});const temp=`${file}.${process.pid}.tmp`;
 try{
  await importer(home,temp,signal);signal?.throwIfAborted();const terrain=await read(temp);
  await fs.rename(temp,file);return {terrain,cached:false};
 }finally{await fs.rm(temp,{force:true});}
}
