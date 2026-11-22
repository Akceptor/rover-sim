import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapData,mapPosition} from '../src/map-data.js';
import {createMapLocation} from '../src/locations.js';
import {osm,terrain} from './fixtures/osm.js';
import {processOsm} from '../src/osm.js';

test('map overlay uses the terrain projection for boundaries, footprint holes and roads',()=>{
 const data=mapData(terrain,processOsm(osm,terrain),terrain.home);
 assert.equal(data.bounds.length,4);assert.deepEqual(data.home,terrain.home);assert.equal(data.buildings[0].length,2);assert.equal(data.roads.length,3);
 const north=mapPosition(terrain.home,{x:10,z:0}),east=mapPosition(terrain.home,{x:0,z:10});
 assert.ok(north.lat>0&&Math.abs(north.lon)<1e-9);assert.ok(east.lon>0&&Math.abs(east.lat)<1e-9);
 assert.ok(Math.abs(data.buildings[0][0][0][0]-5/110574.2758)<1e-8);
 assert.deepEqual(mapData(null,null,terrain.home),{home:terrain.home,bounds:[],buildings:[],roads:[]});
});
test('browser map selections validate coordinates, preserve hemisphere and use a separate selection ID',()=>{
 const start=createMapLocation(-12.026,-77.028);assert.equal(start.id,'map');assert.equal(start.lat,-12.026);assert.equal(start.lon,-77.028);assert.match(start.name,/Map/);
 for(const [lat,lon]of [[NaN,0],[0,Infinity],[86,0],[0,181],['50',30]])assert.throws(()=>createMapLocation(lat,lon),/coordinates/);
});
