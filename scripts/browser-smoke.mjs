import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-browser-'));
const config=JSON.parse(await fs.readFile('config/default.json'));config.httpPort=8092;
await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
const serverProcess=spawn('node',['src/server.js','--standalone','--config',path.join(temp,'config.json')],{stdio:'pipe'});
let log='';serverProcess.stderr.on('data',v=>log+=v);serverProcess.stdout.on('data',v=>log+=v);
let browser;
try {
  await delay(700);assert.equal(serverProcess.exitCode,null,log);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8092');await page.waitForFunction(()=>document.querySelector('#mode').textContent.includes('STANDALONE'));await delay(1000);
  await page.screenshot({path:'docs/standalone.png'});
  const state=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
  const before=await state();await page.keyboard.down('w');await delay(1500);await page.keyboard.up('w');const after=await state();assert.ok(after.position.x-before.position.x>.2,'keyboard moves backend');
  await page.selectOption('#camera','chase');await delay(500);await page.screenshot({path:'docs/chase.png'});
  await page.click('#run');await delay(200);const held=await state();await delay(300);assert.equal((await state()).simTime,held.simTime);
  await page.click('#reset');await delay(200);assert.ok(Math.abs((await state()).position.x)<.01);
  assert.deepEqual(errors,[]);console.log('Chrome FPV/chase rendering, keyboard, stop and standalone reset passed');
}finally{await browser?.close();serverProcess.kill('SIGTERM');await fs.rm(temp,{recursive:true,force:true});}
