// Receive-only MAVLink heartbeat, RC input and simulation location decoder.
// Framing and X.25 CRC: https://mavlink.io/en/guide/serialization.html
const modes={0:'MANUAL',1:'ACRO',3:'STEERING',4:'HOLD',5:'LOITER',6:'FOLLOW',7:'SIMPLE',8:'DOCK',9:'CIRCLE',10:'AUTO',11:'RTL',12:'SMART RTL',15:'GUIDED',16:'INITIALISING'};
function crc(bytes){let value=0xffff;for(const byte of bytes){let t=byte^(value&255);t^=(t<<4)&255;value=((value>>8)^(t<<8)^(t<<3)^(t>>4))&65535;}return value;}
export class HeartbeatTelemetry {
 constructor({systemId=1,timeoutMs=3000}={}){this.systemId=systemId;this.timeoutMs=timeoutMs;this.last=null;this.heartbeat=null;this.rcLast=null;this.channels=[];}
 receive(bytes,now){
  for(let offset=0;offset<bytes.length;){
   const v2=bytes[offset]===0xfd;if(!v2&&bytes[offset]!==0xfe){offset++;continue;}
   const header=v2?10:6;if(offset+header>bytes.length)break;
   const length=bytes[offset+1],flags=v2?bytes[offset+2]:0,size=header+length+2+((flags&1)?13:0);
   if(offset+size>bytes.length){offset++;continue;}
   const frame=bytes.subarray(offset,offset+size);offset+=size;
   const id=v2?frame.readUIntLE(7,3):frame[5],system=frame[v2?5:3],component=frame[v2?6:4];
   // Signed messages are deliberately ignored; this local simulation feed is unsigned.
   const spec={0:{length:9,extra:50},33:{length:28,extra:104},35:{length:22,extra:244},65:{length:42,extra:118},164:{length:44,extra:154}}[id];
   if(flags||!spec||length>spec.length||length<1||(!v2&&length!==spec.length)||system!==this.systemId||component!==1)continue;
   if(crc(Buffer.concat([frame.subarray(1,header+length),Buffer.from([spec.extra])]))!==frame.readUInt16LE(header+length))continue;
   // MAVLink 2 can omit zero bytes at the end of a payload.
   const payload=Buffer.alloc(spec.length);frame.copy(payload,0,header,header+length);
   if(id===164||id===33){
    const lat=payload.readInt32LE(id===164?36:4)/1e7,lon=payload.readInt32LE(id===164?40:8)/1e7;
    if(Math.abs(lat)>85||Math.abs(lon)>180)continue;
    if(id===164)this.simPosition={lat,lon,last:now};else this.globalPosition={lat,lon,alt:payload.readInt32LE(12)/1000,last:now};
    continue;
   }
   if(id===35||id===65){
    if(id===35&&payload[20]!==0)continue; // Only the first RC input bank contains RC2/4.
    const count=id===65?Math.min(18,payload[40]):8;
    this.channels=Array.from({length:count},(_,i)=>payload.readUInt16LE(4+i*2));this.rcLast=now;continue;
   }
   if(payload[4]!==10||payload[5]!==3||payload[8]!==3)continue; // ArduPilot ground rover only
   const customMode=payload.readUInt32LE(0);
   this.heartbeat={armed:!!(payload[6]&128),flightMode:payload[6]&1?(modes[customMode]??`MODE ${customMode}`):null,customMode};this.last=now;
  }
 }
 rcSnapshot(now){const ageMs=this.rcLast===null?null:Math.max(0,Math.round(now-this.rcLast));return {connected:ageMs!==null&&ageMs<=this.timeoutMs,channels:[...this.channels],ageMs};}
 positionSnapshot(now){
  const a=this.simPosition,b=this.globalPosition;
  if(!a||!b||now-a.last>this.timeoutMs||now-b.last>this.timeoutMs||Math.abs(a.lat-b.lat)>.0001||Math.abs(a.lon-b.lon)>.0001)return null;
  return {lat:a.lat,lon:a.lon,alt:b.alt};
 }
 snapshot(now){const ageMs=this.last===null?null:Math.max(0,Math.round(now-this.last)),connected=ageMs!==null&&ageMs<=this.timeoutMs;return {connected,armed:connected?this.heartbeat.armed:null,flightMode:connected?this.heartbeat.flightMode:null,customMode:connected?this.heartbeat.customMode:null,ageMs};}
}
