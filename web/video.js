// Capture immediately after WebGL rendering, before its drawing buffer is cleared.
// Frames are skipped, never queued, while the socket still holds the previous one: a backlog is pure latency.
export class CameraVideo {
 constructor(){
  this.button=document.getElementById('videoToggle');this.status=document.getElementById('videoStatus');
  this.wanted=false;this.ws=null;this.ready=false;this.busy=false;this.last=0;this.timer=null;this.sent=0;this.fps=25;this.renders=0;this.statsAt=0;this.encodeTotal=0;this.encodes=0;this.skippedBacklog=0;this.oversize=0;
  this.canvas=document.createElement('canvas');this.canvas.width=960;this.canvas.height=540;this.context=this.canvas.getContext('2d',{alpha:false});
  const url=new URL('/camera.mjpg',location.href).href;
  document.getElementById('videoUrl').value=url;
  document.getElementById('videoPipeline').value=`souphttpsrc location="${url}" is-live=true do-timestamp=true ! multipartdemux ! jpegdec ! queue max-size-buffers=1 leaky=downstream ! videoconvert ! video/x-raw,format=BGRA ! appsink name=outsink sync=false max-buffers=1 drop=true wait-on-eos=false`;
  this.button.onclick=()=>{this.wanted=!this.wanted;this.button.textContent=this.wanted?'Stop video':'Start video';if(this.wanted)this.connect();else this.disconnect('Video stopped');};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.disconnect(this.wanted?'Paused · keep this browser tab visible':'Video stopped');else if(this.wanted)this.connect();});
  addEventListener('pagehide',()=>{this.wanted=false;this.disconnect('Video stopped');});
 }
 setStatus(text){if(this.status.textContent!==text)this.status.textContent=text;}
 connect(){
  if(!this.wanted||document.hidden||this.ws)return;
  clearTimeout(this.timer);this.ready=false;this.sent=0;this.renders=0;this.statsAt=performance.now();this.encodeTotal=0;this.encodes=0;this.skippedBacklog=0;this.oversize=0;this.setStatus('Connecting video…');
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/video-source`);this.ws=ws;
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(this.ws===ws&&m.type==='ready'){this.ready=true;this.fps=m.fps||this.fps;this.setStatus('Waiting for camera frame…');}};
  ws.onerror=()=>{};
  ws.onclose=e=>{
   if(this.ws!==ws)return;this.ws=null;this.ready=false;
   if(e.code===1008){this.wanted=false;this.button.textContent='Start video';this.setStatus('Another camera renderer is streaming');return;}
   if(this.wanted&&!document.hidden){this.setStatus('Video disconnected · reconnecting…');this.timer=setTimeout(()=>this.connect(),1000);}
  };
 }
 disconnect(message){clearTimeout(this.timer);const ws=this.ws;this.ws=null;this.ready=false;ws?.close();this.setStatus(message);}
 capture(source,now){
  const ws=this.ws;this.renders++;
  if(now-this.statsAt>=1000){if(ws?.readyState===WebSocket.OPEN&&this.ready)ws.send(JSON.stringify({type:'stats',renderFps:Math.round(this.renders*1e4/(now-this.statsAt))/10,encodeMs:this.encodes?Math.round(this.encodeTotal/this.encodes*10)/10:0,skippedBacklog:this.skippedBacklog,oversize:this.oversize}));this.statsAt=now;this.renders=0;this.encodeTotal=0;this.encodes=0;}
  if(!this.wanted||!this.ready||this.busy||document.hidden||ws?.readyState!==WebSocket.OPEN||now-this.last<1000/this.fps)return;
  if(ws.bufferedAmount>0){this.skippedBacklog++;return;}
  this.last=now;this.busy=true;const started=performance.now();
  // Letterbox instead of stretching a resized or narrow viewport.
  const scale=Math.min(960/source.width,540/source.height),width=source.width*scale,height=source.height*scale;
  this.context.fillStyle='#000';this.context.fillRect(0,0,960,540);this.context.drawImage(source,(960-width)/2,(540-height)/2,width,height);
  if(this.attribution){this.context.font='10px sans-serif';this.context.fillStyle='#000a';this.context.fillRect(0,523,960,17);this.context.fillStyle='#fff';this.context.fillText(this.attribution,6,535,948);}
  this.canvas.toBlob(blob=>{
   this.busy=false;this.encodeTotal+=performance.now()-started;this.encodes++;
   if(blob?.size>512*1024)this.oversize++;
   if(!blob||blob.size>512*1024||this.ws!==ws||!this.ready||!this.wanted||document.hidden||ws.readyState!==WebSocket.OPEN)return;
   ws.send(blob);this.sent++;this.setStatus(`Streaming · 960 × 540 · up to ${this.fps} fps`);
  },'image/jpeg',.72);
 }
}
