#!/usr/bin/env node
// Replays render-only state on an actual bundled Lviv road. No physics or network datasets are changed.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {ProcessGroup} from '../src/process-group.js';
import {loadOsmOverlay} from '../src/osm-cache.js';
import {terrainHeight} from '../src/terrain.js';
const root=path.resolve('.'),baseline=path.resolve(process.argv[2]??'/private/tmp/rover-graphics-baseline');
const out=path.resolve(process.env.GRAPHICS_OUTPUT??'.run/graphics-comparison'),rounds=Number(process.env.GRAPHICS_ROUNDS??3),duration=Number(process.env.GRAPHICS_DURATION??6000);
await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-graphics-')),terrain=JSON.parse(await fs.readFile('assets/terrain/lviv.json')),{overlay}=await loadOsmOverlay(terrain);
const road=overlay.roads.find(r=>r.id==='way/170142831/3'),route=road.points.slice(6,13),distances=[0];
for(let i=1;i<route.length;i++)distances.push(distances.at(-1)+Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]));
function pose(progress){
 const distance=10+progress*30;let i=1;while(i<distances.length-1&&distance>distances[i])i++;
 const a=route[i-1],b=route[i],u=(distance-distances[i-1])/(distances[i]-distances[i-1]),x=a[0]+u*(b[0]-a[0]),z=a[1]+u*(b[1]-a[1]),y=terrainHeight(terrain,x,z)+.12;
 const dx=b[0]-a[0],dz=b[1]-a[1],dy=terrainHeight(terrain,...b)-terrainHeight(terrain,...a),length=Math.hypot(dx,dy,dz),w=Math.sqrt((1+dx/length)/2);
 return {position:{x,y,z},rotation:{x:0,y:-dz/length/(2*w),z:dy/length/(2*w),w},speed:1.2,heading:(Math.atan2(dz,dx)*180/Math.PI+360)%360};
}
const now=Date.parse('2026-06-21T10:00:00Z'),weather={now,observedAt:now,fetchedAt:now,timeZone:'Europe/Kyiv',timeZoneKnown:true,status:'current',ageMs:0,conditions:{temperatureC:20,code:0,cloudCover:0,rainMm:0,snowCm:0}};
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];};
const summarize=values=>({median:percentile(values,.5),p95:percentile(values,.95)});
const results=[],groups=[];let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 // Interleave versions in each round to reduce warm-up and thermal ordering bias.
 for(let round=0;round<rounds;round++)for(const version of process.env.GRAPHICS_VERSIONS?.split(',')??(round%2?['after','before']:['before','after'])){
  const cwd=version==='before'?baseline:root,port=8112,group=new ProcessGroup({log:()=>{},graceMs:2000});groups.push(group);
  const config=JSON.parse(await fs.readFile(path.join(cwd,'config/default.json')));Object.assign(config,{httpPort:port,mavlink:null,terrain:path.join(cwd,'assets/terrain/lviv.json'),savedLocationsDir:path.join(temp,'saved'),terrainCacheDir:path.join(temp,'terrain'),osm:{bundledDir:path.join(cwd,'assets/osm'),cacheDir:path.join(temp,'osm'),endpoint:'http://127.0.0.1:1',timeoutMs:50}});
  const configFile=path.join(temp,'config.json'),preload=path.join(temp,'offline.cjs');await fs.writeFile(configFile,JSON.stringify(config));await fs.writeFile(preload,"globalThis.fetch=async()=>{throw Error('Comparison is offline');};");
  group.start(version,process.execPath,['src/server.js','--standalone','--config',configFile],{cwd,ipc:true,env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(preload).href}`}});
  const url=`http://127.0.0.1:${port}`;let ready;for(let i=0;i<200;i++){try{ready=await fetch(url+'/api/state').then(r=>r.json());if(ready.osm.status==='ready')break;}catch{}await delay(25);}assert.equal(ready?.osm.status,'ready');
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('https://**/*',r=>r.abort());
  // Seed particle RNG too, so screenshot noise is repeatable in baseline and candidate.
  await page.addInitScript(()=>{let seed=1827;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};localStorage.clear();});
  let replayStart=null,frozen=false,forcedPose=null;
  await page.routeWebSocket(url.replace('http:','ws:')+'/',ws=>{const server=ws.connectToServer();server.onMessage(raw=>{const m=JSON.parse(raw);if(m.type==='state'){m.weather=weather;Object.assign(m,forcedPose??pose(frozen ? .5 : replayStart===null?0:Math.min(1,(performance.now()-replayStart)/duration)));}ws.send(JSON.stringify(m));});});
  await page.goto(url+'/?camera-output');let sceneReady=false;for(let attempt=0;attempt<200;attempt++){sceneReady=await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js');let good=true,count=0;f.scene.traverse(o=>{if(o.name.startsWith('osm-building:')){count++;good&&=o.material.every(m=>m.map.userData.photoReady);}});return count>0&&good;});if(sceneReady)break;await delay(50);}assert.ok(sceneReady,JSON.stringify(errors));
  if(version==='after'){
   const materials=await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js'),T=await import('/three.js'),maps=new Set();let roads=0,bases=0;f.scene.traverse(o=>{if(o.name.startsWith('osm-road:')){roads++;if(!o.material.map||o.geometry.attributes.uv?.count!==o.geometry.attributes.position.count)throw Error('Road texture/UV missing');maps.add(o.material.map.uuid);}if(o.name.startsWith('osm-building:')){bases++;if(o.material[2].map.wrapT!==T.ClampToEdgeWrapping)throw Error('Foundation moisture repeats vertically');}});return {roads,bases,maps:maps.size};});
   assert.ok(materials.roads>0&&materials.bases>0,JSON.stringify({materials,errors,names:await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js');return f.scene.children.map(o=>[o.name,o.children.length]);})}));assert.ok(materials.maps<=2);
  }
  await page.evaluate(async()=>{
   const {fpvOutput:f}=await import('/app.js');window.samples={intervals:[],render:[],calls:[],active:false,last:0};
   const render=f.renderer.render.bind(f.renderer);f.renderer.render=(...args)=>{const now=performance.now(),s=window.samples,t=performance.now();render(...args);if(s.active){if(s.last)s.intervals.push(now-s.last);s.render.push(performance.now()-t);s.calls.push(f.renderer.info.render.calls);s.last=now;}if(window.captureFrame){window.captureFrame=f.canvas.toDataURL('image/png');}};
  });
  const hardware=await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js'),gl=f.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),canvas:[f.canvas.width,f.canvas.height],dpr:devicePixelRatio};});
  for(const streaming of [false,true]){
   if(streaming){await page.locator('#videoToggle').evaluate(b=>b.click());await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Streaming'));}
   await delay(2000);replayStart=performance.now();
   await page.evaluate(()=>{Object.assign(window.samples,{intervals:[],render:[],calls:[],active:true,last:0});});
   await delay(duration);const samples=await page.evaluate(()=>{window.samples.active=false;return window.samples;});replayStart=null;
   const video=await fetch(url+'/api/video').then(r=>r.json());
   assert.ok(samples.intervals.length>0,'sample must contain rendered frames');if(streaming)assert.ok(video.frames>0);
   const result={round:round+1,version,mjpeg:streaming,frames:samples.intervals.length,frameMs:summarize(samples.intervals),renderCpuMs:summarize(samples.render),drawCalls:summarize(samples.calls),videoFrames:video.frames,hardware};results.push(result);console.log(JSON.stringify(result));
  }
  if(round===0){
   frozen=true;await delay(150);const fixedCalls=await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js');return f.renderer.info.render.calls;});console.log(JSON.stringify({version,fixedRouteDrawCalls:fixedCalls}));results.push({version,fixedRouteDrawCalls:fixedCalls});
   for(const bump of ['current','off','on']){
    await page.evaluate(async bump=>{const {fpvOutput:f}=await import('/app.js');f.scene.traverse(o=>{if(o.name.startsWith('osm-building:'))for(const i of [1,2]){const m=o.material[i];if(bump!=='current'){m.bumpMap=bump==='on'?m.map:null;m.bumpScale=.025;m.needsUpdate=true;}}});window.captureFrame=true;},bump);await delay(100);
    const png=await page.evaluate(()=>window.captureFrame);await fs.writeFile(path.join(out,`${version}-${bump}.png`),Buffer.from(png.split(',')[1],'base64'));
   }
  }
  if(round===0){
   const building=overlay.buildings.find(b=>b.id==='way/614033817'),a=building.outer[0],b=building.outer[1],target=[(a[0]+b[0])/2,(a[1]+b[1])/2],centre=building.outer.reduce((sum,p)=>[sum[0]+p[0]/building.outer.length,sum[1]+p[1]/building.outer.length],[0,0]);
   const nx=target[0]-centre[0],nz=target[1]-centre[1],length=Math.hypot(nx,nz);
   for(const distance of [4,12]){
    const x=target[0]+nx/length*distance,z=target[1]+nz/length*distance,angle=-Math.atan2(target[1]-z,target[0]-x);
    forcedPose={position:{x,y:terrainHeight(terrain,x,z)+.12,z},rotation:{x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)},speed:0,heading:0};
    await delay(200);
    const pictures=[];
    for(const bump of ['off','on']){
     await page.evaluate(async bump=>{const {fpvOutput:f}=await import('/app.js');f.scene.traverse(o=>{if(o.name.startsWith('osm-building:'))for(const i of [1,2]){const m=o.material[i];m.bumpMap=bump==='on'?m.map:null;m.bumpScale=.025;m.needsUpdate=true;}});window.captureFrame=true;},bump);await delay(150);
     const png=await page.evaluate(()=>window.captureFrame);pictures.push(png);await fs.writeFile(path.join(out,`${version}-building-${distance}m-${bump}.png`),Buffer.from(png.split(',')[1],'base64'));
    }
    const difference=await page.evaluate(async pictures=>{const arrays=[];for(const src of pictures){const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);arrays.push(c.getImageData(0,0,canvas.width,canvas.height).data);}let sum=0,max=0,changed=0;for(let k=0;k<arrays[0].length;k+=4){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(arrays[0][k+c]-arrays[1][k+c]);sum+=d;max=Math.max(max,d);delta=Math.max(delta,d);}if(delta>2)changed++;}return {meanChannelDelta:sum/(arrays[0].length/4*3),maxChannelDelta:max,pixelsOver2:changed,pixelFraction:changed/(arrays[0].length/4)};},pictures);
    console.log(JSON.stringify({version,buildingDistance:distance,bumpDifference:difference}));results.push({version,buildingDistance:distance,bumpDifference:difference});
   }
  }
  assert.deepEqual(errors,[]);await context.close();await group.stop();
 }
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({route:{road:road.id,points:route,metres:[10,40],mount:{forward:.15,height:.16,right:0}},weather,rounds,duration,results},null,2));
}finally{await browser?.close();for(const group of groups)await group.stop();await fs.rm(temp,{recursive:true,force:true});}
