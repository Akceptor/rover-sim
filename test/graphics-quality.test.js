import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 isSoftwareRenderer,
 resolveQualityPreference,
 resolveGraphicsProfile,
 loadQualityPreference,
 saveQualityPreference,
 formatQualityStatus,
} from '../web/graphics-quality.js';

test('detects common software WebGL renderers without false positives on hardware GPUs',()=>{
 for(const name of [
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
  'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'GDI Generic',
 ]){
  assert.equal(isSoftwareRenderer(name),true,name);
 }
 for(const name of [
  'Apple M3 Max',
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
  'NVIDIA GeForce RTX 4070',
  '',
 ]){
  assert.equal(isSoftwareRenderer(name),false,name);
 }
});

test('resolves auto, high, and performance profiles with appropriate DPR and material flags',()=>{
 const autoHw=resolveGraphicsProfile({preference:'auto',rendererName:'Apple M2',devicePixelRatio:2});
 assert.equal(autoHw.resolved,'high');
 assert.equal(autoHw.pixelRatio,2);
 assert.equal(autoHw.shadowsEnabled,true);
 assert.equal(autoHw.materialMode,'standard');
 assert.equal(autoHw.useBumpMap,true);

 const autoSw=resolveGraphicsProfile({preference:'auto',rendererName:'SwiftShader',devicePixelRatio:2});
 assert.equal(autoSw.resolved,'performance');
 assert.equal(autoSw.softwareRenderer,true);
 assert.equal(autoSw.pixelRatio,1);
 assert.equal(autoSw.shadowsEnabled,false);
 assert.equal(autoSw.materialMode,'lambert');
 assert.equal(autoSw.useBumpMap,false);
 assert.equal(autoSw.anisotropyCap,1);

 const forcedHigh=resolveGraphicsProfile({preference:'high',rendererName:'SwiftShader',devicePixelRatio:3});
 assert.equal(forcedHigh.resolved,'high');
 assert.equal(forcedHigh.pixelRatio,2);
 assert.equal(forcedHigh.shadowsEnabled,true);

 const forcedPerf=resolveGraphicsProfile({preference:'performance',rendererName:'Apple M2',devicePixelRatio:2});
 assert.equal(forcedPerf.resolved,'performance');
 assert.equal(forcedPerf.pixelRatio,1);
 assert.equal(forcedPerf.shadowsEnabled,false);
});

test('preference validation and storage helpers handle errors and invalid values',()=>{
 assert.equal(resolveQualityPreference('ultra'),'auto');
 assert.equal(resolveQualityPreference('performance'),'performance');

 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(loadQualityPreference(blocked),'auto');
 assert.equal(saveQualityPreference(blocked,'performance'),false);

 let saved=null;
 const storage={getItem:()=>saved,setItem:(_,v)=>{saved=v;}};
 assert.equal(saveQualityPreference(storage,'performance'),true);
 assert.equal(loadQualityPreference(storage),'performance');
});

test('formatQualityStatus describes auto and manual modes clearly',()=>{
 assert.match(formatQualityStatus(resolveGraphicsProfile({preference:'auto',rendererName:'SwiftShader'})),/software renderer detected/);
 assert.equal(formatQualityStatus(resolveGraphicsProfile({preference:'auto',rendererName:'Apple M2'})),'Auto · High');
 assert.equal(formatQualityStatus(resolveGraphicsProfile({preference:'performance',rendererName:'Apple M2'})),'Performance (manual)');
});
