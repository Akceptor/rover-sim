import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeTerrainVertexColors} from '../web/terrain-shading.js';

function flatTerrain(n=5,spacing=2){
 return {size:n,spacing,heights:new Array(n*n).fill(0)};
}

test('flat terrain preserves uniform base color without AO distortion',()=>{
 const colors=computeTerrainVertexColors(flatTerrain(5,2));
 assert.equal(colors.length,5*5*3);
 const [r0,g0,b0]=[colors[0],colors[1],colors[2]];
 for(let i=0;i<colors.length;i+=3){
  assert.ok(Math.abs(colors[i]-r0)<1e-6);
  assert.ok(Math.abs(colors[i+1]-g0)<1e-6);
  assert.ok(Math.abs(colors[i+2]-b0)<1e-6);
 }
});

test('hollows are darkened by baked AO while ridges are slightly brightened',()=>{
 const t=flatTerrain(5,2);
 t.heights[2*5+2]=-2; // deep center hollow
 const hollow=computeTerrainVertexColors(t);
 const centerIdx=(2*5+2)*3,cornerIdx=0;
 assert.ok(hollow[centerIdx]<hollow[cornerIdx],'hollow vertex should be darker than flat corner');

 const tRidge=flatTerrain(5,2);
 tRidge.heights[2*5+2]=2; // center peak
 const ridge=computeTerrainVertexColors(tRidge);
 assert.ok(ridge[centerIdx]>ridge[cornerIdx],'ridge vertex should be slightly brighter than flat corner');
});

test('steep slopes blend toward neutral rock tint while preserving finite 0..1 linear RGB',()=>{
 const n=5,spacing=1;
 const heights=[];
 for(let x=0;x<n;x++)for(let z=0;z<n;z++)heights.push(x*1.5); // constant steep 1.5 slope
 const colors=new Array(n*n*3).fill(0).map((_,i)=>i%3===1?200:40); // bright green satellite color
 const out=computeTerrainVertexColors({size:n,spacing,heights,colors});
 // On a constant-slope plane, concavity is 0 so AO=1; rock tint should raise R/B relative to pure green.
 const mid=(2*n+2)*3;
 assert.ok(out[mid]>0.05,'steep slope should blend in rock red channel');
 assert.ok(out[mid+1]<0.55,'steep slope should mute pure green channel');
 for(let i=0;i<out.length;i++){
  assert.ok(Number.isFinite(out[i])&&out[i]>=0&&out[i]<=1);
 }
});
