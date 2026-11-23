import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const model=()=>import('../src/osm-settings-model.js');
test('automatic OSM routing follows extract coverage, including coasts and whole-patch boundaries',async()=>{
 const {resolveOsmEndpoint}=await model();
 for(const [lat,lon,server]of [[50.3375,30.475,'europe'],[49.84,24.03,'europe'],[-12.04,-77.04,'south-america'],[-13.53,-71.97,'south-america'],[40.75,-73.98,'north-america'],[14.63,-90.5,'central-america'],[-1.29,36.82,'africa'],[35.68,139.77,'asia'],[-33.87,151.21,'oceania'],[41,29,'europe'],[36.75,3.05,'africa'],[21.42,39.83,'asia'],[1.5,124.8,'asia'],[-85,0,'global']]){
  const resolved=resolveOsmEndpoint({server:'auto'},[lat-.005,lon-.005,lat+.005,lon+.005]);
  assert.equal(resolved.server,server,`${lat},${lon}`);assert.match(resolved.endpoint,/^https:/);
 }
 assert.equal(resolveOsmEndpoint({server:'auto'},[35,2,39,6]).server,'global','patch crosses regional boundary');
 assert.equal(resolveOsmEndpoint({server:'auto'},null).server,'global');
 assert.equal(resolveOsmEndpoint({server:'auto'},[-1,-181,1,181]).server,'global');
});
test('manual endpoints override region and existing backend configuration keeps its explicit endpoint',async()=>{
 const {resolveOsmEndpoint,settingsFromConfig}=await model();
 assert.equal(resolveOsmEndpoint({server:'global'},[50,30,51,31]).server,'global');
 assert.equal(resolveOsmEndpoint({server:'custom',endpoint:'http://localhost:1234/osm'},[50,30,51,31]).endpoint,'http://localhost:1234/osm');
 assert.equal(settingsFromConfig({endpoint:'https://example.com/osm',timeoutMs:500}).server,'custom');
 assert.equal(settingsFromConfig({endpoint:'https://example.com/osm',timeoutMs:500}).timeoutMs,500);
 assert.equal(settingsFromConfig(undefined).server,'auto');
});
test('settings validation rejects unsafe URLs, unknown fields, server choices and invalid timeout',async()=>{
 const {validateOsmSettings}=await model();
 const good={server:'custom',endpoint:'http://localhost:1234/osm',timeoutMs:30000};
 assert.deepEqual(validateOsmSettings(good),good);
 for(const patch of [{server:'invalid'},{endpoint:'file:///tmp/foo'},{endpoint:'https://user:pass@example.com'},{endpoint:'https://example.com/#token'},{timeoutMs:0},{timeoutMs:120001},{timeoutMs:1.5},{timeoutMs:'30000'},{cacheDir:'/tmp/elsewhere'}])assert.throws(()=>validateOsmSettings({...good,...patch}));
 assert.throws(()=>validateOsmSettings(null));assert.throws(()=>validateOsmSettings([]));
});
test('OSM preferences persist beside the selected config without modifying it; failed writes retain saved data',async()=>{
 const {OsmSettingsStore}=await import('../src/osm-settings.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'osm-settings-'));
 try{
  const configPath=path.join(dir,'config.json'),config='{"osm":{"cacheDir":"keep-me"},"httpPort":8090}\n';await fs.writeFile(configPath,config);
  const store=new OsmSettingsStore(configPath),preferences={server:'europe',endpoint:'',timeoutMs:45000};
  assert.equal(await store.load(),null);await store.save(preferences);
  assert.deepEqual(await new OsmSettingsStore(configPath).load(),preferences);assert.equal(await fs.readFile(configPath,'utf8'),config);
  await assert.rejects(store.save({...preferences,timeoutMs:-1}));assert.deepEqual(await store.load(),preferences);
  // Atomic replacement must fail rather than claiming success or damaging the original config.
  const blocked=new OsmSettingsStore(path.join(dir,'missing','config.json'));await fs.writeFile(path.join(dir,'missing'),'not a directory');
  await assert.rejects(blocked.save(preferences));assert.equal(await fs.readFile(configPath,'utf8'),config);
  assert.equal((await fs.readdir(dir)).some(name=>name.endsWith('.tmp')),false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
