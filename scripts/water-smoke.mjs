import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
import {terrain} from '../test/fixtures/osm.js';
const node=(id,x,z)=>({type:'node',id,lat:x/110574.2758,lon:z/111319.4908});
const fixture={elements:[node(1,3,-8),node(2,15,-8),node(3,15,8),node(4,3,8),{type:'way',id:10,nodes:[1,4],tags:{waterway:'stream',width:'2'}}]};
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-water-')),group=new ProcessGroup();let browser,overpass;
try{
 overpass=http.createServer((req,res)=>{req.resume();res.end(JSON.stringify(fixture));});overpass.listen(0,'127.0.0.1');await once(overpass,'listening');
 const file=path.join(temp,'terrain.json');await fs.writeFile(file,JSON.stringify({...terrain,colors:Array(terrain.heights.length*3).fill(130)}));
 const config=JSON.parse(await fs.readFile('config/default.json'));
 Object.assign(config,{httpPort:8114,terrain:file,savedLocationsDir:path.join(temp,'saved'),osm:{endpoint:`http://127.0.0.1:${overpass.address().port}`,bundledDir:null,cacheDir:path.join(temp,'cache')}});
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8114',state=()=>fetch(url+'/api/state').then(r=>r.json());
 for(let i=0;i<150;i++){try{if((await state()).osm.status==='ready')break;}catch{}await delay(50);}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(()=>{
  const Original=WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='init')window.worldInit=m;if(m.type==='state')window.latestState=m;}catch{}});}};
  const fill=CanvasRenderingContext2D.prototype.fillText;window.waterVideoCredit=false;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(window.latestState?.water?.controlsDisabled&&String(text).includes('OpenStreetMap'))window.waterVideoCredit=true;return fill.call(this,text,...args);};
  const draw=CanvasRenderingContext2D.prototype.drawImage;window.videoSnowFrames=0;
  CanvasRenderingContext2D.prototype.drawImage=function(source,...args){const result=draw.call(this,source,...args);if(source.id==='view'&&window.latestState?.water?.controlsDisabled){const p=this.getImageData(200,200,80,40).data;let gray=0;for(let i=0;i<p.length;i+=4)if(Math.abs(p[i]-p[i+1])<=1&&Math.abs(p[i+1]-p[i+2])<=1)gray++;if(gray>3000)window.videoSnowFrames++;}return result;};
 });
 await page.goto(url);await page.waitForFunction(()=>window.worldInit?.overlay?.water?.features?.length===1);
 const hasMesh=await page.evaluate(async()=>{const {fpvOutput:f}=await import('/app.js');let n=0;f.scene.traverse(o=>{if(o.name.startsWith('osm-water:'))n++;});return n;});assert.ok(hasMesh>0,'water meshes rendered');
 assert.equal(await page.locator('#osmAttribution').isVisible(),true);assert.ok(await page.locator('#waterLegend').isVisible());
 await fs.mkdir('.run/water',{recursive:true});await page.screenshot({path:'.run/water/before.png'});
 await page.locator('#settings').click();await page.locator('#videoToggle').click();await page.locator('#closeSettings').click();
 await page.locator('#viewport').click();await page.keyboard.down('w');
 await page.waitForFunction(()=>window.latestState?.water?.controlsDisabled,null,{timeout:12000});
 await page.keyboard.up('w');await page.waitForFunction(()=>document.querySelector('#view').dataset.signal==='lost');
 assert.ok(await page.locator('#waterStatus').isVisible());assert.match(await page.locator('#waterStatus').textContent(),/Reset vehicle/);
 assert.equal((await state()).inputs.throttle,0);await page.keyboard.down('w');await delay(150);await page.keyboard.up('w');assert.equal((await state()).inputs.throttle,0);
 await page.waitForFunction(()=>window.videoSnowFrames>1&&window.waterVideoCredit);await page.screenshot({path:'.run/water/snow.png'});
 await page.waitForFunction(()=>window.latestState?.water?.state==='submerged',null,{timeout:12000});assert.ok((await state()).position.y<-.5);
 await page.getByRole('button',{name:'Reset vehicle',exact:true}).click();
 await page.waitForFunction(()=>!window.latestState?.water?.controlsDisabled&&document.querySelector('#view').dataset.signal==='ok');
 assert.equal(await page.locator('#waterStatus').isVisible(),false);assert.ok((await state()).position.y>0);
 await page.screenshot({path:'.run/water/reset.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Water: mesh, map legend, sinking, blocked controls, actual video snow, bounded descent, reset and mobile passed');
}finally{await browser?.close();await group.stop();if(overpass){overpass.closeAllConnections();await new Promise(r=>overpass.close(r));}await fs.rm(temp,{recursive:true,force:true});}
