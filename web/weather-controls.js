import {createPreferenceSync,loadPreferences,savePreferences,resolvePreferences,PREFERENCES_KEY,sunsetMinute,localDateKey,minuteLabel} from '/weather-controls-model.js';
export function createWeatherControls(){
 const $=id=>document.getElementById(id);let storage;try{storage=window.localStorage;}catch{}
 let preferences=loadPreferences(storage),revision=0,sunset=null,dateKey='',send=null;
 const cameraOutput=document.documentElement.dataset.cameraOutput!==undefined;
 function render(){
  $('timeMode').value=preferences.timeMode;$('weatherMode').value=preferences.weatherMode;
  $('manualTimeControls').hidden=preferences.timeMode!=='manual';$('manualWeatherControls').hidden=preferences.weatherMode!=='manual';
  if($('timeMinute'))$('timeMinute').value=preferences.minute;if($('selectedMinute'))$('selectedMinute').textContent=minuteLabel(preferences.minute);$('weatherPreset').value=preferences.preset;
 }
 function apply(value){const next=resolvePreferences(value);if(JSON.stringify(next)===JSON.stringify(preferences))return false;preferences=next;savePreferences(storage,preferences);revision++;render();return true;}
 const sync=createPreferenceSync({getPreferences:()=>preferences,applyPreferences:apply,send:message=>send?.(message)??false,isCameraOutput:cameraOutput});
 function change(patch){if(apply({...preferences,...patch}))sync.publish();}
 $('timeMode').addEventListener('change',e=>change({timeMode:e.target.value}));
 $('weatherMode').addEventListener('change',e=>change({weatherMode:e.target.value}));
 $('timeMinute')?.addEventListener('input',e=>change({minute:Number(e.target.value)}));
 $('weatherPreset').addEventListener('change',e=>change({preset:e.target.value}));
 for(const button of document.querySelectorAll('[data-time-preset]'))button.addEventListener('click',()=>{const minute=button.dataset.timePreset==='sunset'?sunset:Number(button.dataset.timePreset);if(minute!==null)change({minute});});
 window.addEventListener('storage',event=>{if(event.key===PREFERENCES_KEY||event.key===null){if(apply(loadPreferences(storage))&&!cameraOutput)sync.publish();}});
 render();
 return {setPreferenceSender(sender){send=sender;},receivePreferences:sync.receive,get preferences(){return preferences;},get revision(){return revision;},update(home,now,timeZone){
  const key=`${home.lat}:${home.lon}:${timeZone}:${localDateKey(now,timeZone)}`;if(key===dateKey)return;dateKey=key;
  sunset=sunsetMinute(home,now,timeZone);$('sunsetTime').disabled=sunset===null;
  $('sunsetTime').title=sunset===null?'Sunset is unavailable at this location on this date':`Sunset at ${minuteLabel(sunset)} local time`;
  $('sunsetUnavailable').hidden=sunset!==null;
 }};
}
