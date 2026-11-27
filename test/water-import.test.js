import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as water from '../src/osm-water.js';
import {processOsm,overlayKey,OSM_SCHEMA} from '../src/osm.js';
import {validateOsmOverlay,overpassQuery} from '../src/osm-cache.js';
import {hasOsmFeatures} from '../src/osm-features.js';

const terrain={home:{lat:0,lon:0},size:33,spacing:10};
const nodes=new Map([[1,[-40,-40]],[2,[40,-40]],[3,[40,40]],[4,[-40,40]],[5,[-5,-5]],[6,[5,-5]],[7,[5,5]],[8,[-5,5]]]);
const ring=ids=>ids.every(id=>nodes.has(id))?ids.map(id=>nodes.get(id)):null;
const way=(id,ids,tags)=>({type:'way',id,nodes:ids,tags});
function run(elements){return water.processWater({elements},terrain,nodes,new Map(elements.filter(e=>e.type==='way').map(e=>[e.id,e])),ring);}
const polygon=()=>({id:'water',type:'lake',outer:[[-2,-2],[2,-2],[2,2],[-2,2]],holes:[],depth:null,seasonal:false});

test('imports stitched reversed multipolygon water with islands and suppresses member duplicates',()=>{
 const elements=[way(1,[1,2,3],{natural:'water'}),way(2,[1,4,3],{natural:'water'}),way(3,[5,6,7,8,5],{natural:'water'}),{type:'relation',id:9,tags:{type:'multipolygon',natural:'water',water:'reservoir',depth:'10 ft',seasonal:'yes'},members:[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'outer'},{type:'way',ref:3,role:'inner'}]}];
 const result=run(elements);assert.equal(result.length,1);assert.equal(result[0].id,'relation/9');assert.equal(result[0].type,'reservoir');assert.equal(result[0].outer.length,4);assert.equal(result[0].holes.length,1);assert.equal(result[0].depth,3.048);assert.equal(result[0].seasonal,true);
});

test('supports polygon tags and splits waterways at missing nodes with bounded dimensions',()=>{
 const result=run([way(1,[1,2,3,4,1],{natural:'water',water:'pond',depth:'0'}),way(2,[1,2,999,3,4],{waterway:'river',width:'12 ft',depth:'101'}),way(3,[1,2],{waterway:'ditch',width:'0',depth:'-1'}),way(4,[1,2,3,4,1],{landuse:'reservoir'}),way(5,[1,2,3,4,1],{waterway:'riverbank'})]);
 assert.equal(result.length,6);assert.equal(result[0].depth,0);assert.equal(result[0].type,'pond');
 const rivers=result.filter(w=>w.points&&w.type==='river');assert.equal(rivers.length,2);assert.equal(rivers[0].width,3.6576000000000004);assert.equal(rivers[0].depth,null);
 assert.equal(result.find(w=>w.type==='ditch').width,.6);assert.ok(result.some(w=>w.type==='reservoir'));assert.ok(result.some(w=>w.outer&&w.type==='river'));
});

test('omits underground, covered, explicitly dry and unqualified basin features',()=>{
 const tags=[{landuse:'basin'},{natural:'water',dry:'yes'},{natural:'water',water:'no'},{waterway:'stream',tunnel:'culvert'},{waterway:'canal',covered:'yes'},{waterway:'drain',intermittent:'dry'},{natural:'water',water:'dry'}];
 assert.deepEqual(run(tags.map((t,i)=>way(i,[1,2,3,4,1],t))),[]);
 assert.equal(run([way(20,[1,2],{waterway:'stream',intermittent:'yes',tunnel:'no',covered:'no'})])[0].seasonal,true);
});

test('rejects oversized geometry before ring conversion and bounds feature and vertex totals',()=>{
 const huge=way(1,Array(140000).fill(1),{natural:'water'});let converted=false;
 assert.deepEqual(water.processWater({elements:[]},terrain,nodes,new Map([[1,huge]]),()=>{converted=true;return [];}),[]);assert.equal(converted,false);
 const features=run(Array.from({length:1100},(_,i)=>way(i,[1,2],{waterway:'stream'})));assert.equal(features.length,1024);
 const longIds=Array.from({length:8192},(_,i)=>i+1),longNodes=new Map(longIds.map((id,i)=>[id,[i%100,Math.floor(i/100)]]));
 const ways=new Map(Array.from({length:10},(_,i)=>[i,way(i,longIds,{waterway:'river'})]));
 const bounded=water.processWater({elements:[]},terrain,longNodes,ways,()=>null);assert.equal(bounded.length,8);assert.equal(bounded.reduce((n,f)=>n+f.points.length,0),65536);
});

test('strict optional cache water schema accepts legacy overlays and enforces both budgets',()=>{
 const base={version:OSM_SCHEMA,key:overlayKey(terrain),buildings:[],roads:[]};assert.equal(water.validWaterFields(base),true);
 assert.equal(validateOsmOverlay({...base,water:[polygon()]},terrain).water.length,1);
 for(const feature of [{...polygon(),depth:-1},{...polygon(),depth:101},{...polygon(),depth:undefined},{...polygon(),seasonal:1},{...polygon(),type:'ocean'},{...polygon(),outer:[[Infinity,0],[0,0],[1,1]]},{...polygon(),points:[[0,0],[1,1]],width:2},{id:'a',type:'stream',points:[[0,0],[1,1]],width:201,depth:null,seasonal:false}])assert.throws(()=>validateOsmOverlay({...base,water:[feature]},terrain),/water/i);
 assert.equal(water.validWaterFields({water:null}),false);assert.equal(water.validWaterFields({water:Array(1025).fill(polygon())}),false);
 const line={id:'line',type:'stream',points:Array(8192).fill([0,0]),width:2,depth:null,seasonal:false};assert.equal(water.validWaterFields({water:Array(9).fill(line)}),false);
});

test('processOsm returns water without changing schema/key and water counts as ready',()=>{
 const elements=[{type:'node',id:1,lat:0,lon:0},{type:'node',id:2,lat:.0001,lon:0},way(3,[1,2],{waterway:'stream'})];
 const overlay=processOsm({elements},terrain);assert.equal(overlay.water.length,1);assert.equal(overlay.version,1);assert.equal(overlay.key,overlayKey(terrain));assert.equal(hasOsmFeatures({water:overlay.water}),true);assert.equal(hasOsmFeatures({water:{features:[{id:'stream'}]}}),true);assert.equal(hasOsmFeatures({water:{features:[]},waterFeatureCount:1}),true);
 assert.match(overpassQuery(terrain),/waterway/);assert.match(overpassQuery(terrain),/riverbank/);assert.match(overpassQuery(terrain),/ditch/);
});

test('incomplete island geometry rejects the entire water relation',()=>{
 const members=[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'inner'}];
 const outer=way(1,[1,2,3,4,1],{}),relation={type:'relation',id:30,tags:{type:'multipolygon',natural:'water'},members};
 const incompleteNodes=new Map(nodes);incompleteNodes.delete(8);
 const closedInner=way(2,[5,6,7,8,5],{}),elements=[outer,closedInner,relation];
 assert.deepEqual(water.processWater({elements},terrain,incompleteNodes,new Map([[1,outer],[2,closedInner]]),ids=>ids.every(id=>incompleteNodes.has(id))?ids.map(id=>incompleteNodes.get(id)):null),[],'missing island node cannot become hazardous lake');
});

test('unclosed island geometry rejects the entire water relation',()=>{
 const outer=way(1,[1,2,3,4,1],{}),relation={type:'relation',id:30,tags:{type:'multipolygon',natural:'water'},members:[{type:'way',ref:1,role:'outer'},{type:'way',ref:2,role:'inner'}]};
 assert.deepEqual(run([outer,way(2,[5,6,7,8],{}),relation]),[],'unclosed island edges cannot be silently discarded');
});
