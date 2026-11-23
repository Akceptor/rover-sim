import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as controls from '../src/weather-controls-model.js';
const home={lat:50.3375,lon:30.475},now=Date.parse('2026-06-21T22:30:00Z');
test('preferences validate independently and reject corrupt values',()=>{
 assert.deepEqual(controls.resolvePreferences({timeMode:'manual',weatherMode:'invalid',minute:0,preset:'Snow'}),{timeMode:'manual',weatherMode:'auto',minute:0,preset:'Snow'});
 assert.deepEqual(controls.resolvePreferences({minute:1440,preset:'ice'}),{timeMode:'auto',weatherMode:'auto',minute:720,preset:'Clear'});
 assert.equal(controls.resolvePreferences(null).minute,720);
});
test('manual local minute uses the location current date and timezone, independently of weather',()=>{
 const weather={timeZone:'Europe/Kyiv',conditions:{code:61},status:'current'};
 for(const timeMode of ['auto','manual'])for(const weatherMode of ['auto','manual']){
  const result=controls.effectiveEnvironment({timeMode,weatherMode,minute:480,preset:'Snow'},weather,home,now);
  assert.equal(result.now,timeMode==='auto'?now:Date.parse('2026-06-22T05:00:00Z'));
  assert.equal(result.conditions.code,weatherMode==='auto'?61:73);
 }
 assert.equal(controls.timeAtMinute(now,'America/New_York',480),Date.parse('2026-06-21T12:00:00Z'));
 assert.equal(controls.timeAtMinute(Date.parse('2026-12-21T23:00:00Z'),'Europe/Kyiv',480),Date.parse('2026-12-22T06:00:00Z'));
});
test('sunset follows location and season and reports polar unavailability',()=>{
 const minute=controls.sunsetMinute(home,now,'Europe/Kyiv');assert.ok(minute>1200&&minute<1320);
 assert.equal(controls.sunsetMinute({lat:90,lon:0},now,'UTC'),null);
 assert.equal(controls.sunsetMinute({lat:90,lon:0},Date.parse('2026-12-21T12:00:00Z'),'UTC'),null);
});
test('manual presets work without live data with distinct fog and precipitation',()=>{
 for(const preset of ['Clear','Cloudy','Fog','Rain','Snow']){
  const value=controls.effectiveEnvironment({weatherMode:'manual',preset},{conditions:null,timeZone:'UTC'},home,now);
  assert.equal(value.status,'manual');assert.ok(Number.isFinite(value.conditions.cloudCover));
 }
});
test('preferences survive storage errors and malformed JSON',()=>{
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(controls.loadPreferences(blocked).timeMode,'auto');
 assert.equal(controls.savePreferences(blocked,{minute:300}),false);
 assert.equal(controls.loadPreferences({getItem:()=>'{bad'}).minute,720);
 let saved;const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
 assert.equal(controls.savePreferences(storage,{timeMode:'manual',minute:300,preset:'Rain'}),true);
 assert.equal(controls.loadPreferences(storage).minute,300);
});
test('manual presets feed the same appearance model including explicit visibility and solar elevation',async()=>{
 const {appearance}=await import('../src/weather-model.js');
 const visual=appearance({elevationDeg:-.833},{...controls.WEATHER_PRESETS.Rain,visibility:190});
 assert.equal(visual.elevationDeg,-.833);assert.equal(visual.visibility,190);assert.equal(visual.precipitation,'rain');assert.ok(visual.precipitationStrength>0);
});
test('manual local date handles the international date line and daylight saving gaps',()=>{
 assert.equal(controls.timeAtMinute(Date.parse('2026-06-21T12:30:00Z'),'Pacific/Kiritimati',480),Date.parse('2026-06-21T18:00:00Z'));
 assert.equal(controls.timeAtMinute(Date.parse('2026-03-08T12:00:00Z'),'America/New_York',150),Date.parse('2026-03-08T07:30:00Z'));
 const minute=controls.sunsetMinute({lat:1.87,lon:-157.4},now,'Pacific/Kiritimati');assert.ok(minute>18*60&&minute<20*60);
 assert.equal(controls.sunsetMinute({lat:90,lon:-157.4},now,'Pacific/Kiritimati'),null);
});
test('sunset search never substitutes tomorrow sunset for a polar day in UTC+14',()=>{
 const home={lat:70,lon:-157},now=Date.parse('2026-07-29T00:00:00Z');
 assert.equal(controls.sunsetMinute(home,now,'Pacific/Kiritimati'),null);
 assert.notEqual(controls.sunsetMinute(home,now+86400000,'Pacific/Kiritimati'),null);
});
test('offline cockpit edits survive stale reconnect init and publish before remote state is applied',()=>{
 let preferences=controls.resolvePreferences({}),online=false;const messages=[];
 const sync=controls.createPreferenceSync({getPreferences:()=>preferences,applyPreferences:value=>{preferences=controls.resolvePreferences(value);},send:message=>{if(!online)return false;messages.push(message);return true;}});
 preferences=controls.resolvePreferences({timeMode:'manual',weatherMode:'manual',minute:123,preset:'Snow'});sync.publish();
 sync.receive(controls.resolvePreferences({minute:720}));assert.equal(preferences.minute,123);assert.equal(messages.length,0);
 online=true;sync.receive(controls.resolvePreferences({minute:720}));assert.equal(preferences.minute,123);assert.equal(messages.length,1);assert.equal(messages[0].preferences.preset,'Snow');assert.equal(messages[0].seed,undefined);
 sync.receive(controls.resolvePreferences({timeMode:'auto',minute:300}));assert.equal(preferences.minute,300);
});
test('camera clients adopt relay preferences without seeding or echoing',()=>{
 const messages=[];let preferences=controls.resolvePreferences({});
 const sync=controls.createPreferenceSync({isCameraOutput:true,getPreferences:()=>preferences,applyPreferences:value=>{preferences=controls.resolvePreferences(value);},send:message=>{messages.push(message);return true;}});
 sync.receive(null);sync.receive({timeMode:'manual',minute:400});assert.equal(preferences.minute,400);assert.equal(messages.length,0);
});
