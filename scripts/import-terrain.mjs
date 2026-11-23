#!/usr/bin/env node
// Fetch only small COG windows. No Earth Engine account or Python required.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {fromUrl} from 'geotiff';
import proj4 from 'proj4';
import {validateTerrain} from '../src/terrain.js';
import {gemItemUrl} from '../src/gem-source.js';
import {fillSmallElevationGaps} from '../src/elevation-gaps.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{lat:{type:'string',default:'50.3375'},lon:{type:'string',default:'30.475'},name:{type:'string',default:'Feofaniya woodland, Kyiv'},size:{type:'string',default:'129'},spacing:{type:'string',default:'7.5'},out:{type:'string',default:path.join(root,'assets/terrain/feofaniya.json')},'imagery-item':{type:'string'},'no-imagery':{type:'boolean'},help:{type:'boolean'}}});
if(values.help){console.log('npm run terrain:import -- --lat 50.3375 --lon 30.475 --name "Feofaniya woodland, Kyiv" --out assets/terrain/my-map.json\nOptional: --size 129 (odd, 3..257) --spacing 7.5 (metres) --imagery-item STAC_ITEM_URL --no-imagery');process.exit(0);}
const lat=Number(values.lat),lon=Number(values.lon),size=Number(values.size),spacing=Number(values.spacing),extent=(size-1)*spacing;
if(!Number.isFinite(lat)||lat< -59||lat>83||!Number.isFinite(lon)||Math.abs(lon)>179||!Number.isInteger(size)||size<3||size>257||size%2!==1||!Number.isFinite(spacing)||spacing<1||spacing>30||extent>3000)throw Error('Choose valid coordinates, an odd grid size 3..257, spacing 1..30 m, and extent <= 3000 m');
const json=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return r.json();};
const local=`+proj=aeqd +lat_0=${lat} +lon_0=${lon} +datum=WGS84 +units=m`;
const points=[];for(let x=0;x<size;x++)for(let z=0;z<size;z++)points.push([(z-(size-1)/2)*spacing,(x-(size-1)/2)*spacing]);
function utm(epsg){if(epsg<32601||epsg>32760||epsg%100<1||epsg%100>60)throw Error(`Unsupported raster EPSG:${epsg}`);return `+proj=utm +zone=${epsg%100} ${epsg>=32700?'+south':''} +datum=WGS84 +units=m`;}
async function sampleAsset(asset,samples,{elevation=false}={}){
 console.log(`Reading window: ${asset.href}`);
 const tiff=await fromUrl(asset.href,{allowFullFile:false});
 try{
  const image=await tiff.getImage(),epsg=image.getGeoKeys().ProjectedCSTypeGeoKey;
  const coordinates=points.map(p=>proj4(local,utm(epsg),p));
  const [ox,oy]=image.getOrigin(),[rx,ry]=image.getResolution();
  const pixels=coordinates.map(([e,n])=>[(e-ox)/rx-.5,(n-oy)/ry-.5]);
  const minX=Math.floor(Math.min(...pixels.map(p=>p[0]))),minY=Math.floor(Math.min(...pixels.map(p=>p[1])));
  const maxX=Math.floor(Math.max(...pixels.map(p=>p[0])))+2,maxY=Math.floor(Math.max(...pixels.map(p=>p[1])))+2;
  if(minX<0||minY<0||maxX>image.getWidth()||maxY>image.getHeight())throw Error('Patch crosses a source tile boundary; choose a smaller area or a different centre');
  const bands=await image.readRasters({window:[minX,minY,maxX,maxY],samples});
  const width=maxX-minX,nodata=image.getGDALNoData();
  let gapFill=null;
  if(elevation){
   const repair=fillSmallElevationGaps(bands[0],width,maxY-minY,nodata);bands[0]=repair.values;
   if(repair.filledCells){
    const maxRadiusMetres=repair.maxRadiusCells*Math.max(Math.abs(rx),Math.abs(ry));
    gapFill={method:'inverse-distance weighting of original valid neighbours',filledCells:repair.filledCells,totalCells:width*(maxY-minY),maxRadiusMetres,maxMissingFraction:repair.maxMissingFraction};
    console.log(`Estimated ${repair.filledCells} missing elevation cells using valid source data within ${maxRadiusMetres} m.`);
   }
  }
  const values=pixels.map(([px,py])=>{
   const x=px-minX,y=py-minY,i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j,k=j*width+i;
   return samples.map((_,band)=>{
    const v=[bands[band][k],bands[band][k+1],bands[band][k+width],bands[band][k+width+1]];
    if(v.some(h=>!Number.isFinite(h)||h===nodata))throw Error('Source has missing data in this patch; choose a different centre');
    return v[0]*(1-a)*(1-b)+v[1]*a*(1-b)+v[2]*(1-a)*b+v[3]*a*b;
   });
  });
  return {values,gapFill};
 }finally{await tiff.close();}
}
const itemUrl=gemItemUrl(lat,lon);
const item=await json(itemUrl),elevationSamples=await sampleAsset(item.assets.dtm,[0],{elevation:true}),elevations=elevationSamples.values.map(v=>v[0]);
const altitude=elevations[(elevations.length-1)/2];
const terrain={version:1,name:values.name,size,spacing,home:{lat,lon,alt:Number(altitude.toFixed(2))},heights:elevations.map(h=>Number((h-altitude).toFixed(3))),attribution:'GEM-15: This dataset is produced by Google. CC BY 4.0.',sources:{elevation:{item:itemUrl,asset:item.assets.dtm.href,gridMetres:15,verticalDatum:'EGM96',license:'CC-BY-4.0'}},generatedDetails:'Procedural trees and rocks; not surveyed objects. Small level spawn pad.'};
if(elevationSamples.gapFill){terrain.sources.elevation.gapFill=elevationSamples.gapFill;terrain.generatedDetails+=' Small missing elevation cells estimated from nearby source data; see elevation gapFill metadata.';}
// A small, explicitly documented level spawn pad avoids starting a parked rover on a slope.
for(let x=0;x<size;x++)for(let z=0;z<size;z++){
 const r=Math.hypot(x-(size-1)/2,z-(size-1)/2)*spacing;
 const blend=Math.min(1,Math.max(0,(r-7.5)/15));terrain.heights[x*size+z]=Number((terrain.heights[x*size+z]*blend).toFixed(3));
}
if(!values['no-imagery']){
 let imageItem,imageItemUrl=values['imagery-item'];
 if(imageItemUrl)imageItem=await json(imageItemUrl);
 else{
  const search=new URL('https://earth-search.aws.element84.com/v1/search');
  // Summer scene, a bounded query. Users can pin a different scene explicitly.
  search.search=new URLSearchParams({collections:'sentinel-2-l2a',bbox:`${lon-.001},${lat-.001},${lon+.001},${lat+.001}`,limit:'30',datetime:'2024-06-01T00:00:00Z/2024-09-01T00:00:00Z'});
  const results=await json(search);imageItem=results.features.filter(f=>f.assets.visual).sort((a,b)=>a.properties['eo:cloud_cover']-b.properties['eo:cloud_cover'])[0];
  if(!imageItem)throw Error('No satellite scene found; select --imagery-item or --no-imagery');
  imageItemUrl=imageItem.links.find(l=>l.rel==='self')?.href??search.href;
 }
 terrain.colors=(await sampleAsset(imageItem.assets.visual,[0,1,2])).values.flat().map(v=>Math.max(0,Math.min(255,Math.round(v))));
 if(terrain.colors.filter(v=>v===0).length>terrain.colors.length*.1)throw Error('Satellite patch contains too many missing/black pixels');
 const year=imageItem.properties.datetime?.slice(0,4)??'unknown year';
 terrain.attribution+=` Contains modified Copernicus Sentinel data (${year}), via Element 84 Earth Search.`;
 terrain.sources.imagery={item:imageItemUrl,id:imageItem.id,asset:imageItem.assets.visual.href,date:imageItem.properties.datetime,gridMetres:10,terms:'https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice'};
}
validateTerrain(terrain);
const out=path.resolve(values.out);await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(terrain)+'\n');
console.log(`Saved ${out}: ${extent} m square, elevation ${Math.min(...terrain.heights)}..${Math.max(...terrain.heights)} m relative to home ${altitude.toFixed(2)} m EGM96.`);
