// Leaflet is served locally. Only visible basemap tiles use the network.
export function createLocationMap({onPick}){
 let view=null,failed=false;
 function fail(error){
  if(failed)return;failed=true;
  console.error('Location map failed:',error);
  try{view?.destroy();}catch(cleanupError){console.error('Location map cleanup failed:',cleanupError);}
  view=null;
  document.getElementById('mapTileStatus').textContent='Map unavailable · reload the page to retry. If it persists, check the server terminal for asset errors.';
  document.getElementById('mapSelectionHint').textContent='Preset locations remain available below.';
  document.getElementById('recenterMap').disabled=true;
 }
 try{view=buildLocationMap({onPick});}catch(error){fail(error);}
 // A failed optional map must never interrupt world setup or the camera loop.
 return Object.fromEntries(['setWorld','select','setPicking','update','destroy'].map(method=>[method,(...args)=>{
  if(!view)return;
  try{return view[method](...args);}catch(error){fail(error);}
 }]));
}
function buildLocationMap({onPick}){
 const L=window.L,element=document.getElementById('locationMap'),tileStatus=document.getElementById('mapTileStatus'),hint=document.getElementById('mapSelectionHint'),coordinates=document.getElementById('mapCoordinates');
 if(!L)throw new Error('Leaflet did not load. Check /leaflet.js and the server terminal.');
 const map=L.map(element,{zoomControl:true,attributionControl:true,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:.7});
 let resize;
 try{
 const attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';
 const blank='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#dbe3df" d="M0 0h256v256H0z"/><path stroke="#c7d1cd" fill="none" d="M0 0h256v256H0z"/></svg>');
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution,errorTileUrl:blank,updateWhenIdle:true,keepBuffer:1}).addTo(map);
 let tileFailed=false,picking=false,home=null,lastTime=null;
 const status=()=>{tileStatus.textContent=tileFailed?'Basemap unavailable · loaded roads and buildings remain visible':'OpenStreetMap · drag to pan, scroll to zoom';};
 tiles.on('loading',()=>{tileFailed=false;});tiles.on('tileerror',()=>{tileFailed=true;status();});tiles.on('load',status);status();
 const renderer=L.canvas({padding:.25}),features=L.layerGroup().addTo(map);
 const rover=L.marker([50.3375,30.475],{interactive:false,keyboard:false,zIndexOffset:1000,icon:L.divIcon({className:'rover-map-icon',html:'<span class="rover-bearing">▲</span>',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map);
 let target=null;
 function select(point,pan=true){
  if(target){map.removeLayer(target);target=null;}
  if(point){target=L.circleMarker([point.lat,point.lon],{radius:7,color:'#a34d00',weight:2,fillColor:'#ffbe62',fillOpacity:1,interactive:false}).addTo(map);coordinates.textContent=`Start: ${point.lat.toFixed(7)}, ${point.lon.toFixed(7)}`;if(pan)map.setView([point.lat,point.lon],Math.max(map.getZoom(),15));}
  else coordinates.textContent='Click the map to choose a start';
 }
 map.on('click',event=>{if(!picking)return;const point={lat:Number(event.latlng.lat.toFixed(7)),lon:Number(event.latlng.wrap().lng.toFixed(7))};select(point,false);onPick(point);});
 document.getElementById('recenterMap').onclick=()=>{const point=rover.getLatLng();map.setView(point,Math.max(map.getZoom(),16));};
 resize=new ResizeObserver(()=>map.invalidateSize({pan:false}));resize.observe(element);
 return {
  setWorld(data){
   if(!data)return;home=data.home;features.clearLayers();
   for(const rings of data.buildings)L.polygon(rings,{renderer,stroke:true,color:'#5b6974',weight:1,fillColor:'#778794',fillOpacity:.6,interactive:false}).addTo(features);
   for(const barrier of data.barriers??[]){
    const style={renderer,color:barrier.open?'#42815d':'#9d5946',weight:2,interactive:false,...(barrier.open?{dashArray:'3 4'}:{})};
    if(barrier.points.length===1)L.circleMarker(barrier.points[0],{...style,radius:3,fillOpacity:.8}).addTo(features);else L.polyline(barrier.points,style).addTo(features);
   }
   for(const road of data.roads)L.polyline(road.points,{renderer,color:road.paved?'#606e79':'#a98348',weight:road.paved?3:2,opacity:.85,interactive:false}).addTo(features);
   if(data.bounds.length){L.polygon(data.bounds,{renderer,color:'#2c74c9',weight:2,dashArray:'6 5',fill:false,interactive:false}).addTo(features);map.fitBounds(data.bounds,{padding:[18,18],animate:false});}
   else if(home)map.setView([home.lat,home.lon],15);
   select(null,false);
  },
  select,
  setPicking(enabled,message){picking=enabled;element.classList.toggle('can-pick',enabled);const text=message||(enabled?'Click a start, then Load location.':'Map preview · location selection is unavailable.');if(hint.textContent!==text)hint.textContent=text;},
  update(state){if(state.wallTime===lastTime)return;lastTime=state.wallTime;const p=state.mapPosition??home;if(p){rover.setLatLng([p.lat,p.lon]);const arrow=rover.getElement()?.firstElementChild;if(arrow)arrow.style.transform=`rotate(${state.heading??0}deg)`;}},
  destroy(){resize.disconnect();map.remove();}
 };
 }catch(error){resize?.disconnect();map.remove();throw error;}
}
