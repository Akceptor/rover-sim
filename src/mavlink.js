// Receive-only MAVLink HEARTBEAT decoder. No commands or GCS heartbeats are sent.
// Framing and X.25 CRC: https://mavlink.io/en/guide/serialization.html
const modes={0:'MANUAL',1:'ACRO',3:'STEERING',4:'HOLD',5:'LOITER',6:'FOLLOW',7:'SIMPLE',8:'DOCK',9:'CIRCLE',10:'AUTO',11:'RTL',12:'SMART RTL',15:'GUIDED',16:'INITIALISING'};
function crc(bytes){let value=0xffff;for(const byte of bytes){let t=byte^(value&255);t^=(t<<4)&255;value=((value>>8)^(t<<8)^(t<<3)^(t>>4))&65535;}return value;}
export class HeartbeatTelemetry {
 constructor({systemId=1,timeoutMs=3000}={}){this.systemId=systemId;this.timeoutMs=timeoutMs;this.last=null;this.heartbeat=null;}
 receive(bytes,now){
  for(let offset=0;offset<bytes.length;){
   const v2=bytes[offset]===0xfd;if(!v2&&bytes[offset]!==0xfe){offset++;continue;}
   const header=v2?10:6;if(offset+header>bytes.length)break;
   const length=bytes[offset+1],flags=v2?bytes[offset+2]:0,size=header+length+2+((flags&1)?13:0);
   if(offset+size>bytes.length){offset++;continue;}
   const frame=bytes.subarray(offset,offset+size);offset+=size;
   const id=v2?frame.readUIntLE(7,3):frame[5],system=frame[v2?5:3],component=frame[v2?6:4];
   // Signed messages are deliberately ignored; this local simulation feed is unsigned.
   if(flags||id!==0||length!==9||system!==this.systemId||component!==1)continue;
   if(crc(Buffer.concat([frame.subarray(1,header+length),Buffer.from([50])]))!==frame.readUInt16LE(header+length))continue;
   const payload=frame.subarray(header,header+length);
   if(payload[4]!==10||payload[5]!==3||payload[8]!==3)continue; // ArduPilot ground rover only
   const customMode=payload.readUInt32LE(0);
   this.heartbeat={armed:!!(payload[6]&128),flightMode:payload[6]&1?(modes[customMode]??`MODE ${customMode}`):null,customMode};this.last=now;
  }
 }
 snapshot(now){const ageMs=this.last===null?null:Math.max(0,Math.round(now-this.last)),connected=ageMs!==null&&ageMs<=this.timeoutMs;return {connected,armed:connected?this.heartbeat.armed:null,flightMode:connected?this.heartbeat.flightMode:null,customMode:connected?this.heartbeat.customMode:null,ageMs};}
}
