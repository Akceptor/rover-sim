import {OSM_SERVERS,resolveOsmEndpoint,validateOsmSettings} from './osm-settings-model.js';

export function createOsmSettings({send,openSettings}){
 const $=id=>document.getElementById(id),form=$('osmSettingsForm'),server=$('osmServer'),endpoint=$('osmEndpoint'),timeout=$('osmTimeout'),status=$('osmSettingsStatus');
 let latest=null,online=false,dirty=false,pending=null,sequence=0,feedback='',failed=false,showRetryStatus=false;
 for(const choice of [...OSM_SERVERS,{id:'custom',label:'Custom URL'}]){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.label;server.append(option);}
 function draft(){return {server:server.value,endpoint:endpoint.value,timeoutMs:Math.round(Number(timeout.value)*1000)};}
 function show(message,error=false){if(status.textContent!==message)status.textContent=message;status.dataset.error=String(error);}
 function render(){
  const unavailable=!online||!latest?.enabled,busy=!!pending||latest?.busy;
  for(const field of [server,endpoint,timeout])field.disabled=unavailable||busy;
  $('osmSave').disabled=unavailable||busy;$('osmSaveRetry').disabled=unavailable||busy||!latest?.canRetry;
  const custom=server.value==='custom';endpoint.hidden=!custom;$('osmEndpointLabel').hidden=!custom;endpoint.required=custom;
  const selected=resolveOsmEndpoint(draft(),latest?.bounds),text=`${selected.label} · ${selected.endpoint||'Enter a custom endpoint'}`;
  if($('osmResolvedServer').textContent!==text)$('osmResolvedServer').textContent=text;
  $('osmRegionHint').textContent=server.value==='auto'?(latest?.canRetry?'Automatic uses conservative region coverage for the whole loaded terrain patch. Uncertain boundaries use the global server.':'Load a location to detect its region. Until then, Automatic selects the global server.'):'This server choice overrides automatic region selection.';
  if(!online)show('Backend offline · reconnect to save settings.');
  else if(!latest?.enabled)show('OpenStreetMap is disabled in the backend configuration.');
  else if(pending)show('Saving OSM settings…');
  else if(busy)show('OSM or terrain is loading · wait before changing settings.');
  else show(feedback||latest?.error||'Choose a server, then save or save and retry.',failed||!!latest?.error);
 }
 function receive(info){
  if(!info)return;latest=info;online=true;
  if(!dirty&&!pending){server.value=info.settings.server;endpoint.value=info.settings.endpoint;timeout.value=String(info.settings.timeoutMs/1000);}
  render();
 }
 function edit(){dirty=true;feedback='Unsaved changes';failed=false;showRetryStatus=false;render();}
 server.addEventListener('change',edit);endpoint.addEventListener('input',edit);timeout.addEventListener('input',edit);
 function save(retry){
  if(!form.reportValidity())return;
  let settings;try{settings=validateOsmSettings(draft());}catch(error){feedback=error.message;failed=true;render();return;}
  if(!online||!latest?.enabled||latest.busy||pending)return;
  const requestId=`osm-${Date.now()}-${++sequence}`;
  if(!send({type:'saveOsmSettings',settings,retry,requestId})){online=false;render();return;}
  pending={requestId,settings,retry};failed=false;render();
 }
 form.addEventListener('submit',e=>{e.preventDefault();save(false);});$('osmSaveRetry').onclick=()=>save(true);
 $('configureOsm').onclick=()=>{openSettings();$('osmSettingsSection').scrollIntoView({block:'start'});server.focus({preventScroll:true});};
 return {
  init:receive,
  state(state){
   receive(state.osmSettings);
   $('configureOsm').hidden=state.osm?.status!=='error';
   if(showRetryStatus&&['ready','empty','deferred','error'].includes(state.osm?.status)){
    feedback=state.osm.message||'OpenStreetMap ready.';failed=state.osm.status==='error';showRetryStatus=false;render();
   }
  },
  message(message){
   if(message.type==='osmSettings')receive(message.osmSettings);
   if(message.type==='osmSettingsResult'&&message.requestId===pending?.requestId){
    const saved=pending;pending=null;feedback=message.message;failed=!message.ok;
    if(message.ok){dirty=false;server.value=saved.settings.server;endpoint.value=saved.settings.endpoint;timeout.value=String(saved.settings.timeoutMs/1000);showRetryStatus=saved.retry;}
    render();
   }
  },
  connection(connected){online=connected;if(!connected&&pending){pending=null;dirty=true;feedback='Connection lost while saving · reconnect and save again.';failed=true;}render();}
 };
}
