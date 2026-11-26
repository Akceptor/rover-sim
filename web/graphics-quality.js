const SOFTWARE_RENDERER_RE=/swiftshader|microsoft basic render driver|gdi generic|llvmpipe|softpipe|software rasterizer|mesa offscreen/i;

export const QUALITY_PREFERENCES=['auto','high','performance'];

export const QUALITY_PRESETS={
 high:{
  resolved:'high',
  shadowsEnabled:true,
  shadowMapSize:2048,
  materialMode:'standard',
  useBumpMap:true,
  anisotropyCap:16,
 },
 performance:{
  resolved:'performance',
  shadowsEnabled:false,
  shadowMapSize:512,
  materialMode:'lambert',
  useBumpMap:false,
  anisotropyCap:1,
 },
};

export function isSoftwareRenderer(rendererName=''){
 return SOFTWARE_RENDERER_RE.test(String(rendererName||''));
}

export function resolveQualityPreference(value){
 return QUALITY_PREFERENCES.includes(value)?value:'auto';
}

export function resolveGraphicsProfile({preference='auto',rendererName='',devicePixelRatio=1}={}){
 const pref=resolveQualityPreference(preference);
 const softwareRenderer=isSoftwareRenderer(rendererName);
 const resolved=pref==='auto'?(softwareRenderer?'performance':'high'):pref;
 const preset=QUALITY_PRESETS[resolved];
 const dpr=Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1;
 return {
  preference:pref,
  softwareRenderer,
  ...preset,
  pixelRatio:resolved==='performance'?1:Math.min(dpr,2),
 };
}

export function detectWebGLRendererName(renderer){
 try{
  const gl=renderer?.getContext?.();
  if(!gl)return '';
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  if(debug){
   const unmasked=gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
   if(unmasked)return String(unmasked);
  }
  return String(gl.getParameter(gl.RENDERER)||'');
 }catch{
  return '';
 }
}

const STORAGE_KEY='graphicsQuality';

export function loadQualityPreference(storage){
 try{
  return resolveQualityPreference(storage?.getItem?.(STORAGE_KEY));
 }catch{
  return 'auto';
 }
}

export function saveQualityPreference(storage,preference){
 try{
  storage?.setItem?.(STORAGE_KEY,resolveQualityPreference(preference));
  return true;
 }catch{
  return false;
 }
}

export function formatQualityStatus(profile){
 const label=profile.resolved==='performance'?'Performance':'High';
 if(profile.preference==='auto'){
  return profile.softwareRenderer
   ?`Auto · ${label} (software renderer detected)`
   :`Auto · ${label}`;
 }
 return `${label} (manual)`;
}
