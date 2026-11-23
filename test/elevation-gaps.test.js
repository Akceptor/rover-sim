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
 for(let i=0;i<23;i++)source[i]=NaN;
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

// Observed GEM-15 mask at 48.9164579,24.7467362: 49/4624 cells, all within sqrt(2) cells of measured data.
test('narrow Ivano-Frankivsk voids slightly above one percent remain locally repairable',()=>{
 const width=68,source=Float32Array.from({length:width*width},(_,k)=>250+k%width*.1+Math.floor(k/width)*.2);
 const missing=[42, 43, 109, 110, 111, 176, 177, 178, 243, 244, 245, 311, 378, 445, 647, 714, 715, 781, 782, 849, 916, 983, 984, 1051, 1118, 1185, 1186, 1253, 1320, 1388, 1994, 3486, 3893, 3961, 3962, 4029, 4030, 4097, 4098, 4165, 4166, 4233, 4234, 4301, 4302, 4369, 4437, 4505, 4573];
 for(const k of missing)source[k]=NaN;
 const result=fillSmallElevationGaps(source,width,width,NaN);
 assert.equal(result.filledCells,49);assert.equal(result.maxMissingFraction,.05);
 assert.ok(result.values.every(Number.isFinite));
 for(let k=0;k<source.length;k++)if(Number.isFinite(source[k]))assert.equal(result.values[k],source[k]);
});

test('five percent narrow gaps are repaired but more than five percent is rejected',()=>{
 const source=new Float32Array(100*100).fill(100);
 for(let y=0;y<100;y++)for(let x=0;x<5;x++)source[y*100+x*20]=NaN;
 const result=fillSmallElevationGaps(source,100,100,NaN);assert.equal(result.filledCells,500);assert.ok(result.values.every(Number.isFinite));
 source[1]=NaN;assert.throws(()=>fillSmallElevationGaps(source,100,100,NaN),/too much missing elevation/);
});
