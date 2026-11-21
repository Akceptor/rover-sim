// Synthetic Overpass response near the equator. No external service is used.
const node=(id,north,east)=>({type:'node',id,lat:north/110574.2758,lon:east/111319.4908});
export const terrain={version:1,name:'Fixture village',size:33,spacing:5,home:{lat:0,lon:0,alt:0},heights:Array(33*33).fill(0),attribution:'Synthetic test terrain'};
export const osm={elements:[
 node(1,5,-8),node(2,15,-8),node(3,15,8),node(4,5,8),
 node(5,7,-4),node(6,12,-4),node(7,12,4),node(8,7,4),
 {type:'way',id:10,nodes:[1,2,3],tags:{building:'yes'}},
 {type:'way',id:11,nodes:[1,4,3]},
 {type:'way',id:12,nodes:[5,6,7,8,5]},
 {type:'relation',id:20,tags:{type:'multipolygon',building:'yes','building:levels':'2'},members:[{type:'way',ref:10,role:'outer'},{type:'way',ref:11,role:'outer'},{type:'way',ref:12,role:'inner'}]},
 node(21,-20,-20),node(22,-10,-20),node(23,-10,-15),node(24,-15,-15),node(25,-15,-10),node(26,-20,-10),
 {type:'way',id:30,nodes:[21,22,23,24,25,26,21],tags:{building:'house',height:'4.5 m','building:levels':'9'}},
 node(31,-60,0),node(32,0,0),node(33,60,0),node(34,0,60),
 ...['residential','track','footway','motorway','construction','service','path'].map((highway,i)=>({type:'way',id:40+i,nodes:i===0?[31,32,33]:[32,34],tags:{highway,...(i===0?{width:'5 m',surface:'asphalt'}:i===1?{surface:'gravel'}:i===5?{bridge:'yes'}:i===6?{tunnel:'yes'}:{})}}))
]};
