import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
async function untilClosed(done,ms){let timer;try{await Promise.race([done,new Promise(resolve=>timer=setTimeout(resolve,ms))]);}finally{clearTimeout(timer);}}
async function stopWindowsTree(pid){
 const killer=spawn('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 await untilClosed(new Promise(resolve=>{killer.once('close',resolve);killer.once('error',resolve);}),4000);
 if(killer.exitCode===null){try{killer.kill();}catch{}}
 return killer.exitCode===0;
}
export class ProcessGroup {
 constructor({log=console.log,graceMs=4000}={}){
  this.log=log;this.graceMs=graceMs;this.children=[];this.stopping=false;this.controller=new AbortController();
  this.finished=new Promise(resolve=>this.resolve=resolve);
 }
 start(name,command,args,{ipc=false,...options}={}){
  if(this.stopping)throw Error('Process group is stopping');
  const child=spawn(command,args,{...options,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe',...(ipc?['ipc']:[])]});
  const entry={name,child,closed:false};this.children.push(entry);
  for(const stream of [child.stdout,child.stderr]){const lines=createInterface({input:stream});lines.on('line',line=>this.log(`[${name}] ${line}`));}
  entry.done=new Promise(resolve=>child.once('close',(code,signal)=>{
   entry.closed=true;resolve();
   if(!this.stopping&&!entry.intentional){this.log(`[launcher] ${name} exited (${code??signal}); stopping other services.`);void this.stop(1);}
  }));
  child.on('error',error=>{this.log(`[${name}] ${error.message}`);if(!this.stopping)void this.stop(1);});
  return child;
 }
 async stopChild(child){
  const entry=this.children.find(entry=>entry.child===child);
  if(!entry||entry.closed)return;
  entry.intentional=true;
  if(child.connected){try{child.send({type:'shutdown'},()=>{});}catch{}}
  else if(process.platform==='win32'&&child.pid){await stopWindowsTree(child.pid);}
  else if(child.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}}
  await untilClosed(entry.done,this.graceMs);
  if(process.platform!=='win32'&&child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{}}
  else if(!entry.closed&&child.pid){await stopWindowsTree(child.pid);}
  await untilClosed(entry.done,1000);
  if(!entry.closed)throw Error(`Could not stop ${entry.name}`);
 }
 stop(code=0){
  if(this.stopping)return this.finished;
  this.stopping=true;this.controller.abort();
  void(async()=>{
   for(const entry of [...this.children].reverse()){
    const {child,name}=entry;
    if(entry.closed){
     if(process.platform!=='win32'&&child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{}}
     continue;
    }
    this.log(`[launcher] Stopping ${name}…`);
    if(child.connected){try{child.send({type:'shutdown'},()=>{});}catch{}}
    else if(process.platform==='win32'&&child.pid){
     if(!await stopWindowsTree(child.pid)){try{child.kill('SIGKILL');}catch{}}
    }
    else {try{process.kill(-child.pid,'SIGTERM');}catch{}}
    await untilClosed(entry.done,this.graceMs);
    if(!entry.closed){
     if(process.platform==='win32'&&child.pid){
      if(!await stopWindowsTree(child.pid)){try{child.kill('SIGKILL');}catch{}}
     }else if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}}
     await untilClosed(entry.done,1000);
    }
    // A graceful parent exit can leave helpers in its detached Unix group.
    if(process.platform!=='win32'&&child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{}}
    if(!entry.closed){this.log(`[launcher] Could not stop ${name}; cleanup incomplete.`);code=1;}
   }
   this.resolve(code);
  })().catch(error=>{this.log(`[launcher] Cleanup failed: ${error.message}`);this.resolve(1);});
  return this.finished;
 }
}
