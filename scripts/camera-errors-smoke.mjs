// Real Chromium diagnostics, including module loading failures that do not emit pageerror.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';

const server=http.createServer((req,res)=>{
 if(req.url==='/api/video'){res.setHeader('Content-Type','application/json');res.end('{"state":"idle"}');return;}
 if(req.url==='/broken-module.js'){res.writeHead(404);res.end();return;}
 if(req.url==='/network-failure'){req.socket.destroy();return;}
 res.setHeader('Content-Type','text/html');
 res.end(`<span id="connection" data-state="offline">Backend offline</span><span id="videoStatus">Video stopped</span>
 <script type="module" src="/broken-module.js"></script>
 <script>
 console.error('Camera fixture console error');
 fetch('/network-failure').catch(()=>{});
 setTimeout(()=>{throw Error('Camera fixture runtime failure');},0);
 </script>`);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
let child,closed,output='';
try{
 child=spawn(process.execPath,['scripts/camera-stream.mjs','--url',`http://127.0.0.1:${server.address().port}`],{stdio:['ignore','pipe','pipe']});
 closed=once(child,'close');
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk);
 const [code]=await closed;
 assert.equal(code,1,output);
 assert.match(output,/HTTP 404.*\/broken-module\.js/);
 assert.match(output,/Request failed: GET .*\/network-failure.*net::ERR_/);
 assert.match(output,/Browser console error: Camera fixture console error/);
 assert.match(output,/Camera page error: Error: Camera fixture runtime failure/);
 assert.match(output,/Camera startup failed while waiting for simulator state/);
 assert.match(output,/connection=Backend offline/);
 assert.match(output,/video=Video stopped/);
 assert.match(output,/page\.waitForFunction: Timeout/);
 console.log('Camera HTTP failures, network failures, console errors, runtime stacks and startup context logged');
}finally{
 if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await closed;}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
