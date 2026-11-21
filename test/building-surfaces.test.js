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
