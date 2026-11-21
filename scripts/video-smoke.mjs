import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-video-'));
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.httpPort=8094;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
const server=spawn(process.execPath,['src/server.js','--standalone','--config',path.join(temp,'config.json')],{stdio:'pipe'});
let log='',browser,receiver,cameraProcess;server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
try{
 await delay(700);assert.equal(server.exitCode,null,log);
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8094');
 await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Standalone physics active');
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Start video',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Streaming'));
 const pipeline=await page.locator('#videoPipeline').inputValue();assert.match(pipeline,/souphttpsrc.*camera.mjpg.*multipartdemux.*jpegdec.*appsink name=outsink/);
 await page.keyboard.press('Escape');
 const video=()=>fetch('http://127.0.0.1:8094/api/video').then(r=>r.json());
 assert.equal((await video()).state,'streaming');
 // Decode an actual browser-rendered JPEG, including dimensions and nonblank pixels.
 const frame=await page.evaluate(async()=>{
  const response=await fetch('/camera.mjpg');const reader=response.body.getReader();let bytes=new Uint8Array();
  try{while(true){const chunk=await reader.read();if(chunk.done)throw Error('stream ended before JPEG');
    const next=new Uint8Array(bytes.length+chunk.value.length);next.set(bytes);next.set(chunk.value,bytes.length);bytes=next;
    const header=new TextDecoder().decode(bytes.subarray(0,200));const split=header.indexOf('\r\n\r\n');
    if(split<0)continue;const length=Number(header.match(/Content-Length: (\d+)/)[1]);
    if(bytes.length<split+4+length)continue;
    const bitmap=await createImageBitmap(new Blob([bytes.slice(split+4,split+4+length)],{type:'image/jpeg'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
    const sky=[...context.getImageData(480,80,1,1).data],ground=[...context.getImageData(480,420,1,1).data];
    const result={width:bitmap.width,height:bitmap.height,sky,ground,png:canvas.toDataURL('image/png').split(',')[1]};bitmap.close();return result;
  }}finally{await reader.cancel();}
 });
 await fs.writeFile('docs/video-frame.png',Buffer.from(frame.png,'base64'));
 assert.equal(frame.width,960);assert.equal(frame.height,540);assert.notDeepEqual(frame.sky,frame.ground,'camera frame contains the rendered scene');

 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Stop video',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent==='Video stopped');
 await delay(100);assert.equal((await video()).state,'idle');assert.equal((await fetch('http://127.0.0.1:8094/camera.mjpg')).status,503);
 await page.getByRole('button',{name:'Start video',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Streaming'));
 // Simulate the browser visibility lifecycle through its real event handlers.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await delay(100);assert.equal((await video()).state,'idle','hidden tab releases the stream');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Streaming'));
 await page.reload();await delay(100);assert.equal((await video()).state,'idle','reload releases publisher');
 // Reproduce the reported failure: video must outlive the visible browser.
 cameraProcess=spawn(process.execPath,['scripts/camera-stream.mjs','--url','http://127.0.0.1:8094'],{stdio:'pipe'});
 let cameraLog='';cameraProcess.stdout.on('data',v=>cameraLog+=v);cameraProcess.stderr.on('data',v=>cameraLog+=v);
 let ready=false;for(let i=0;i<200;i++){
  if(cameraProcess.exitCode!==null)throw Error(cameraLog);
  if((await video()).state==='streaming'){ready=true;break;}await delay(100);
 }
 assert.equal(ready,true,cameraLog);const before=(await video()).frames;
 await browser.close();browser=null;await delay(2500);
 assert.equal((await video()).state,'streaming','closing the HUD must not stop background video');
 assert.ok((await video()).frames>before,'background renderer keeps producing fresh frames');
 if(process.argv.includes('--gstreamer')){
  // Use the displayed Mission Planner pipeline, inserting only a finite test EOS.
  const args=['-v',...pipeline.replace(' ! appsink',' ! identity eos-after=6 ! appsink').replaceAll('"','').split(/\s+/)];
  receiver=spawn(process.env.GSTREAMER_BIN??'gst-launch-1.0',args,{stdio:'pipe'});let gstLog='';receiver.stdout.on('data',v=>gstLog+=v);receiver.stderr.on('data',v=>gstLog+=v);
  const [code]=await once(receiver,'exit',{signal:AbortSignal.timeout(15000)});assert.equal(code,0,gstLog);assert.match(gstLog,/width=\(int\)960/);assert.match(gstLog,/height=\(int\)540/);
 }
 cameraProcess.kill('SIGTERM');await once(cameraProcess,'exit');cameraProcess=null;await delay(100);
 assert.equal((await video()).state,'idle','stopping background renderer releases publisher');
 assert.deepEqual(errors,[]);console.log(`Camera start/stop/restart, background rendering after HUD closes, real WebGL JPEG content, MJPEG HTTP and ${process.argv.includes('--gstreamer')?'GStreamer BGRA appsink decoding':'browser decoding'} passed`);
}finally{if(cameraProcess&&cameraProcess.exitCode===null&&cameraProcess.signalCode===null){cameraProcess.kill('SIGTERM');await once(cameraProcess,'exit');}receiver?.kill('SIGTERM');await browser?.close();if(server.exitCode===null&&server.signalCode===null){server.kill('SIGTERM');await once(server,'exit');}await fs.rm(temp,{recursive:true,force:true});}
