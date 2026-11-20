import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateTerrain} from './terrain.js';
const root=fileURLToPath(new URL('..',import.meta.url)),run=promisify(execFile);
async function importPatch(home,out,signal){
 await run(process.execPath,[path.join(root,'scripts/import-terrain.mjs'),'--lat',String(home.lat),'--lon',String(home.lon),'--name',`Mission Planner ${home.lat.toFixed(5)}, ${home.lon.toFixed(5)}`,'--out',out],{cwd:root,signal,timeout:180000,maxBuffer:4*1024*1024});
}
export async function loadStartTerrain(home,{cacheDir=path.join(root,'.run/terrain-cache'),importer=importPatch,signal}={}){
 if(!home||!Number.isFinite(home.lat)||Math.abs(home.lat)>85||!Number.isFinite(home.lon)||Math.abs(home.lon)>180)throw Error('Invalid start coordinates');
 const read=async file=>{
  const terrain=validateTerrain(JSON.parse(await fs.readFile(file,'utf8')));
  if(Math.abs(terrain.home.lat-home.lat)>1e-7||Math.abs(terrain.home.lon-home.lon)>1e-7)throw Error('Terrain origin differs from selected start');
  return terrain;
 };
 signal?.throwIfAborted();
 // The bundled patch is already an offline cache for its exact origin.
 if(Math.abs(home.lat-50.3375)<1e-7&&Math.abs(home.lon-30.475)<1e-7)return {terrain:await read(path.join(root,'assets/terrain/feofaniya.json')),cached:true};
 const file=path.join(cacheDir,`${home.lat.toFixed(7)}_${home.lon.toFixed(7)}.json`);
 try{return {terrain:await read(file),cached:true};}catch(error){if(error.name==='AbortError')throw error;}
 await fs.mkdir(cacheDir,{recursive:true});const temp=`${file}.${process.pid}.tmp`;
 try{
  await importer(home,temp,signal);signal?.throwIfAborted();const terrain=await read(temp);
  await fs.rename(temp,file);return {terrain,cached:false};
 }finally{await fs.rm(temp,{force:true});}
}
