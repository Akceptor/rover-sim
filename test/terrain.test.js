import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTerrain,terrainMesh,terrainHeight} from '../src/terrain.js';
import {Physics} from '../src/physics.js';
import {loadConfig} from '../src/config.js';
const slope=()=>({version:1,name:'Test slope',size:3,spacing:2,heights:[-.3,-.1,.1,-.2,0,.2,-.1,.1,.3],home:{lat:50,lon:30,alt:150},attribution:'Synthetic test terrain'});
test('terrain grid validates finite samples, geographic origin and centered spawn',()=>{
 assert.equal(validateTerrain(slope()).size,3);
 for(const patch of [{size:4},{spacing:0},{heights:[NaN]},{home:{lat:91,lon:30,alt:150}},{heights:Array(9).fill(1)}])assert.throws(()=>validateTerrain({...slope(),...patch}));
});
test('terrain geometry uses north/up/east with upward triangles and exact triangle sampling',()=>{
 const t=validateTerrain(slope()),{vertices,indices}=terrainMesh(t);
 assert.deepEqual(Array.from(vertices.slice(0,3)).map(x=>Math.round(x*10)/10),[-2,-.3,-2]);
 for(let i=0;i<indices.length;i+=3){const [a,b,c]=Array.from(indices.slice(i,i+3)).map(j=>Array.from(vertices.slice(j*3,j*3+3)));assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0);}
 assert.equal(terrainHeight(t,0,0),0);assert.ok(Math.abs(terrainHeight(t,1,1)-.15)<1e-6);
 assert.throws(()=>terrainHeight(t,3,0),/outside/);
 // Bilinear interpolation would give 0.25; the actual triangle surface is 0.
 const saddle={...slope(),heights:[0,0,0,0,0,0,0,0,1]};assert.equal(terrainHeight(saddle,.5,.5),0);
});
test('Rapier wheels settle on the shared terrain mesh and reset above it',async()=>{
 const p=await Physics.create(loadConfig().vehicle,false,slope());
 try{
  for(let i=0;i<300;i++)p.step(.01,0,0);
  const s=p.state();assert.ok(s.wheels.every(w=>w.contact));
  const clearance=s.position.y-terrainHeight(slope(),s.position.x,s.position.z);assert.ok(clearance>.08&&clearance<.3);assert.ok(Math.abs(s.rotation.x)+Math.abs(s.rotation.z)>.02);
  assert.ok(Math.abs(Math.hypot(...s.sensor.imu.accel_body)-9.80665)<.2);
  p.reset();assert.equal(p.state().position.x,0);assert.equal(p.state().position.z,0);
 }finally{p.free();}
});

test('bundled terrain is complete, attributed and selected consistently with SITL home',async()=>{
 const {loadEnvironment}=await import('../src/environment.js');const {sitlArguments}=await import('../src/launcher.js');
 const config=loadConfig(),e=loadEnvironment(config);
 assert.ok(e.terrain);assert.ok(e.terrain.colors);assert.equal(e.home.lat,50.3375);assert.equal(e.home.lon,30.475);
 assert.ok(e.terrain.attribution.includes('Google'));assert.ok(e.terrain.attribution.includes('Copernicus'));
 assert.ok(Math.max(...e.terrain.heights)-Math.min(...e.terrain.heights)>20);
 assert.equal(terrainHeight(e.terrain,0,0),0);
 const args=sitlArguments(config,{defaults:'config/rover.parm',home:e.home});assert.equal(args[args.indexOf('--home')+1],`${e.home.lat},${e.home.lon},${e.home.alt},0`);
 assert.equal(loadEnvironment(config,undefined,{flat:true}).terrain,null);
 assert.equal(loadEnvironment(config,undefined,{playground:true}).terrain,null);
 assert.equal(loadEnvironment({...config,terrain:null}).terrain,null);
 assert.throws(()=>loadEnvironment({...config,terrain:'/does-not-exist/terrain.json'}),/Cannot load terrain/);
});

test('terrain boundaries tolerate rounding for valid decimal grid spacing',async()=>{
 const {terrainObjects}=await import('../src/terrain.js');
 for(const spacing of [7.3,15.1]){
  const t={...slope(),size:129,spacing,heights:Array(129*129).fill(0)};
  assert.ok(terrainObjects(t).length>0);
  const edge=(t.size-1)*spacing/2;assert.equal(terrainHeight(t,edge+1e-10,0),0);
  assert.throws(()=>terrainHeight(t,edge+.01,0),/outside/);
 }
});
test('GEM tile IDs use catalog encoding in every hemisphere',async()=>{
 const {gemItemUrl}=await import('../src/gem-source.js');
 assert.ok(gemItemUrl(50.3375,30.475).endsWith('/p50_p30/w30s50/w30s50.json'));
 assert.ok(gemItemUrl(40.7,-73.9).endsWith('/p40_m80/wm74s40/wm74s40.json'));
 assert.ok(gemItemUrl(-33.9,151.2).endsWith('/m40_p150/w151sm34/w151sm34.json'));
});
