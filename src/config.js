import fs from 'node:fs';
import {normalizeWaterSettings} from './water.js';
import {resolveVehicleConfig} from './vehicles.js';
export function loadConfig(path=new URL('../config/default.json',import.meta.url)) {
  const c=resolveVehicleConfig(JSON.parse(fs.readFileSync(path)));
  for(const k of ['httpPort','udpPort'])if(!Number.isInteger(c[k])||c[k]<1||c[k]>65535)throw Error(`invalid ${k}`);
  if(!(c.timeoutMs>=100&&c.timeoutMs<=30000))throw Error('invalid timeout');
  if(c.videoSize!==undefined&&!['960x540','640x360'].includes(c.videoSize))throw Error('invalid videoSize: use 960x540 or 640x360');
  if(c.terrain!==undefined&&c.terrain!==null&&(typeof c.terrain!=='string'||!c.terrain.trim()))throw Error('invalid terrain configuration');
  if(c.terrainCacheDir!==undefined&&(typeof c.terrainCacheDir!=='string'||!c.terrainCacheDir))throw Error('invalid terrain cache directory');
  if(c.savedLocationsDir!==undefined&&(typeof c.savedLocationsDir!=='string'||!c.savedLocationsDir.trim()))throw Error('invalid saved locations directory');
  if(c.osm!==undefined&&c.osm!==false){
    const o=c.osm;if(!o||typeof o!=='object'||Array.isArray(o))throw Error('invalid osm configuration');
    normalizeWaterSettings(o.water);
    if(o.defaultHeight!==undefined&&(!Number.isFinite(o.defaultHeight)||o.defaultHeight<=0||o.defaultHeight>500))throw Error('invalid osm default height');
    if(o.timeoutMs!==undefined&&(!Number.isInteger(o.timeoutMs)||o.timeoutMs<1||o.timeoutMs>120000))throw Error('invalid osm timeout');
    if(o.endpoint!==undefined){const url=new URL(o.endpoint);if(!['http:','https:'].includes(url.protocol))throw Error('invalid osm endpoint');}
    if(o.cacheDir!==undefined&&(typeof o.cacheDir!=='string'||!o.cacheDir))throw Error('invalid osm cache directory');
  }
  if(c.mavlink){const m=c.mavlink;
    if(typeof m.host!=='string'||!m.host||!Number.isInteger(m.port)||m.port<1||m.port>65535||!Number.isInteger(m.systemId)||m.systemId<1||m.systemId>255||!Number.isFinite(m.timeoutMs)||m.timeoutMs<100||m.timeoutMs>30000)throw Error('invalid mavlink configuration');
  }
  return c;
}
