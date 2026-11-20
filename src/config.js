import fs from 'node:fs';
export function loadConfig(path=new URL('../config/default.json',import.meta.url)) {
  const c=JSON.parse(fs.readFileSync(path));
  for(const key of ['steering','throttle']) {const p=c[key];if(!p||!Number.isInteger(p.channel)||p.channel<1||p.channel>32||!(800<=p.min&&p.min<p.trim&&p.trim<p.max&&p.max<=2200)||typeof p.reversed!=='boolean')throw Error(`invalid ${key} calibration`);}
  if(c.steering.channel===c.throttle.channel)throw Error('channels must differ');
  for(const [k,v]of Object.entries(c.vehicle))if(!Number.isFinite(v)||v<=0)throw Error(`invalid vehicle ${k}`);
  for(const k of ['httpPort','udpPort'])if(!Number.isInteger(c[k])||c[k]<1||c[k]>65535)throw Error(`invalid ${k}`);
  if(!(c.timeoutMs>=100&&c.timeoutMs<=30000))throw Error('invalid timeout');
  if(c.mavlink){const m=c.mavlink;
    if(typeof m.host!=='string'||!m.host||!Number.isInteger(m.port)||m.port<1||m.port>65535||!Number.isInteger(m.systemId)||m.systemId<1||m.systemId>255||!Number.isFinite(m.timeoutMs)||m.timeoutMs<100||m.timeoutMs>30000)throw Error('invalid mavlink configuration');
  }
  return c;
}
