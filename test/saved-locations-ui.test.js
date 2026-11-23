import test from 'node:test';
import assert from 'node:assert/strict';
import {createSavedLocations} from '../web/saved-locations.js';

function harness(t){
 const elements=new Map(),original=globalThis.document;
 globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:false,open:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}};
 t.after(()=>{globalThis.document=original;});
 const sent=[],favorite={id:'saved:fixture',name:'Favorite',favorite:true};
 const ui=createSavedLocations({send:m=>{sent.push(m);return true;},onFavorites(){},getSelection:()=>({id:favorite.id}),pickerEnabled:()=>false});
 const $=id=>elements.get(id),init=worldRevision=>ui.init({worldRevision,favorites:[favorite]}),state=(worldRevision,loadedLocationName='Old world')=>ui.state({worldRevision,loadedLocationName,canSaveLocation:true});
 init(1);state(1);
 return {ui,$,sent,init,state,favorite};
}

for(const operation of ['save','remove'])for(const outcome of ['success','error'])test(`${operation} stays busy across world init until its correlated ${outcome}`,t=>{
 const {ui,$,sent,init,state,favorite}=harness(t);
 if(operation==='save')$('saveLocation').onclick();else{$('removeFavorite').onclick();$('confirmRemoveFavorite').onclick();}
 const request=sent.at(-1);assert.ok(request);
 init(2);state(2,'New world');
 assert.equal($('saveLocation').disabled,true,'world broadcasts must not unlock a disk operation');
 assert.equal($('removeFavorite').disabled,true);
 assert.equal($('savedLocationName').disabled,true);
 assert.match($('savedLocationStatus').textContent,operation==='save'?/Saving/:/Removing/);
 ui.message({type:'favorites',favorites:[favorite],requestId:'another-client'});
 assert.equal($('saveLocation').disabled,true,'unrelated broadcasts cannot finish this request');
 ui.message(outcome==='error'?{type:'error',message:'Disk unavailable',requestId:request.requestId}:{type:'favorites',favorites:[favorite],requestId:request.requestId});
 assert.equal($('saveLocation').disabled,false);
 assert.equal($('savedLocationName').disabled,false);
 assert.match($('savedLocationStatus').textContent,outcome==='error'?/Disk unavailable/:operation==='save'?/Location saved/:/Favorite removed/);
});

test('saving the previous world does not leave its edited label as the new world default',t=>{
 const {ui,$,sent,init,state,favorite}=harness(t);
 $('savedLocationName').value='My old world';$('savedLocationName').listeners.input();$('saveLocation').onclick();
 init(2);state(2,'New world');
 ui.message({type:'favorites',favorites:[favorite],requestId:sent.at(-1).requestId});
 assert.equal($('savedLocationName').value,'New world');
 $('savedLocationName').value='My new world';$('savedLocationName').listeners.input();state(2,'New world');
 assert.equal($('savedLocationName').value,'My new world','new unsaved edits remain intact');
});

test('disconnect clears a pending request before reconnecting',t=>{
 const {ui,$,init,state}=harness(t);$('saveLocation').onclick();ui.connection(false);
 assert.equal($('savedLocationName').disabled,false);assert.match($('savedLocationStatus').textContent,/offline/);
 init(2);state(2,'New world');assert.equal($('saveLocation').disabled,false);
});
