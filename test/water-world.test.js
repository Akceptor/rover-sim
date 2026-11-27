import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terrain} from './fixtures/osm.js';
import {terrainObjects} from '../src/terrain.js';
import {overlayGeometry} from '../src/osm.js';
import {createWaterIndex} from '../src/water.js';
import {mapData} from '../src/map-data.js';

test('shared water geometry excludes vegetation but keeps mapped island trees and map triangles',()=>{
 const outer=[[10,-10],[30,-10],[30,10],[10,10]],holes=[[[18,-2],[22,-2],[22,2],[18,2]]];
 const o={buildings:[],roads:[],barriers:[],landcover:[{id:'forest',kind:'forest',outer:[[-80,-80],[80,-80],[80,80],[-80,80]],holes:[]}],trees:[{id:'island-tree',source:'node',point:[20,0],height:1}],water:[{id:'pond',type:'pond',outer,holes,depth:null,seasonal:false}]};
 const g=overlayGeometry(o,terrain),at=createWaterIndex(g.water,terrain),objects=terrainObjects(terrain,o,g.water);
 assert.ok(objects.some(o=>o.osmId==='island-tree'));
 for(const object of objects.filter(o=>['tree','rock'].includes(o.kind)))assert.equal(at(object.position[0],object.position[2]),null,'visible trees/colliders never planted in wet area');
 const map=mapData(terrain,o,terrain.home,g.water);assert.equal(map.water.length,1);
 assert.equal(map.water[0].triangles.length,g.water.features[0].vertices.length/9);
});
