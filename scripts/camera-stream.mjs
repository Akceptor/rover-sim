#!/usr/bin/env node
// Dedicated headless camera publisher. The visible HUD can be hidden or closed.
import {chromium} from 'playwright';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{url:{type:'string',default:'http://127.0.0.1:8090'},camera:{type:'string',default:'fpv'},fov:{type:'string',default:'85'},browser:{type:'string',default:'auto'},help:{type:'boolean',default:false}}});
if(values.help){console.log('npm run video -- [--url http://127.0.0.1:8090] [--camera fpv|chase] [--fov 40..120] [--browser auto|chrome|msedge]');process.exit(0);}
let browser,stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;await browser?.close();if(process.connected)process.disconnect();};
process.on('message',m=>{if(m?.type==='shutdown')void stop();});process.on('disconnect',()=>void stop());
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try{
 const url=new URL(values.url),fov=Number(values.fov);
 if(!['http:','https:'].includes(url.protocol))throw Error('--url must use http or https');
 if(!['fpv','chase'].includes(values.camera))throw Error('--camera must be fpv or chase');
 if(!Number.isFinite(fov)||fov<40||fov>120)throw Error('--fov must be between 40 and 120');
 if(!['auto','chrome','msedge'].includes(values.browser))throw Error('--browser must be auto, chrome or msedge');
 const statusUrl=new URL('/api/video',url);
 let current;
 try{const response=await fetch(statusUrl,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(`HTTP ${response.status}`);current=await response.json();}
 catch(error){throw Error(`Cannot reach simulator at ${url.origin}. Start the backend first. ${error.message}`);}
 if(current.state!=='idle')throw Error('A video publisher is already connected. Stop video in the visible HUD (or stop the other background renderer) first.');
 const channels=values.browser==='auto'?['chrome','msedge']:[values.browser];
 const failures=[];
 for(const channel of channels){try{browser=await chromium.launch({channel,headless:true,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});break;}catch(error){failures.push(`${channel}: ${error.message.split('\n')[0]}`);}}
 if(!browser)throw Error(`Install Chrome or Microsoft Edge, then retry. ${failures.join('; ')}`);
 if(stopping){await browser.close();}else{
  const disconnected=new Promise(resolve=>browser.once('disconnected',resolve));
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  page.on('pageerror',error=>console.error(`Camera page error: ${error.message}`));
  url.pathname='/';url.search='?camera-output=1';url.hash='';
  await page.goto(url.href,{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#connection')?.textContent!=='Backend offline',null,{timeout:10000});
  await page.evaluate(({camera,fov})=>{
   const select=document.getElementById('camera');select.value=camera;select.dispatchEvent(new Event('change'));
   const input=document.getElementById('fov');input.value=String(fov);input.dispatchEvent(new Event('input'));
   document.getElementById('videoToggle').click();
  },{camera:values.camera,fov});
  await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.startsWith('Streaming'),null,{timeout:15000});
  console.log(`Background camera streaming: ${new URL('/camera.mjpg',url).href}`);
  console.log(`${values.camera.toUpperCase()} · ${fov}° FPV FOV · 960 × 540 · up to 10 fps. The visible HUD may be closed. Ctrl+C stops video.`);
  await disconnected;
  if(!stopping)throw Error('Background browser exited unexpectedly; restart npm run video.');
 }
}catch(error){if(!stopping){console.error(error.message);process.exitCode=1;}}
finally{await stop();}
