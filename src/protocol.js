export function decodeActuators(b) {
  if(b.length<8) throw Error('short actuator header');
  const magic=b.readUInt16LE(0), n=magic===18458?16:magic===29569?32:0;
  const rate=b.readUInt16LE(2);
  if(!n || b.length!==8+n*2 || rate<50 || rate>2000) throw Error(`invalid actuator packet: magic=${magic} size=${b.length} rate=${rate}`);
  return {rate,count:b.readUInt32LE(4),pwm:Array.from({length:n},(_,i)=>b.readUInt16LE(8+i*2))};
}
export function encodeSensors(s) {
  const json=JSON.stringify(s,(_,v)=>{if(typeof v==='number'&&!Number.isFinite(v))throw Error('nonfinite sensor');return v;});
  return Buffer.from(`\n${json}\n`);
}
export function pwm(value,c) {
  if(!Number.isFinite(value)||value<800||value>2200)return 0;
  const n=(value-c.trim)/(value>=c.trim?c.max-c.trim:c.trim-c.min);
  return Math.max(-1,Math.min(1,n))*(c.reversed?-1:1);
}
export class FrameClock {
  count=null;
  accept(count,rate) {
    if(this.count===null){this.count=count;return {kind:'step',steps:1,dt:1/rate};}
    const delta=(count-this.count)>>>0;
    if(delta===0)return {kind:'duplicate',steps:0};
    if(delta>0x80000000){if(count===0){this.count=count;return {kind:'restart',steps:1,dt:1/rate};}return {kind:'old',steps:0};}
    if(delta>Math.min(rate,500))return {kind:'gap',steps:0};
    this.count=count;return {kind:'step',steps:delta,dt:1/rate};
  }
}
