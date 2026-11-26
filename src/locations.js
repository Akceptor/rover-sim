// 960 m patches checked against real GEM-15 / Sentinel-2 imports.
// Relief is the measured max-minus-min mesh elevation, rounded to metres.
export const locationPresets=Object.freeze([
 {id:'kyiv',name:'Kyiv · Feofaniya',terrain:'feofaniya.json',lat:50.3375,lon:30.475,timeZone:'Europe/Kyiv',reliefM:56,description:'Wooded hills'},
 {id:'lviv',name:'Lviv · northern hills',terrain:'lviv.json',lat:49.88,lon:24.055,timeZone:'Europe/Kyiv',reliefM:72,description:'Rolling hills north of the city'},
 {id:'lima',name:'Lima · Rímac hills',terrain:'lima.json',lat:-12.0259746,lon:-77.0282052,timeZone:'America/Lima',reliefM:120,description:'Dry coastal hills and steep slopes'},
 {id:'cusco',name:'Cusco · Andes',terrain:'cusco.json',lat:-13.485,lon:-71.98,timeZone:'America/Lima',reliefM:185,description:'High mountain slopes · challenging terrain'},
 {id:'andes',name:'Andes · mountain ravine',terrain:'andes.json',lat:-13.49,lon:-72.01,timeZone:'America/Lima',reliefM:206,description:'Steep valley sides near Cusco'}
].map(Object.freeze));
export function findLocation(id){const location=locationPresets.find(p=>p.id===id);if(!location)throw Error('Unknown location preset');return location;}
export function createMapLocation(lat,lon){
 if(!Number.isFinite(lat)||Math.abs(lat)>85||!Number.isFinite(lon)||Math.abs(lon)>180)throw Error('Invalid map coordinates');
 return {id:'map',name:`Map · ${lat.toFixed(5)}, ${lon.toFixed(5)}`,lat,lon,timeZone:null,description:'Selected on browser map'};
}
