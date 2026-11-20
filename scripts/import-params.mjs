import fs from 'node:fs';
import {selectParameters} from '../src/parameters.js';
const [file,names]=process.argv.slice(2);
if(!file||!names){console.error('Usage: node scripts/import-params.mjs real-rover.param CRUISE_SPEED,CRUISE_THROTTLE > selected.parm');process.exit(1);}
const {accepted,rejected}=selectParameters(fs.readFileSync(file,'utf8'),names.split(','));
for(const name of rejected)console.error(`Blocked hardware/sensor parameter: ${name}`);
console.error(`Selected ${Object.keys(accepted).length} tuning parameters; review output before applying.`);
console.log('# Selected tuning only. Simulation sensors and channel assignments retained.');
for(const [name,value]of Object.entries(accepted))console.log(`${name} ${value}`);
