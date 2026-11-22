import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fillSmallElevationGaps} from '../src/elevation-gaps.js';

test('an isolated elevation void is estimated from nearby source samples without changing measured cells',()=>{
 const width=21,height=21,source=Float32Array.from({length:width*height},(_,k)=>100+k%width+2*Math.floor(k/width));
 const centre=10*width+10,expected=source[centre];source[centre]=NaN;
 const result=fillSmallElevationGaps(source,width,height,NaN);
 assert.equal(result.filledCells,1);assert.equal(result.maxRadiusCells,2);
 assert.ok(Math.abs(result.values[centre]-expected)<1e-5);
 assert.ok(Number.isNaN(source[centre]),'the source raster remains untouched');
 for(let k=0;k<source.length;k++)if(k!==centre)assert.equal(result.values[k],source[k]);
});

test('finite nodata and edge gaps use valid original neighbours, including zero and negative elevations',()=>{
 const source=new Float32Array(21*21).fill(-5);source[0]=-9999;source[1]=0;
 const result=fillSmallElevationGaps(source,21,21,-9999);
 assert.equal(result.filledCells,1);assert.ok(result.values[0]>=-5&&result.values[0]<=0);
 const unchanged=fillSmallElevationGaps(new Float32Array(21*21),21,21,NaN);
 assert.equal(unchanged.filledCells,0);assert.ok(unchanged.values.every(v=>v===0));
});

test('large missing areas are rejected rather than inventing a landscape',()=>{
 const source=new Float32Array(21*21).fill(100);
 for(let i=0;i<5;i++)source[i]=NaN;
 assert.throws(()=>fillSmallElevationGaps(source,21,21,NaN),/too much missing elevation/);
 assert.throws(()=>fillSmallElevationGaps(new Float32Array(441).fill(NaN),21,21,NaN),/too much missing elevation/);
});

test('repairs never propagate across a hole using already estimated cells',()=>{
 const source=new Float32Array(101*101).fill(100);
 for(let y=46;y<=52;y++)for(let x=46;x<=52;x++)source[y*101+x]=NaN;
 // Less than 1% is missing, but the middle is more than two cells from real data.
 assert.throws(()=>fillSmallElevationGaps(source,101,101,NaN),/missing elevation area is too wide/);
 assert.ok(Number.isNaN(source[49*101+49]));
});

test('raster dimensions are checked before estimating elevations',()=>{
 assert.throws(()=>fillSmallElevationGaps(new Float32Array(4),3,3,NaN),/dimensions/);
});
