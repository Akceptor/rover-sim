import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {loadStartTerrain} from '../src/start-terrain.js';
const home={lat:50.3385,lon:30.4765,alt:190};
const patch=()=>({version:1,name:'Picked start',size:3,spacing:7.5,home:{...home},heights:Array(9).fill(0),attribution:'Test source'});
test('picked start loads terrain once and reuses validated cached data offline',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'start-terrain-'));let calls=0;
 const importer=async(h,out)=>{calls++;assert.equal(h.lat,home.lat);await fs.writeFile(out,JSON.stringify(patch()));};
 try{
  const first=await loadStartTerrain(home,{cacheDir:dir,importer});assert.equal(first.terrain.home.lat,home.lat);assert.equal(first.cached,false);
  const second=await loadStartTerrain(home,{cacheDir:dir,importer});assert.equal(second.cached,true);assert.equal(calls,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('invalid location and wrong-origin downloads cannot replace a terrain cache',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'start-terrain-'));
 try{
  await assert.rejects(loadStartTerrain({lat:91,lon:0},{cacheDir:dir}),/coordinates/);
  await assert.rejects(loadStartTerrain(home,{cacheDir:dir,importer:async(h,out)=>{const p=patch();p.home.lat+=1;await fs.writeFile(out,JSON.stringify(p));}}),/origin/);
  assert.deepEqual(await fs.readdir(dir),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
