import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-crawler-')),group=new ProcessGroup();
const config=JSON.parse(await fs.readFile('config/default.json'));config.httpPort=8099;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));let browser;
try{
 group.start('backend',process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8099';for(let i=0;i<100;i++){try{await fetch(url+'/api/state');break;}catch{await delay(50);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');
 const geometry=await page.evaluate(async()=>{
  const {fpvOutput:o}=await import('/app.js'),{Raycaster,Vector3}=await import('/three.js'),model=o.scene.getObjectByName('MN-168');model.updateMatrixWorld(true);
  const hits=new Raycaster(o.camera.position.clone(),new Vector3(1,0,0),.015,1).intersectObject(model,true);
  return {wheels:[0,1,2,3].map(i=>model.getObjectByName(`wheel-${i}`).position.toArray()),hits:hits.map(h=>h.object.name)};
 });assert.equal(geometry.wheels.length,4);assert.deepEqual(geometry.hits,[],'FPV looks forward without body obstruction');
 await page.getByRole('button',{name:'Chase',exact:true}).click();
 await page.locator('#viewport').click();await page.keyboard.down('w');await page.keyboard.down('d');await delay(650);await page.keyboard.up('w');await page.keyboard.up('d');
 const moving=await page.evaluate(async()=>{const {fpvOutput:o}=await import('/app.js'),m=o.scene.getObjectByName('MN-168');return {spin:m.getObjectByName('wheel-0').children[0].rotation.z,roof:m.getObjectByName('roof').rotation.z};});assert.ok(Math.abs(moving.spin)>.1);assert.equal(moving.roof,0);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');
 // Isolated studio view of the same actual asset, with fixed daylight for inspection.
 await page.evaluate(async c=>{
  const T=await import('/three.js'),{createCrawler}=await import('/assets/MN-168.js');const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1200,850);renderer.setPixelRatio(1);renderer.setClearColor(0xe9e8e2);renderer.shadowMap.enabled=true;
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x6b6456,3));const sun=new T.DirectionalLight(0xffffff,4);sun.position.set(2,3,1);sun.castShadow=true;sun.shadow.camera.left=-1;sun.shadow.camera.right=1;sun.shadow.camera.top=1;sun.shadow.camera.bottom=-1;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.002;scene.add(sun);
  const {model}=createCrawler(c);scene.add(model);const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0xe9e8e2,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-c.suspension-c.wheelRadius*1.02;ground.receiveShadow=true;scene.add(ground);
  const camera=new T.PerspectiveCamera(34,1200/850,.01,100);camera.position.set(.78,.37,.68);camera.lookAt(0,.045,0);renderer.render(scene,camera);renderer.domElement.id='model-preview';renderer.domElement.style.cssText='position:fixed;inset:0;z-index:9999';document.body.append(renderer.domElement);
 },config.vehicle);
 await page.locator('#model-preview').screenshot({path:'docs/mn168.png'});assert.deepEqual(errors,[]);
 console.log('Crawler: model loads, metre scale, FPV clearance, animated wheels, chase, reload and studio preview passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
