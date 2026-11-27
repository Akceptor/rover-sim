import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {terrain as fixture,osm} from './fixtures/osm.js';
import {processOsm} from '../src/osm.js';
import {SavedLocations} from '../src/saved-locations.js';
import {validateOsmOverlay} from '../src/osm-cache.js';
import {loadConfig} from '../src/config.js';

const input=(extra={})=>{const terrain={...structuredClone(fixture),colors:Array(fixture.size**2*3).fill(123),source:{provider:'synthetic',license:'test',tiles:['a']}};return {name:' My place ',terrain,overlay:processOsm(osm,terrain,{defaultHeight:9}),timeZone:'Europe/Kyiv',defaultHeight:9,...extra};};
async function temporary(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'saved-locations-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
const uuid=id=>id.slice('saved:'.length);

test('round trip snapshots all data, survives restart and permits multiple names at one origin',async t=>{
 const directory=await temporary(t),store=new SavedLocations({directory}),data=input(),expected=structuredClone(data);
 const pending=store.save(data);data.terrain.colors[0]=1;data.overlay.buildings[0].height=99;
 const summary=await pending;assert.match(summary.id,/^saved:[0-9a-f-]{36}$/);assert.equal(summary.name,'My place');assert.equal(summary.favorite,true);assert.equal(summary.description,'Available offline');assert.equal(summary.lat,0);assert.equal(summary.lon,0);assert.equal(summary.reliefM,0);assert.equal(summary.timeZone,'Europe/Kyiv');
 const restarted=new SavedLocations({directory}),saved=await restarted.read(summary.id);
 assert.deepEqual(saved.terrain,expected.terrain);assert.deepEqual(saved.overlay,expected.overlay);
 assert.deepEqual(saved.manifest,{version:1,id:summary.id,name:'My place',createdAt:saved.manifest.createdAt,home:expected.terrain.home,size:33,spacing:5,timeZone:'Europe/Kyiv',defaultHeight:9,waterSettings:{maxCrossingDepth:.2},attribution:saved.manifest.attribution});assert.ok(Number.isFinite(Date.parse(saved.manifest.createdAt)));
 assert.deepEqual(saved.manifest.attribution.osm,{text:'© OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright'});
 const second=await store.save(input({name:'Second name'}));assert.notEqual(second.id,summary.id);assert.equal((await restarted.list()).length,2);
});

test('empty OSM is valid and shared validator preserves overlay identity and height key',async t=>{
 const directory=await temporary(t),data=input();data.overlay=processOsm({elements:[]},data.terrain,{defaultHeight:9});
 assert.equal(validateOsmOverlay(data.overlay,data.terrain,{defaultHeight:9}),data.overlay);
 assert.throws(()=>validateOsmOverlay(data.overlay,data.terrain),/OSM/);
 const store=new SavedLocations({directory}),summary=await store.save(data);assert.deepEqual((await store.read(summary.id)).overlay,data.overlay);
});

test('rejects unsafe names, IDs, missing imagery and mismatched overlays before publishing',async t=>{
 const directory=await temporary(t),store=new SavedLocations({directory});
 for(const name of ['', '   ','x'.repeat(81),'bad\nname','bad\u007fname',3])await assert.rejects(store.save(input({name})),/name/i);
 for(const id of ['../outside','saved:../../outside',randomUUID(),'saved:'+randomUUID()+'/..','saved:'+randomUUID()+'\n']){
  await assert.rejects(store.read(id),/id/i);await assert.rejects(store.remove(id),/id/i);
 }
 const noColors=input();delete noColors.terrain.colors;await assert.rejects(store.save(noColors),/colo|imagery/i);
 const mismatch=input();mismatch.overlay.key+='bad';await assert.rejects(store.save(mismatch),/OSM/);
 await assert.rejects(store.save(input({defaultHeight:0})),/height/i);
 assert.deepEqual(await store.list(),[]);assert.deepEqual(await fs.readdir(directory),[]);
});

test('missing storage lists empty, corrupt packages are reported, omitted and preserved',async t=>{
 const directory=path.join(await temporary(t),'missing'),reports=[],store=new SavedLocations({directory,report:error=>reports.push(error)});assert.deepEqual(await store.list(),[]);
 const good=await store.save(input());
 for(const [file,mutate] of [
  ['manifest.json',v=>({...v,id:'saved:'+randomUUID()})],
  ['manifest.json',v=>({...v,home:{...v.home,lon:10}})],
  ['manifest.json',v=>({...v,size:5})],
  ['manifest.json',v=>({...v,spacing:3})],
  ['manifest.json',v=>({...v,defaultHeight:6})],
  ['manifest.json',v=>({...v,version:2})],
  ['manifest.json',v=>({...v,name:'\u0000'})],
  ['manifest.json',v=>({...v,createdAt:'oops'})],
  ['terrain.json',v=>({...v,heights:[]})],
  ['terrain.json',v=>({...v,colors:null})],
  ['overlay.json',v=>({...v,roads:[{id:'bad'}]})],
 ]){
  const summary=await store.save(input()),target=path.join(directory,uuid(summary.id),file),corrupt=JSON.stringify(mutate(JSON.parse(await fs.readFile(target,'utf8'))));await fs.writeFile(target,corrupt);
  await assert.rejects(store.read(summary.id));assert.deepEqual((await store.list()).map(v=>v.id),[good.id]);assert.equal(await fs.readFile(target,'utf8'),corrupt);
  await store.remove(summary.id);
 }
 assert.equal(reports.length,11);
});

test('does not follow package or data file symlinks, and removal isolates the selected package',async t=>{
 const symlink=async(target,link,type)=>{
  try{await fs.symlink(target,link,type);return true;}catch(error){
   if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip(`Windows symlink creation requires unavailable privileges or support (${error.code})`);return false;}
   throw error;
  }
 };
 const root=await temporary(t),directory=path.join(root,'packages'),store=new SavedLocations({directory}),first=await store.save(input()),second=await store.save(input());
 const external=path.join(root,'external');await fs.cp(path.join(directory,uuid(first.id)),external,{recursive:true});
 const linkId='saved:'+randomUUID();if(!await symlink(external,path.join(directory,uuid(linkId)),'dir'))return;
 await assert.rejects(store.read(linkId),/symbolic|directory/i);assert.equal((await store.list()).length,2);await assert.rejects(store.remove(linkId),/symbolic|directory/i);
 const dataFile=path.join(directory,uuid(first.id),'terrain.json');await fs.unlink(dataFile);if(!await symlink(path.join(external,'terrain.json'),dataFile,'file'))return;await assert.rejects(store.read(first.id),/symbolic|file/i);
 await store.remove(first.id);assert.equal((await store.list()).length,1);assert.equal((await store.read(second.id)).manifest.id,second.id);assert.ok(await fs.stat(path.join(external,'terrain.json')));
 await assert.rejects(store.remove(first.id),/not found|ENOENT/i);
});

test('failed destination publishes no package and does not damage existing files',async t=>{
 const directory=await temporary(t),blocked=path.join(directory,'blocked');await fs.writeFile(blocked,'keep');
 await assert.rejects(new SavedLocations({directory:blocked}).save(input()));assert.equal(await fs.readFile(blocked,'utf8'),'keep');assert.deepEqual(await fs.readdir(directory),['blocked']);
});

test('savedLocationsDir configuration requires a nonempty string',async t=>{
 const directory=await temporary(t),file=path.join(directory,'config.json'),base=loadConfig();
 for(const value of ['', '  ',null,1]){await fs.writeFile(file,JSON.stringify({...base,savedLocationsDir:value}));assert.throws(()=>loadConfig(file),/saved locations directory/i);}
 await fs.writeFile(file,JSON.stringify({...base,savedLocationsDir:directory}));assert.equal(loadConfig(file).savedLocationsDir,directory);
});

test('serialization failure after writing manifest cleans the temporary package',async t=>{
 const directory=await temporary(t),store=new SavedLocations({directory}),existing=await store.save(input()),data=input();data.terrain.source.unserializable=1n;
 await assert.rejects(store.save(data),/BigInt/);assert.deepEqual(await fs.readdir(directory),[uuid(existing.id)]);assert.deepEqual(await store.list(),[existing]);assert.equal((await store.read(existing.id)).manifest.id,existing.id);
});

test('unknown map time zones round trip as null without requiring weather lookup',async t=>{
 const store=new SavedLocations({directory:await temporary(t)});
 for(const timeZone of [null,undefined]){const summary=await store.save(input({timeZone}));assert.equal(summary.timeZone,null);assert.equal((await store.read(summary.id)).manifest.timeZone,null);}
 await assert.rejects(store.save(input({timeZone:'Not/A_Zone'})),/time zone/i);
});

test('save rejects fixed-offset time zones while accepting named IANA zones and UTC',async t=>{
 const store=new SavedLocations({directory:await temporary(t)});
 for(const timeZone of ['+01:00','-0330','+02'])await assert.rejects(store.save(input({timeZone})),/time zone/i);
 for(const timeZone of ['UTC','Europe/Kyiv','Etc/GMT+1']){const saved=await store.save(input({timeZone}));assert.equal((await store.read(saved.id)).manifest.timeZone,timeZone);}
});

test('read rejects fixed-offset time zones in stored manifests',async t=>{
 const directory=await temporary(t),store=new SavedLocations({directory}),saved=await store.save(input()),file=path.join(directory,uuid(saved.id),'manifest.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));
 for(const timeZone of ['+01:00','-0330','+02']){await fs.writeFile(file,JSON.stringify({...manifest,timeZone}));await assert.rejects(store.read(saved.id),/time zone/i);}
});
