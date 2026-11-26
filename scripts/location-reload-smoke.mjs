import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ProcessGroup} from '../src/process-group.js';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rover-location-reload-'));
const group=new ProcessGroup();let browser;
try{
 const config=JSON.parse(await fs.readFile('config/default.json'));
 Object.assign(config,{httpPort:8111,osm:false,savedLocationsDir:path.join(temp,'saved')});
 await fs.writeFile(path.join(temp,'config.json'),JSON.stringify(config));
 group.start('backend',process.execPath,['src/server.js','--standalone','--location-picker','--config',path.join(temp,'config.json')],{ipc:true});
 const url='http://127.0.0.1:8111',state=()=>fetch(url+'/api/state').then(r=>r.json());
 for(let i=0;i<100;i++){try{await state();break;}catch{await delay(50);}}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());await page.goto(url);
 await page.waitForFunction(()=>!document.querySelector('#loadLocation').disabled);
 await page.selectOption('#locationSelect','kyiv');await page.locator('#loadLocation').click();
 await page.waitForFunction(()=>document.querySelector('#landscape').textContent.includes('Kyiv'));
 await page.waitForFunction(()=>!document.querySelector('#loadLocation').disabled,{},{timeout:3000});
 await page.getByRole('button',{name:'Start physics',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#loadLocation').disabled);
 assert.equal((await state()).running,true);
 await page.getByRole('button',{name:'Stop physics',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#loadLocation').disabled);
 await page.selectOption('#locationSelect','lima');await page.locator('#loadLocation').click();
 await page.waitForFunction(()=>document.querySelector('#landscape').textContent.includes('Lima'));
 await page.waitForFunction(()=>!document.querySelector('#loadLocation').disabled);
 const changed=await state();assert.equal(changed.selectedLocation,'lima');assert.equal(changed.running,false);
 // Reload the same location, including after the first drive has completed.
 await page.locator('#loadLocation').click();
 await page.waitForFunction(async revision=>(await fetch('/api/state').then(r=>r.json())).worldRevision>revision,changed.worldRevision);
 await page.waitForFunction(()=>!document.querySelector('#loadLocation').disabled);
 await page.getByRole('button',{name:'Start physics',exact:true}).click();await page.getByRole('button',{name:'Stop physics',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#loadLocation').disabled);
 await fs.mkdir('.run/location-reload',{recursive:true});await page.screenshot({path:'.run/location-reload/stopped.png'});
 assert.deepEqual(errors,[]);console.log('Standalone location reload: first load, drive/stop, second preset, same-preset reload and drive again passed');
}finally{await browser?.close();await group.stop();await fs.rm(temp,{recursive:true,force:true});}
