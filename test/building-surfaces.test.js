import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processOsm,overlayGeometry} from '../src/osm.js';
import {terrain,osm} from './fixtures/osm.js';
import {buildingSurfaces,buildingStyle} from '../web/building-surfaces.js';

test('building facade UVs have consistent storeys, separate roofs and foundations without changing collision vertices',()=>{
 const b=overlayGeometry(processOsm(osm,terrain),terrain).buildings[0],before=JSON.stringify(b),s=buildingSurfaces(b);
 assert.deepEqual(JSON.stringify(b),before);
 assert.ok(s.walls.positions.length>0&&s.roof.positions.length>0);
 assert.equal(s.walls.uv.length,s.walls.positions.length/3*2);assert.ok(s.foundation.positions.length>0);
 for(const p of [s.walls,s.foundation,s.roof])assert.ok([...p.positions,...p.uv].every(Number.isFinite));
 assert.equal(s.door.height,2.2);assert.ok(s.door.edgeLength>=2.5);
 for(let i=0;i<s.roof.positions.length;i+=3)assert.equal(s.roof.positions[i+1],b.top);
 const extent=[];for(let i=0;i<s.walls.uv.length;i+=2)extent.push(s.walls.uv[i+1]);
 assert.equal(Math.max(...extent),2,'6 m building has two storeys');
});
test('all facade vertices remain on the original footprint walls and courtyard stays open',()=>{
 const b=overlayGeometry(processOsm(osm,terrain),terrain).buildings[0],s=buildingSurfaces(b),n=b.vertices.length/6;
 const edges=[];for(let i=0;i<b.indices.length;i+=3){const ids=[...new Set(b.indices.slice(i,i+3).map(v=>v%n))];if(ids.length===2)edges.push(ids.map(v=>[b.vertices[v*3],b.vertices[v*3+2]]));}
 for(const p of [s.walls,s.foundation])for(let i=0;i<p.positions.length;i+=3){const x=p.positions[i],z=p.positions[i+2];assert.ok(edges.some(([a,c])=>Math.abs((c[0]-a[0])*(z-a[1])-(c[1]-a[1])*(x-a[0]))<1e-5));}
});
test('building styles remain stable across loads and offer different finishes',()=>{
 assert.deepEqual(buildingStyle('way/30'),buildingStyle('way/30'));assert.ok(new Set(Array.from({length:20},(_,i)=>buildingStyle(`way/${i}`).finish)).size>=3);
});
test('blank foundation walls span their full texture height without repeating or stretching an edge texel',()=>{
 const b=overlayGeometry(processOsm(osm,terrain),terrain).buildings[0],shift=17;
 b.vertices=b.vertices.map((v,i)=>i%3===1?v+shift:v);b.top+=shift;b.bottom+=shift;
 const s=buildingSurfaces(b);
 for(let i=0;i<s.foundation.positions.length;i+=3){const y=s.foundation.positions[i+1],v=s.foundation.uv[i/3*2+1];assert.ok(Math.abs(v-(y-b.bottom)/(b.top-b.bottom))<1e-8);}
 const vertical=s.foundation.uv.filter((_,i)=>i%2===1);
 assert.equal(Math.min(...vertical),0);assert.equal(Math.max(...vertical),1);assert.ok(vertical.every(v=>v>=0&&v<=1));
});
test('foundation moisture has stable subtle uneven traces with matching horizontal tile edges',async()=>{
 const {foundationMoisture}=await import('../web/building-surfaces.js');
 assert.equal(typeof foundationMoisture,'function');
 const traces=foundationMoisture();assert.deepEqual(traces,foundationMoisture());
 assert.ok(traces.every(v=>v>=.06&&v<=.105));assert.ok(Math.max(...traces)-Math.min(...traces)>.015);
 assert.ok(Math.abs(traces[0]-traces.at(-1))<1e-12);
});
