import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SavedLocations} from '../src/saved-locations.js';
import {processOsm} from '../src/osm.js';
import {loadConfig} from '../src/config.js';
import {terrain} from './fixtures/osm.js';

test('water crossing settings survive saved location reload and invalid settings cannot be published',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rover-water-save-'));
 try{
  const store=new SavedLocations({directory:dir}),t={...terrain,colors:Array(terrain.heights.length*3).fill(120)},overlay=processOsm({elements:[]},t);
  const saved=await store.save({name:'Water policy',terrain:t,overlay,waterSettings:{maxCrossingDepth:.12}});
  assert.deepEqual((await store.read(saved.id)).manifest.waterSettings,{maxCrossingDepth:.12});
  await assert.rejects(store.save({name:'Bad water',terrain:t,overlay,waterSettings:{maxCrossingDepth:NaN}}),/water/i);
  const old=await store.save({name:'Legacy policy',terrain:t,overlay});
  assert.equal((await store.read(old.id)).manifest.waterSettings.maxCrossingDepth,.2);
  const configFile=path.join(dir,'backend.json');
  const config=JSON.parse(await fs.readFile(new URL('../config/default.json',import.meta.url)));
  config.osm={water:{maxCrossingDepth:-1}};await fs.writeFile(configFile,JSON.stringify(config));
  assert.throws(()=>loadConfig(configFile),/water/i);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
