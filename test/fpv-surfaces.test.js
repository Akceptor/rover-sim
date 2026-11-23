import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roadPixels,roadUV} from '../web/road-surface.js';
import {skyPalette,paletteChanged} from '../web/sky-palette.js';

test('road tiles are deterministic, seamless and distinct for asphalt and dirt',()=>{
 const asphalt=roadPixels(true,64),dirt=roadPixels(false,64);
 assert.deepEqual(asphalt,roadPixels(true,64));assert.notDeepEqual(asphalt,dirt);
 for(const pixels of [asphalt,dirt]){
  assert.equal(pixels.length,64*64*4);
  for(let i=0;i<64;i++)for(let c=0;c<4;c++){
   assert.equal(pixels[(i*64)*4+c],pixels[(i*64+63)*4+c]);
   assert.equal(pixels[i*4+c],pixels[(63*64+i)*4+c]);
  }
 }
});
test('road UVs use shared world metres across independently triangulated bends',()=>{
 const vertices=[2,4,8,6,5,8,2,4,8,-2,3,0],before=[...vertices];
 assert.deepEqual(roadUV(vertices),[.5,2,1.5,2,.5,2,-.5,0]);assert.deepEqual(vertices,before);
});
test('sky palette separates horizon from zenith and warms near sunset',()=>{
 const noon=skyPalette(55,.1),sunset=skyPalette(0,.1),night=skyPalette(-20,.1),overcast=skyPalette(55,1);
 for(const p of [noon,sunset,night,overcast]){assert.equal(p.horizon.length,3);assert.notDeepEqual(p.horizon,p.zenith);assert.ok([...p.horizon,...p.zenith].every(v=>v>=0&&v<=1));}
 assert.ok(sunset.horizon[0]>sunset.horizon[2]);assert.ok(noon.zenith[2]>noon.zenith[0]);assert.ok(night.horizon[2]<noon.horizon[2]);
 assert.ok(Math.abs(overcast.zenith[2]-overcast.zenith[0])<Math.abs(noon.zenith[2]-noon.zenith[0]));
 assert.equal(paletteChanged(noon,skyPalette(55.001,.1)),false);assert.equal(paletteChanged(noon,sunset),true);assert.equal(paletteChanged(null,noon),true);
});
