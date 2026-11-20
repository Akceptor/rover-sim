import {performance} from 'node:perf_hooks';
import {WebSocketServer} from 'ws';
const MAX_FRAME=512*1024;
export class VideoRelay {
 constructor({staleMs=2000}={}){
  this.staleMs=staleMs;this.publisher=null;this.viewers=new Set();this.latest=null;this.last=null;this.frames=0;
  this.wss=new WebSocketServer({noServer:true,maxPayload:MAX_FRAME});
  this.wss.on('connection',ws=>{
   ws.on('error',()=>{});
   if(this.publisher){ws.close(1008,'Another browser tab is streaming');return;}
   this.publisher=ws;this.latest=null;this.last=null;this.frames=0;
   ws.send(JSON.stringify({type:'ready',width:960,height:540,fps:10}));
   ws.on('message',(bytes,binary)=>{
    const now=performance.now();
    if(!binary||ws!==this.publisher||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return;
    if(this.last!==null&&now-this.last<90)return;
    this.last=now;this.frames++;this.latest=Buffer.concat([Buffer.from(`--rover-frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes.length}\r\n\r\n`),bytes,Buffer.from('\r\n')]);
    for(const viewer of this.viewers)this.write(viewer);
   });
   ws.on('close',()=>{if(this.publisher===ws){this.publisher=null;this.latest=null;this.last=null;this.endViewers();}});
  });
  this.timer=setInterval(()=>{if(this.last!==null&&performance.now()-this.last>this.staleMs){this.latest=null;this.endViewers();}},Math.min(250,staleMs));this.timer.unref();
 }
 status(){const ageMs=this.last===null?null:Math.round(performance.now()-this.last);return {state:!this.publisher?'idle':this.latest&&ageMs<=this.staleMs?'streaming':'waiting',viewers:this.viewers.size,frames:this.frames,ageMs};}
 handleUpgrade(req,socket,head){
  if(req.headers.origin!==`http://${req.headers.host}`){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  this.wss.handleUpgrade(req,socket,head,ws=>this.wss.emit('connection',ws,req));
 }
 handleHttp(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/video'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(this.status()));return true;}
  if(pathname!=='/camera.mjpg')return false;
  if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end();return true;}
  if(this.status().state!=='streaming'){res.writeHead(503,{'Content-Type':'text/plain','Retry-After':'1','Cache-Control':'no-store'});res.end('Start Mission Planner video in simulator Settings and keep the browser tab visible.');return true;}
  if(this.viewers.size>=4){res.writeHead(503);res.end('Too many video viewers');return true;}
  res.writeHead(200,{'Content-Type':'multipart/x-mixed-replace; boundary=rover-frame','Cache-Control':'no-store, no-cache','X-Content-Type-Options':'nosniff'});res.flushHeaders();
  const viewer={res,blocked:false};this.viewers.add(viewer);
  res.on('drain',()=>{viewer.blocked=false;});res.on('close',()=>this.viewers.delete(viewer));res.on('error',()=>this.viewers.delete(viewer));
  this.write(viewer);return true;
 }
 write(viewer){if(!viewer.blocked&&!viewer.res.destroyed&&this.latest)viewer.blocked=!viewer.res.write(this.latest);}
 endViewers(){for(const {res} of this.viewers)res.end();this.viewers.clear();}
 close(){clearInterval(this.timer);this.endViewers();for(const ws of this.wss.clients)ws.terminate();this.wss.close();}
}
