import {terrain} from './osm.js';
export {terrain};
const node=(id,n,e,tags)=>({type:'node',id,lat:n/110574.2758,lon:e/111319.4908,...(tags?{tags}:{})});
export const landcoverOsm={elements:[
 node(101,-70,-70),node(102,70,-70),node(103,70,70),node(104,-70,70),
 node(105,10,-10),node(106,30,-10),node(107,30,10),node(108,10,10),
 {type:'way',id:201,nodes:[101,102,103],tags:{landuse:'forest'}},
 {type:'way',id:202,nodes:[101,104,103]},
 {type:'way',id:203,nodes:[105,106,107,108,105]},
 {type:'relation',id:301,tags:{type:'multipolygon',landuse:'forest'},members:[{type:'way',ref:201,role:'outer'},{type:'way',ref:202,role:'outer'},{type:'way',ref:203,role:'inner'}]},
 node(111,-65,10),node(112,-10,10),node(113,-10,65),node(114,-65,65),
 {type:'way',id:211,nodes:[111,112,113,114,111],tags:{landuse:'farmland'}},
 node(121,40,20),node(122,65,20),node(123,65,60),node(124,40,60),
 {type:'way',id:221,nodes:[121,122,123,124,121],tags:{natural:'water'}},
 node(131,-65,-65),node(132,-10,-65),node(133,-10,-15),node(134,-65,-15),
 {type:'way',id:231,nodes:[131,132,133,134,131],tags:{natural:'scrub'}},
 node(141,-5,20),node(142,30,20),node(143,30,65),node(144,-5,65),
 {type:'way',id:241,nodes:[141,142,143,144,141],tags:{landuse:'grass'}},
 node(151,-40,35,{natural:'tree',height:'8 m'}),
 node(152,-40.1,35.1,{natural:'tree',height:'8'}),
 node(153,-40,35),node(154,-40,60),
 {type:'way',id:251,nodes:[153,154],tags:{natural:'tree_row',height:'5'}},
]};
