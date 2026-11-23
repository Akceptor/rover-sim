import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateOsmSettings} from './osm-settings-model.js';

export class OsmSettingsStore{
 constructor(configPath){this.file=path.resolve(configPath)+'.osm-settings.local.json';this.pending=Promise.resolve();}
 async load(){
  try{return validateOsmSettings(JSON.parse(await fs.readFile(this.file,'utf8')));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 async save(value){
  const settings=validateOsmSettings(value);
  const operation=this.pending.then(async()=>{
   const temp=`${this.file}.${randomUUID()}.tmp`;
   try{await fs.writeFile(temp,JSON.stringify(settings)+'\n',{flag:'wx',mode:0o600});await fs.rename(temp,this.file);}
   finally{await fs.rm(temp,{force:true});}
   return settings;
  });
  this.pending=operation.catch(()=>{});return operation;
 }
}
