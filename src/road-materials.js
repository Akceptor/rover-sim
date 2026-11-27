// Shared simulation presets, not surveyed friction coefficients. Multipliers
// modify vehicle tuning; smoothness never synthesizes road elevation geometry.
const preset=(id,grip,rolling,dust,marks,color,priority,paved=false)=>Object.freeze({id,grip,rolling,dust,marks,color:Object.freeze(color),priority,paved});
export const roadMaterials=Object.freeze({
 water:preset('water',.6,4,0,0,[66,115,134],10),
 ground:preset('ground',1,1,1,1,[153,130,96],0),
 unpaved:preset('unpaved',1,1,1,1,[153,130,96],3.5),
 grass:preset('grass',.7,1.6,.08,.7,[103,125,70],1),
 mud:preset('mud',.28,2.8,0,1,[94,77,59],2),
 sand:preset('sand',.55,2.5,1,.9,[191,166,117],3),
 dirt:preset('dirt',.8,1.7,1,.85,[153,130,96],4),
 gravel:preset('gravel',.85,1.4,.65,.4,[143,139,128],5),
 compacted:preset('compacted',.95,1.15,.3,.2,[160,149,127],6),
 paved:preset('paved',1,1,0,0,[113,113,111],7,true),
 concrete:preset('concrete',1,1,0,0,[161,159,150],8,true),
 asphalt:preset('asphalt',1,1,0,0,[103,104,106],9,true),
});
const aliases={asphalt:'asphalt',concrete:'concrete','concrete:plates':'concrete','concrete:lanes':'concrete',paved:'paved',paving_stones:'paved',sett:'paved',cobblestone:'paved',metal:'paved',wood:'paved',gravel:'gravel',fine_gravel:'gravel',pebblestone:'gravel',compacted:'compacted',dirt:'dirt',earth:'dirt',ground:'dirt',unpaved:'dirt',woodchips:'dirt',sand:'sand',mud:'mud',grass:'grass',grass_paver:'grass'};
const firmness={grade1:'compacted',grade2:'gravel',grade3:'dirt',grade4:'dirt',grade5:'dirt'};
const firmnessFactors={grade1:[1,1],grade2:[.98,1.05],grade3:[.94,1.15],grade4:[.88,1.3],grade5:[.8,1.5]};
const rolling={excellent:1,good:1,intermediate:1.08,bad:1.2,very_bad:1.35,horrible:1.5,very_horrible:1.7,impassable:2};
export function normalizeRoadTags(tags){
 const result={};
 for(const key of ['surface','smoothness','tracktype']){
  const value=typeof tags[key]==='string'?tags[key].trim().toLowerCase():'';
  if(/^[a-z][a-z0-9_:;-]{0,63}$/.test(value))result[key]=value;
 }
 return result;
}
export function validRoadTags(road){
 return ['surface','smoothness','tracktype'].every(key=>road[key]===undefined||(typeof road[key]==='string'&&normalizeRoadTags({[key]:road[key]})[key]===road[key]));
}
export function roadMaterial(road){
 const material=roadMaterials[(Object.hasOwn(aliases,road.surface)?aliases[road.surface]:undefined)??(Object.hasOwn(firmness,road.tracktype)?firmness[road.tracktype]:undefined)??(road.paved?'paved':'unpaved')];
 // Recognized surface is authoritative; a conflicting tracktype cannot turn
 // asphalt into loose soil. Track grades supply material only when needed.
 const factor=Object.hasOwn(rolling,road.smoothness)?rolling[road.smoothness]:1;
 const [grip,loss]=!material.paved&&Object.hasOwn(firmnessFactors,road.tracktype)?firmnessFactors[road.tracktype]:[1,1];
 return factor===1&&grip===1&&loss===1?material:{...material,grip:material.grip*grip,rolling:material.rolling*factor*loss};
}
