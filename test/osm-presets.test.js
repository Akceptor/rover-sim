import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {locationPresets} from '../src/locations.js';
import {loadOsmOverlay} from '../src/osm-cache.js';
import {overlayGeometry} from '../src/osm.js';
import {Physics} from '../src/physics.js';
import {loadConfig} from '../src/config.js';
import {terrainHeight} from '../src/terrain.js';

test('every existing preset has an attributed offline OSM snapshot matching its terrain, with usable collision geometry',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-presets-'));
 try{
 for(const preset of locationPresets){
  const t=JSON.parse(await fs.readFile(new URL(`../assets/terrain/${preset.terrain}`,import.meta.url)));
  const result=await loadOsmOverlay(t,{cacheDir:path.join(dir,preset.id),fetcher:()=>assert.fail(`${preset.id} contacted Overpass`)});
  assert.equal(result.status,'ready',preset.id);assert.equal(result.bundled,true,preset.id);assert.equal(result.cached,true);
  assert.equal(result.overlay.source.license,'ODbL-1.0');assert.equal(result.overlay.source.copyright,'https://www.openstreetmap.org/copyright');assert.ok(result.overlay.source.osmTimestamp);
  assert.ok(result.overlay.roads.length>0,preset.id);if(preset.id!=='cusco')assert.ok(result.overlay.buildings.length>0,preset.id);
  const geometry=overlayGeometry(result.overlay,t);
  for(const road of geometry.roads)for(let i=0;i<road.vertices.length;i+=3){const [x,y,z]=road.vertices.slice(i,i+3);assert.ok(Math.abs(y-terrainHeight(t,x,z)-.035)<1e-6,`${preset.id} road alignment`);}
  const physics=await Physics.create(loadConfig().vehicle,true,t,result.overlay,geometry);
  try{for(let i=0;i<10;i++)physics.step(.01,0,0);assert.ok(Object.values(physics.state().position).every(Number.isFinite),`${preset.id} valid physics`);}finally{physics.free();}
 }
 assert.deepEqual(await fs.readdir(dir),[],'bundled data does not need runtime cache writes');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
