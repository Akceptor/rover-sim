import {fieldClass} from '/profile-fields.js';
import {SECTIONS,ALL_FIELDS} from '/profile-schema.js';
import {resizeCollisionBoxes} from '/vehicle-geometry.js';
import {createProfilePreview} from '/profile-preview.js';
const ID=/^[a-z0-9][a-z0-9-]{0,40}$/,$=id=>document.getElementById(id);
const get=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o);
const set=(o,p,v)=>{const k=p.split('.');const last=k.pop();k.reduce((x,n)=>x[n],o)[last]=v;};
const clone=o=>JSON.parse(JSON.stringify(o));
const LIVE_PATHS=ALL_FIELDS.map(f=>f.path).filter(p=>!p.startsWith('@')&&fieldClass(p)==='live');
const state={list:[],active:null,id:null,saved:null,savedSitl:null,draft:null,sitl:'',isNew:false,roverTuned:false,errors:{},notes:[],inputs:{}};
let timer=null,liveSeq=0;

const dirty=()=>JSON.stringify(state.draft)!==JSON.stringify(state.saved)||(state.sitl!==(state.savedSitl??''));
const liveDiffers=()=>LIVE_PATHS.some(p=>JSON.stringify(get(state.draft,p))!==JSON.stringify(get(state.saved,p)));
const canLive=()=>state.id===state.active&&state.active!=='custom'&&!state.isNew;

async function api(method,url,body){
 const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body&&JSON.stringify(body)});
 const json=await r.json().catch(()=>({error:`HTTP ${r.status}`}));
 return {status:r.status,ok:r.ok,json};
}
function showError(path,message){state.errors[path]=message;const el=state.inputs[path];if(el){el.field.classList.add('invalid');el.error.textContent=message;}}
function clearErrors(){for(const p of Object.keys(state.errors)){const el=state.inputs[p];if(el){el.field.classList.remove('invalid');el.error.textContent='';}}state.errors={};}
function attribute(message){const m=/vehicle ([\w.]+)/.exec(message)||/(\w+(?:\.\w+)?) must/.exec(message);const p=m&&m[1];return p&&state.inputs[p]?p:null;}
function status(){
 const el=$('status'),parts=[];let tone='';
 const errors=Object.values(state.errors);
 if(errors.length){parts.push(errors[0]);tone='error';}
 else if(state.isNew)parts.push('New profile, not saved yet');
 else if(dirty()){parts.push('Unsaved changes');tone='warn';}
 else{parts.push('Saved');tone='ok';}
 parts.push(...state.notes);
 if(state.roverTuned){parts.push('Rover running unsaved tuning');tone=tone||'warn';}
 if(state.active==='custom')parts.push('Active vehicle is an inline config override; edit its profile file and select it');
 el.textContent=parts.join(' · ');el.dataset.tone=tone;
 $('save').disabled=Object.keys(state.errors).some(k=>k!=='@save')||!(dirty()||state.isNew);
 $('revert').disabled=!dirty()&&!state.isNew&&!state.roverTuned;
}
function renderSelect(){
 const sel=$('profileSelect');sel.replaceChildren(...state.list.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=`${p.profile.name} (${p.id})${p.id===state.active?' · active':''}${p.isNew?' · new':''}`;return o;}));
 sel.value=state.id;
}
export let preview=null;
try{preview=createProfilePreview($('modelPreview'),$('rotateModel'),$('resetModel'));}
catch{ $('modelPreview').textContent='3D preview unavailable. Check that WebGL is enabled in your browser.';$('rotateModel').disabled=true;$('resetModel').disabled=true; }
let previewTimer=null;
function updatePreview(){
 const profile=state.draft;
 const source=(profile.id==='mn168'||!profile.id)&&profile.drivetrain!=='tracked'?'/assets/MN-168.js':'/assets/vehicle.js';
 $('modelPath').textContent=source.slice(1);$('modelPath').href=source;
 $('sitlPath').textContent=`config/vehicles/${profile.id}/sitl.parm`;
 if(!preview)return;
 try{preview.setVehicle(profile);$('previewStatus').textContent='';}
 catch{$('previewStatus').textContent='Preview is showing the last valid geometry. Check chassis dimensions.';}
}
function updateVisibility(){
 for(const group of document.querySelectorAll('[data-drivetrain]'))group.hidden=group.dataset.drivetrain!==state.draft.drivetrain;
}
function renderForm(){
 const form=$('form');form.replaceChildren();state.inputs={};
 const gridFor=(parent,fields)=>{const grid=document.createElement('div');grid.className='pe-grid';for(const f of fields)grid.append(fieldNode(f));parent.append(grid);};
 for(const section of SECTIONS){
  const set_=document.createElement('fieldset');set_.className='pe-section '+section.className;
  const legend=document.createElement('legend');legend.textContent=section.title;set_.append(legend);
  if(section.className==='pe-sitl'){
   const path=document.createElement('p');path.className='pe-note';path.textContent='Parameter file: ';
   const code=document.createElement('code');code.id='sitlPath';path.append(code);set_.append(path);
  }
  gridFor(set_,section.fields);
  for(const group of section.groups??[]){
   const details=document.createElement('details');details.className='pe-advanced';if(group.drivetrain)details.dataset.drivetrain=group.drivetrain;
   const summary=document.createElement('summary');summary.textContent=group.title;details.append(summary);gridFor(details,group.fields);set_.append(details);
  }
  form.append(set_);
 }
 const note=document.createElement('p');note.className='pe-note pe-apply-note';note.textContent='Tuning applies live to the active vehicle. Geometry changes apply after saving and loading the vehicle in the cockpit.';form.append(note);
 updateVisibility();
}
function fieldNode(f){
 const field=document.createElement('label');field.className='pe-field'+(f.type==='json'||f.type==='sitl'?' wide':'');
 const head=document.createElement('span');head.textContent=f.label;
 const help=document.createElement('span');help.className='pe-help';help.tabIndex=0;help.setAttribute('role','button');help.setAttribute('aria-label',`Help for ${f.label}`);
 const tip=document.createElement('span');tip.className='pe-tooltip';tip.id='help-'+f.path.replaceAll('.','-').replace('@','');tip.setAttribute('role','tooltip');
 const cls=f.type==='sitl'?null:fieldClass(f.path);
 tip.textContent=f.help+(cls==='live'?' Applies live to the active vehicle.':cls==='reload'?' Save and load the vehicle in the cockpit to apply.':'');
 help.textContent='?';help.append(tip);help.setAttribute('aria-describedby',tip.id);head.append(help);
 help.addEventListener('click',e=>{e.preventDefault();help.focus();});
 help.addEventListener('keydown',e=>{if(e.key==='Escape')help.blur();});
 if(f.unit){const u=document.createElement('span');u.className='pe-unit';u.textContent=f.unit;head.append(u);}
 let input;
 if(f.type==='select'){input=document.createElement('select');input.append(...f.options.map(o=>Array.isArray(o)?new Option(o[1],o[0]):new Option(o,o)));}
 else if(f.type==='json'||f.type==='sitl')input=document.createElement('textarea');
 else{input=document.createElement('input');input.type=f.type;if(f.type==='number'){input.step=f.step;}if(f.readonly)input.readOnly=true;}
 input.dataset.path=f.path;input.setAttribute('aria-label',f.label);input.setAttribute('aria-describedby',tip.id);
 const error=document.createElement('span');error.className='pe-error';error.setAttribute('role','alert');
 field.append(head,input,error);
 state.inputs[f.path]={field,input,error,f};
 input.addEventListener('input',()=>onInput(f,input));
 return field;
}
function fillForm(){
 clearErrors();
 for(const {input,f} of Object.values(state.inputs)){
  input.value=f.type==='sitl'?state.sitl:f.type==='json'?JSON.stringify(get(state.draft,f.path),null,1):get(state.draft,f.path)??'';
 }
 renderSelect();status();updateVisibility();clearTimeout(previewTimer);updatePreview();
}
function onInput(f,input){
 const path=f.path;
 for(const p of [path,'@json'])if(state.errors[p]){delete state.errors[p];const el=state.inputs[p];if(el){el.field.classList.remove('invalid');el.error.textContent='';}}
 if(f.type==='sitl')state.sitl=input.value;
 else if(f.type==='json'){
  try{const v=JSON.parse(input.value);set(state.draft,path,v);}catch(e){showError(path,'Invalid JSON: '+e.message);state.errors['@json']=state.errors[path];status();return;}
 }else if(f.type==='number'){
  const v=input.valueAsNumber;if(!Number.isFinite(v)){showError(path,'Enter a number');status();return;}set(state.draft,path,v);
 }else set(state.draft,path,input.value);
 if(['length','width','height'].includes(path))state.draft.collisionBoxes=resizeCollisionBoxes(state.draft,state.saved);
 if(path==='drivetrain')updateVisibility();
 if(['length','width','height','drivetrain','wheelbase','track','wheelRadius','wheelWidth','suspension'].includes(path)||path.startsWith('trackGeometry.')){
  clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,160);
 }
 status();
 if(fieldClass0(path)==='live')scheduleLive(path);
}
const fieldClass0=p=>p.startsWith('@')?null:fieldClass(p);
function scheduleLive(path){
 if(!canLive())return;
 clearTimeout(timer);timer=setTimeout(()=>postLive(path),150);
}
async function postLive(path){
 if(!canLive()||Object.keys(state.errors).length)return;
 const seq=++liveSeq,profile=clone(state.draft);
 const r=await api('POST',`/api/vehicles/${state.id}/live`,{profile});
 if(seq!==liveSeq)return;
 state.notes=state.notes.filter(n=>n!=='Vehicle change in progress');
 if(r.ok){state.roverTuned=liveDiffers();}
 else if(r.status===409){
  if(/in progress/.test(r.json.error))state.notes.push('Vehicle change in progress');
  else await refresh();
 }else{const p=attribute(r.json.error)??path;showError(p,r.json.error);}
 status();
}
async function refresh({keepDraft=dirty()}={}){
 const r=await api('GET','/api/vehicles');if(!r.ok)return;
 state.active=r.json.active;
 const fresh=r.json.profiles,pendingNew=state.list.filter(p=>p.isNew&&!fresh.some(q=>q.id===p.id));
 state.list=[...fresh,...pendingNew];
 const current=state.list.find(p=>p.id===state.id)??state.list[0];
 if(!current)return;
 if(current.id!==state.id||!keepDraft)select(current.id,true);else{renderSelect();status();}
}
function select(id,force=false){
 if(!force&&(dirty()||state.isNew)&&!confirm('Discard unsaved edits to this profile?'))return renderSelect();
 clearTimeout(timer);clearTimeout(previewTimer);++liveSeq;
 const p=state.list.find(x=>x.id===id);
 state.id=id;state.isNew=!!p.isNew;state.saved=clone(p.profile);state.savedSitl=p.sitlParm;state.draft=clone(p.profile);state.sitl=p.sitlParm??'';
 state.notes=[];renderForm();fillForm();
}
async function save(){
 clearErrors();
 const body={profile:state.draft};if(state.sitl!==''||state.savedSitl!==null)body.sitlParm=state.sitl;
 const r=await api('PUT',`/api/vehicles/${state.id}`,body);
 if(!r.ok){showError(attribute(r.json.error)??'@save',r.json.error);status();return;}
 const sitlChanged=state.sitl!==(state.savedSitl??'');
 state.notes=[];
 if(r.json.reloadNeeded)state.notes.push('Reload vehicle in cockpit to apply geometry');
 if(sitlChanged&&state.id===state.active)state.notes.push('SITL defaults apply on next SITL start; values saved in SITL EEPROM still take precedence');
 if(state.id===state.active)state.roverTuned=false;
 const entry=state.list.find(p=>p.id===state.id);entry.isNew=false;entry.profile=clone(state.draft);entry.sitlParm=body.sitlParm??null;
 state.isNew=false;state.saved=clone(state.draft);state.savedSitl=entry.sitlParm;
 renderSelect();status();
}
async function revert(){
 clearTimeout(timer);
 if(state.isNew){state.list=state.list.filter(p=>p.id!==state.id);select(state.list[0].id,true);return;}
 const wasTuned=state.roverTuned;
 state.draft=clone(state.saved);state.sitl=state.savedSitl??'';state.notes=[];fillForm();
 if(wasTuned&&canLive()){
  const r=await api('POST',`/api/vehicles/${state.id}/live`,{profile:state.saved});
  if(r.ok)state.roverTuned=false;else if(r.status===409&&/in progress/.test(r.json.error))state.notes.push('Vehicle change in progress');else showError('@save',r.json.error);
  status();
 }
}
function duplicate(){
 const raw=prompt('New profile id (a-z, 0-9, dashes)');if(raw===null)return;
 const id=raw.trim();
 if(!ID.test(id)||id==='custom'){alert('Invalid id. Use 1-41 characters: a-z, 0-9 and dashes, starting with a letter or digit.');return;}
 if(state.list.some(p=>p.id===id)){alert(`Profile "${id}" already exists.`);return;}
 if((dirty()||state.isNew)&&!confirm('Discard unsaved edits to the current profile?'))return;
 const profile=clone(state.draft);profile.id=id;profile.name=`${state.draft.name} (copy)`;
 if(state.isNew)state.list=state.list.filter(p=>p.id!==state.id);
 state.list.push({id,profile,sitlParm:state.sitl===''?null:state.sitl,isNew:true});
 select(id,true);
}
$('profileSelect').addEventListener('change',e=>select(e.target.value));
$('duplicate').addEventListener('click',duplicate);$('save').addEventListener('click',save);$('revert').addEventListener('click',revert);
window.addEventListener('pagehide',event=>{if(!event.persisted){preview?.dispose();clearTimeout(previewTimer);}});
window.addEventListener('focus',()=>refresh());
window.addEventListener('beforeunload',e=>{if(state.roverTuned){e.preventDefault();e.returnValue='';}});
await refresh({keepDraft:false});
