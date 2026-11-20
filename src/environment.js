import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {playground} from './world.js';
import {validateTerrain,terrainObjects} from './terrain.js';
const defaultConfig=fileURLToPath(new URL('../config/default.json',import.meta.url));
export function loadEnvironment(config,configPath=defaultConfig,{flat=false,playground:legacy=false}={}){
 let terrain=null;
 if(!flat&&!legacy&&config.terrain){
  const file=config.terrain==='feofaniya'?fileURLToPath(new URL('../assets/terrain/feofaniya.json',import.meta.url)):path.resolve(path.dirname(configPath),config.terrain);
  try{terrain=validateTerrain(JSON.parse(fs.readFileSync(file,'utf8')));}
  catch(error){throw Error(`Cannot load terrain ${file}: ${error.message}`);}
 }
 return {terrain,world:terrain?terrainObjects(terrain):flat?playground.slice(0,1):playground,home:terrain?.home??{lat:50.4501,lon:30.5234,alt:100}};
}
