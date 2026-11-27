import test from 'node:test';
import assert from 'node:assert/strict';
import * as water from '../src/water.js';
import {prepareWater} from '../src/water-geometry.js';
const terrain=(size=5,spacing=1,fn=()=>0)=>({size,spacing,heights:Array.from({length:size*size},(_,k)=>fn(Math.floor(k/size)*spacing-(size-1)*spacing/2,k%size*spacing-(size-1)*spacing/2))});
const polygon=(id='pond',outer=[[-1,-1],[1,-1],[1,1],[-1,1]],holes=[])=>({id,type:'pond',outer,holes,depth:null,seasonal:false});
test('water settings and legacy fallback preserve authoritative empty water',()=>{
 assert.deepEqual(water.normalizeWaterSettings(),{maxCrossingDepth:.2});
 for(const value of [null,[],{bad:1},{maxCrossingDepth:NaN},{maxCrossingDepth:-1},{maxCrossingDepth:3}])assert.throws(()=>water.normalizeWaterSettings(value));
 assert.deepEqual(water.waterFeatures({water:[],landcover:[{...polygon(),kind:'water'}]}),[]);
 assert.equal(water.waterFeatures({landcover:[{...polygon(),kind:'water'}]})[0].type,'pond');
});
test('flat pond and exact wet-triangle index are deterministic and bounded',()=>{
 const t=terrain(),overlay={water:[polygon()]},a=prepareWater(overlay,t),at=water.createWaterIndex(a,t);
 assert.deepEqual(a,prepareWater(overlay,t));assert.ok(a.features[0].vertices.length);
 assert.equal(at(0,0).surfaceY,.05);assert.equal(at(1.5,0),null);assert.equal(at(NaN,0),null);
});
test('islands remain dry even where a stream centerline crosses',()=>{
 const t=terrain(),hole=[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]],p=polygon('lake',undefined,[hole]);
 const prepared=prepareWater({water:[p,{id:'stream',type:'stream',points:[[-2,0],[2,0]],width:.2,depth:.1,seasonal:false}]},t),at=water.createWaterIndex(prepared,t);
 assert.equal(at(0,0),null);assert.ok(at(.7,0));
});
test('level ponds stop at terrain banks and sample shore between vertices',()=>{
 const t=terrain(9,1,(x,z)=>Math.abs(x)),p=polygon('slope',[[-3,-3],[3,-3],[3,3],[-3,3]]),a=prepareWater({water:[p]},t),at=water.createWaterIndex(a,t);
 assert.ok(at(0,0));assert.equal(at(1,0),null);assert.equal(at(0,0).surfaceY,.05);
});
test('enclosing huge polygons use interior fallback and clip to finite patch',()=>{
 const t=terrain(),a=prepareWater({water:[polygon('huge',[[-1e6,-1e6],[1e6,-1e6],[1e6,1e6],[-1e6,1e6]])]},t);
 assert.ok(a.features.length);assert.ok(a.features[0].vertices.every(Number.isFinite));assert.equal(water.createWaterIndex(a,t)(3,0),null);
});
test('overlap chooses unknown then greatest known depth with stable id',()=>{
 const t=terrain(),features=[{...polygon('b'),depth:.1},{...polygon('a'),depth:.4}],at=water.createWaterIndex(prepareWater({water:features},t),t);
 assert.equal(at(0,0).id,'a');assert.equal(water.createWaterIndex(prepareWater({water:[...features,polygon('unknown')]},t),t)(0,0).id,'unknown');
});
test('missing terrain has an empty index for playground paths',()=>{
 assert.equal(water.createWaterIndex(null,null)(0,0),null);
});
test('river ribbons follow each terrain triangle and retain metadata',()=>{
 const t=terrain(7,1,(x,z)=>x*x+z),p={id:'river',type:'river',points:[[-9,0],[9,0]],width:.8,depth:.1,seasonal:true},a=prepareWater({water:[p]},t),at=water.createWaterIndex(a,t);
 assert.equal(at(1.5,0).surfaceY,2.55);assert.equal(at(0,0).depth,.1);assert.equal(at(0,0).seasonal,true);assert.equal(at(0,1),null);
});
test('triangle cap omits whole features without phantom contact',()=>{
 const t=terrain(257,1),huge=[[-1e6,-1e6],[1e6,-1e6],[1e6,1e6],[-1e6,1e6]],a=prepareWater({water:[polygon('first',huge),polygon('second',huge)]},t);
 assert.equal(a.features.length,1);assert.equal(a.omitted,1);assert.ok(a.features.reduce((sum,f)=>sum+f.vertices.length/9,0)<=200000);assert.equal(water.createWaterIndex(a,t)(0,0).id,'first');
});
test('closed polygon rings preserve correct island indices',()=>{
 const close=r=>[...r,r[0]],outer=close([[-1.8,-1.8],[1.8,-1.8],[1.8,1.8],[-1.8,1.8]]),hole=close([[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]),t=terrain(),at=water.createWaterIndex(prepareWater({water:[polygon('closed',outer,[hole])]},t),t);
 assert.equal(at(0,0),null);assert.ok(at(1.5,1.5));assert.ok(at(-1.5,1.5));assert.ok(at(1.5,-1.5));
});
test('polygon metadata dominates crossing centerlines without removing outside stream',()=>{
 const t=terrain(9),pond={...polygon('shallow'),depth:.1},stream={id:'unknown-stream',type:'stream',points:[[-4,0],[4,0]],width:.3,depth:null,seasonal:false},at=water.createWaterIndex(prepareWater({water:[pond,stream]},t),t);
 assert.equal(at(0,0).id,'shallow');assert.equal(at(2,0).id,'unknown-stream');
});
test('partial pond underfill reports a terrain mismatch',()=>{
 const t=terrain(9,1,x=>Math.abs(x)),a=prepareWater({water:[polygon('slope',[[-3,-3],[3,-3],[3,3],[-3,3]])]},t);
 assert.ok(a.features.length);assert.equal(a.mismatched,1);
});

test('zero depth produces no wet geometry and masks unknown centerlines',()=>{
 const t=terrain(),dry={...polygon('dry'),depth:0},stream={id:'stream',type:'stream',points:[[-2,0],[2,0]],width:.2,depth:null,seasonal:false},a=prepareWater({water:[dry,stream]},t),at=water.createWaterIndex(a,t);
 assert.ok(!a.features.some(f=>f.id==='dry'));assert.equal(at(0,0),null);assert.equal(at(1.5,0).id,'stream');
});
test('expected duplicate centerline masking does not warn about terrain mismatch',()=>{
 const t=terrain(),pond=polygon(),line={id:'covered-stream',type:'stream',points:[[-.8,0],[.8,0]],width:.2,depth:null,seasonal:false},a=prepareWater({water:[pond,line]},t);
 assert.equal(a.features.length,1);assert.equal(a.mismatched,0);
});
