import {test} from 'node:test';
import assert from 'node:assert/strict';
import {locationPresets,findLocation} from '../src/locations.js';
import {loadStartTerrain} from '../src/start-terrain.js';
test('location presets include requested cities, verified relief and valid offline timezones',()=>{
 for(const id of ['kyiv','lviv','lima','cusco']){
  const p=findLocation(id);assert.ok(p);assert.ok(Math.abs(p.lat)<=85);assert.ok(Math.abs(p.lon)<=180);
  assert.ok(Number.isFinite(p.reliefM)&&p.reliefM>0);assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:p.timeZone}));
 }
 assert.equal(new Set(locationPresets.map(p=>p.id)).size,locationPresets.length);
 assert.ok(locationPresets.some(p=>p.reliefM>150));assert.throws(()=>findLocation('invalid'),/Unknown location/);
});
test('all preset terrain and satellite colours are bundled, attributed, and load without network',async()=>{
 for(const p of locationPresets){
  const {terrain,cached}=await loadStartTerrain(p,{importer:async()=>assert.fail('bundled preset must never download')});
  assert.equal(cached,true);assert.equal(terrain.home.lat,p.lat);assert.equal(terrain.home.lon,p.lon);
  assert.equal(terrain.colors.length,terrain.heights.length*3);assert.match(terrain.attribution,/Google.*Copernicus/);
  assert.ok(terrain.sources.elevation.asset.startsWith('https://'));assert.ok(terrain.sources.imagery.asset.startsWith('https://'));
  const relief=Math.max(...terrain.heights)-Math.min(...terrain.heights);assert.ok(Math.abs(relief-p.reliefM)<2,`${p.id}: ${relief}`);
 }
});
