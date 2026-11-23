// This component owns request feedback only. Favorite broadcasts never reload a world.
export function createSavedLocations({send,onFavorites,getSelection,pickerEnabled}){
 const $=id=>document.getElementById(id),name=$('savedLocationName'),save=$('saveLocation'),remove=$('removeFavorite'),status=$('savedLocationStatus'),dialog=$('removeFavoriteDialog');
 let favorites=[],state=null,revision=null,connected=false,pending=null,message='',edited=false,defaultRevision=null,removeId=null,requestSequence=0;
 function reason(){
  if(!connected)return 'Backend offline · reconnect to save a location.';
  if(!state||state.worldRevision!==revision)return 'Waiting for the loaded location.';
  const selection=getSelection();
  if(pickerEnabled()&&selection.id&&(selection.id!==state.selectedLocation||(selection.id==='map'&&selection.point&&(Math.abs(selection.point.lat-state.home.lat)>1e-8||Math.abs(selection.point.lon-state.home.lon)>1e-8))))return 'Load the selected location before saving.';
  if(!state.canSaveLocation)return state.saveLocationHint??'Load terrain, satellite colours and OpenStreetMap data before saving.';
  if(!name.value.trim())return 'Enter a name for this location.';
  return '';
 }
 function refresh(){
  const hint=reason();save.disabled=!!pending||!!hint;name.disabled=!!pending;
  remove.hidden=!favorites.some(p=>p.id===getSelection().id);remove.disabled=!connected||!!pending;
  const text=pending?(pending.type==='saveLocation'?'Saving location…':'Removing favorite…'):hint||message||'Ready to save a complete offline copy.';
  if(status.textContent!==text)status.textContent=text;
 }
 function request(type,extra){
  const requestId=globalThis.crypto?.randomUUID?.()??`location:${Date.now()}:${++requestSequence}:${Math.random().toString(36).slice(2)}`;pending={type,requestId};message='';refresh();
  if(!send({type,...extra,requestId})){pending=null;connected=false;refresh();}
 }
 name.addEventListener('input',()=>{edited=true;message='';refresh();});
 save.onclick=()=>{if(!save.disabled)request('saveLocation',{name:name.value.trim(),worldRevision:revision});};
 remove.onclick=()=>{const favorite=favorites.find(p=>p.id===getSelection().id);if(!favorite)return;removeId=favorite.id;$('removeFavoriteName').textContent=favorite.name;dialog.showModal();};
 $('cancelRemoveFavorite').onclick=()=>dialog.close();
 $('confirmRemoveFavorite').onclick=()=>{dialog.close();if(removeId&&!pending&&connected)request('removeLocation',{id:removeId});};
 return {
  init(m){connected=true;revision=m.worldRevision;state=null;pending=null;message='';favorites=m.favorites??[];onFavorites(favorites);refresh();},
  state(m){state=m;if(!edited&&defaultRevision!==m.worldRevision&&m.loadedLocationName){name.value=m.loadedLocationName;defaultRevision=m.worldRevision;}refresh();},
  selection:refresh,
  connection(value){connected=value;if(!value){pending=null;message='';if(dialog.open)dialog.close();}refresh();},
  message(m){
   if(m.type==='favorites'){
    favorites=m.favorites??[];onFavorites(favorites);
    if(dialog.open&&!favorites.some(p=>p.id===removeId))dialog.close();
   }
   if(pending&&m.requestId===pending.requestId){if(m.type==='favorites'&&pending.type==='saveLocation')edited=false;message=m.type==='error'?m.message:pending.type==='saveLocation'?'Location saved · Available offline.':'Favorite removed. The loaded world is unchanged.';pending=null;}
   refresh();
  }
 };
}
