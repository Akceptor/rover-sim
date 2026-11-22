import proj4 from 'proj4';
import {localProjection} from './osm.js';
let origin,projection;
export function mapPosition(home,position){
 const key=`${home.lat},${home.lon}`;if(key!==origin){origin=key;projection=proj4(localProjection(home),'EPSG:4326');}
 const [lon,lat]=projection.forward([position.z,position.x]);return {lat,lon};
}
export function mapData(terrain,overlay,home=terrain?.home){
 const data={home,bounds:[],buildings:[],roads:[]};if(!terrain)return data;
 const point=([x,z])=>{const p=mapPosition(terrain.home,{x,z});return [p.lat,p.lon];},h=(terrain.size-1)*terrain.spacing/2;
 data.bounds=[[-h,-h],[h,-h],[h,h],[-h,h]].map(point);
 if(overlay){data.buildings=overlay.buildings.map(b=>[b.outer,...b.holes].map(r=>r.map(point)));data.roads=overlay.roads.map(r=>({points:r.points.map(point),width:r.width,paved:r.paved}));}
 return data;
}
