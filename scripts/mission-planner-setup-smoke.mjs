import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-mp-setup-'));
let logs='',browser;const group=new ProcessGroup({log:line=>{logs+=line+'\n';}});
const config=JSON.parse(await fs.readFile('config/default.json'));config.osm=false;config.httpPort=8105;config.udpPort=9012;config.mavlink.port=14570;
const extra=path.join(temp,'Extra params.parm');await fs.writeFile(extra,'CRUISE_SPEED 1\n');await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
const url='http://127.0.0.1:8105';
try{
 group.start('launcher',process.execPath,['scripts/launch.mjs','--mission-planner','--no-video','--config',path.join(temp,'config.json'),'--extra-params',extra],{ipc:true});
 for(let i=0;i<100;i++){try{if((await fetch(url+'/api/state')).ok)break;}catch{}await delay(50);}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#missionPlannerSetup')?.hidden===false,{},{timeout:5000});
 const command=await page.locator('#missionPlannerCommand').inputValue();
 assert.match(command,/--sim-port-out 9012/);assert.match(command,/udpclient:127.0.0.1:14570/);assert.ok(command.includes(extra));assert.ok(command.includes('"'),'defaults containing spaces are quoted');
 const printed=logs.split('Extra command line:\n')[1]?.split('\n')[0].replace(/^\[launcher\] /,'');assert.equal(command,printed,"browser text is exactly the launcher's printed command");
 await page.getByRole('button',{name:'Copy command',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#missionPlannerCopyStatus').textContent==='Copied');
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),command);
 await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async()=>{throw Error('Permission denied');}}));
 await page.getByRole('button',{name:'Copy command',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#missionPlannerCopyStatus').textContent.includes('selected'));
 assert.equal(await page.locator('#missionPlannerCommand').evaluate(e=>e.value.substring(e.selectionStart,e.selectionEnd)),command);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#missionPlannerCommand')?.value.length>0,{},{timeout:5000});assert.equal(await page.locator('#missionPlannerCommand').inputValue(),command);
 await page.setViewportSize({width:390,height:844});await delay(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#missionPlannerSetup').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(os.tmpdir(),'rover-mission-planner-setup.png')});assert.deepEqual(errors,[]);
 console.log('Mission Planner browser setup: exact launcher command with extra params/custom ports, clipboard contents, permission-denied selection fallback, reload and mobile layout passed');
}catch(error){console.error(logs);throw error;}
finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
