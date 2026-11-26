import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processOsm,overlayGeometry} from '../src/osm.js';
import {validateOsmOverlay} from '../src/osm-cache.js';
import {osm,terrain} from './fixtures/osm.js';

test('downloaded road tags survive processing, geometry and offline validation',()=>{
 const input=structuredClone(osm),way=input.elements.find(e=>e.id===41&&e.type==='way');
 Object.assign(way.tags,{surface:' Mud ',smoothness:'very_bad',tracktype:'grade4'});
 const overlay=processOsm(input,terrain),road=overlay.roads.find(r=>r.id.startsWith('way/41/'));
 assert.equal(road.surface,'mud');assert.equal(road.smoothness,'very_bad');assert.equal(road.tracktype,'grade4');
 assert.equal(overlayGeometry(overlay,terrain).roads.find(r=>r.id===road.id).material,'mud');
 assert.equal(validateOsmOverlay(overlay,terrain),overlay);
 for(const field of ['surface','smoothness','tracktype']){
  const bad=structuredClone(overlay);bad.roads[0][field]={bad:true};
  assert.throws(()=>validateOsmOverlay(bad,terrain),/cache/);
 }
});

test('surface wins over firmness while smoothness only changes rolling loss',async()=>{
 const {roadMaterial}=await import('../src/road-materials.js');
 const asphalt=roadMaterial({surface:'asphalt',tracktype:'grade5',paved:true});
 const rough=roadMaterial({surface:'asphalt',smoothness:'very_bad',paved:true});
 assert.equal(asphalt.id,'asphalt');assert.equal(rough.id,'asphalt');
 assert.equal(rough.grip,roadMaterial({surface:'asphalt'}).grip);
 assert.ok(rough.rolling>asphalt.rolling);
 assert.equal(roadMaterial({tracktype:'grade2',paved:false}).id,'gravel');
 assert.equal(roadMaterial({surface:'future_surface',paved:true}).grip,1);
 assert.equal(roadMaterial({surface:'constructor',tracktype:'constructor',smoothness:'constructor',paved:true}).grip,1);
 for(const paved of [true,false]){const m=roadMaterial({paved});assert.equal(m.grip,1);assert.equal(m.rolling,1);}
 assert.equal(roadMaterial({surface:'mud'}).dust,0);
 assert.notEqual(roadMaterial({paved:false}).id,'ground','legacy road remains distinct from off-road ground for effect height');
 assert.ok(roadMaterial({surface:'dirt',tracktype:'grade5'}).grip<roadMaterial({surface:'dirt',tracktype:'grade1'}).grip);
 assert.equal(roadMaterial({surface:'asphalt'}).marks,0);
});

test('indexed corridor lookup is bounded, includes rounded ends and resolves overlaps consistently',async()=>{
 const {createRoadIndex}=await import('../src/road-index.js');
 const road=(id,surface,points,width=4)=>({id,surface,points,width,paved:surface==='asphalt'});
 const roads=[road('dirt','dirt',[[-50,0],[50,0]]),road('paved','asphalt',[[0,-50],[0,50]])];
 for(const order of [roads,[...roads].reverse()]){
  const at=createRoadIndex({roads:order},terrain);
  assert.equal(at(0,0).id,'asphalt');assert.equal(at(20,0).id,'dirt');
  assert.equal(at(20,2.01).id,'ground');assert.equal(at(51.99,0).id,'dirt');
  assert.equal(at(52.01,0).id,'ground');assert.equal(at(90,0).id,'ground');
  assert.equal(at(NaN,0).id,'ground');
 }
 const huge=createRoadIndex({roads:[road('long','mud',[[-1e6,0],[1e6,0]],500)]},terrain);
 assert.equal(huge(79,79).id,'mud');assert.equal(huge(81,0).id,'ground');
});

test('distinct road materials have unique render/lookup priority',async()=>{
 const {roadMaterials}=await import('../src/road-materials.js');
 const roads=Object.values(roadMaterials).filter(m=>m.id!=='ground');
 assert.equal(new Set(roads.map(m=>m.priority)).size,roads.length);
});
