import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeArrayBuffer} from 'geotiff';
import proj4 from 'proj4';
import {validateTerrain} from '../src/terrain.js';
const run=promisify(execFile),home={lat:50.4697357,lon:30.4081992};

async function importFixture({largeGap=false,narrowGap=false}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'terrain-import-'));
 try{
  const [east,north]=proj4('WGS84','+proj=utm +zone=36 +datum=WGS84 +units=m',[home.lon,home.lat]);
  const raster=Float32Array.from({length:81*81},(_,k)=>180+(k%81-40)*.1);
  if(largeGap)for(let y=30;y<50;y++)for(let x=30;x<50;x++)raster[y*81+x]=NaN;
  else if(narrowGap)for(let y=16;y<65;y++)raster[y*81+30]=NaN;
  else raster[40*81+40]=NaN;
  const fixture=path.join(dir,'elevation.tif'),preload=path.join(dir,'offline-source.mjs'),out=path.join(dir,'terrain.json');
  await fs.writeFile(fixture,Buffer.from(writeArrayBuffer(raster,{width:81,height:81,ModelPixelScale:[15,15,0],ModelTiepoint:[0,0,0,east-607.5,north+607.5,0],GTModelTypeGeoKey:1,GTRasterTypeGeoKey:1,ProjectedCSTypeGeoKey:32636,GDAL_NODATA:'nan\0'})));
  await fs.writeFile(preload,`import fs from 'node:fs/promises';
const bytes=await fs.readFile(${JSON.stringify(fixture)});
globalThis.fetch=async (url,options={})=>{
 if(String(url).includes('/stac/gem-15/'))return Response.json({assets:{dtm:{href:'https://fixture.invalid/elevation.tif'}}});
 if(String(url)!=='https://fixture.invalid/elevation.tif')throw Error('Unexpected network request: '+url);
 const range=new Headers(options.headers).get('range');
 const match=range?.match(/bytes=(\\d+)-(\\d+)/);if(!match)throw Error('Expected a bounded raster request');
 const start=Number(match[1]),end=Math.min(Number(match[2]),bytes.length-1);
 return new Response(bytes.subarray(start,end+1),{status:206,headers:{'Content-Range':\`bytes \$\{start\}-\$\{end\}/\$\{bytes.length\}\`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
};`);
  const args=['--import',pathToFileURL(preload).href,'scripts/import-terrain.mjs',`--lat=${home.lat}`,`--lon=${home.lon}`,'--name','Offline elevation void fixture','--no-imagery','--out',out];
  if(largeGap){
   await assert.rejects(run(process.execPath,args),/too much missing elevation/);
   await assert.rejects(fs.access(out));return;
  }
  const result=await run(process.execPath,args),terrain=validateTerrain(JSON.parse(await fs.readFile(out,'utf8')));
  assert.match(result.stdout,new RegExp(`Estimated ${narrowGap?49:1} missing elevation cells`));
  assert.equal(terrain.home.lat,home.lat);assert.equal(terrain.home.lon,home.lon);assert.equal(terrain.home.alt,180);
  assert.equal(terrain.sources.elevation.gapFill.filledCells,narrowGap?49:1);assert.equal(terrain.sources.elevation.gapFill.maxRadiusMetres,30);
  assert.equal(terrain.sources.elevation.gapFill.maxMissingFraction,.05);
  assert.ok(terrain.heights.every(Number.isFinite));assert.equal(terrain.heights[(terrain.heights.length-1)/2],0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('terrain importer repairs an isolated void in a real GeoTIFF window and records estimates offline',()=>importFixture());
test('terrain importer rejects broad GeoTIFF voids and writes no partial output',()=>importFixture({largeGap:true}));

test('terrain importer repairs narrow voids above one percent and records the bounded limit offline',()=>importFixture({narrowGap:true}));
