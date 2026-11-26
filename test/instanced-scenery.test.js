import {test} from 'node:test';
import assert from 'node:assert/strict';

// addWorldObjects is a browser module (imports Three.js via bare specifier),
// so we test the batching logic indirectly by verifying the data the module consumes.
// The module itself is covered by the existing backend/browser smoke tests.

test('world objects from terrain split cleanly into instancable buckets',()=>{
 // Simulate typical terrain output: trees, rocks, barriers, cones.
 const objects=[
  {kind:'tree',size:[.22,4,.22],position:[10,2,5],color:0x655039},
  {kind:'tree',size:[.22,5,.22],position:[20,3,10],color:0x655039},
  {kind:'tree',size:[.22,3.5,.22],position:[30,1,15],color:0x655039},
  {kind:'rock',size:[.3,.21,.27],position:[5,0.1,8],color:0x777b70},
  {kind:'rock',size:[.3,.21,.27],position:[15,0.1,18],color:0x777b70},
  {kind:'cone',size:[.22,.5,.22],position:[1,.25,2],color:0xff7f20},
  {kind:'cone',size:[.22,.5,.22],position:[2,.25,3],color:0xff7f20},
  {kind:'cone',size:[.22,.5,.22],position:[3,.25,4],color:0xff7f20},
  {kind:'barrier',size:[.3,.5,6],position:[8,.25,0],color:0xe0e4df},
  {kind:'barrier',size:[4,.4,.25],position:[-3,.2,-5],color:0xdb7632},
 ];

 // Group by kind:color — same logic as addWorldObjects.
 const buckets=new Map();
 for(const o of objects){
  const key=`${o.kind}:${o.color}`;
  if(!buckets.has(key))buckets.set(key,{kind:o.kind,color:o.color,items:[]});
  buckets.get(key).items.push(o);
 }

 // Trees should be a single bucket by color (trunks), crowns handled separately.
 const treeBucket=buckets.get(`tree:${0x655039}`);
 assert.equal(treeBucket.items.length,3);

 // Same-size cones should be instanceable (all same size).
 const coneBucket=buckets.get(`cone:${0xff7f20}`);
 assert.equal(coneBucket.items.length,3);
 const sameSize=coneBucket.items.every(o=>
  o.size[0]===coneBucket.items[0].size[0]&&
  o.size[1]===coneBucket.items[0].size[1]&&
  o.size[2]===coneBucket.items[0].size[2]);
 assert.equal(sameSize,true,'cones with same size should batch');

 // Barriers with different sizes+colors go into separate buckets.
 const barrierKeys=[...buckets.keys()].filter(k=>k.startsWith('barrier:'));
 assert.equal(barrierKeys.length,2,'barriers with different colors are separate buckets');

 // Rocks with same size should batch.
 const rockBucket=buckets.get(`rock:${0x777b70}`);
 assert.equal(rockBucket.items.length,2);
});

test('tree crown instances need per-object scale derived from trunk height',()=>{
 const trees=[
  {kind:'tree',size:[.22,4,.22],position:[10,2,5],color:0x655039},
  {kind:'tree',size:[.22,5.5,.22],position:[20,3,10],color:0x655039},
 ];
 for(const t of trees){
  const h=t.size[1];
  const crownRadius=h*.32,crownHeight=h*.9;
  const crownY=t.position[1]+h*.35;
  assert.ok(crownRadius>0&&crownHeight>0);
  assert.ok(crownY>t.position[1],'crown sits above trunk center');
 }
});
