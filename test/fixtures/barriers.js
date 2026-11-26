export {terrain} from './osm.js';
export const node=(id,x,z,tags)=>({type:'node',id,lat:x/110574.2758,lon:z/111319.4908,...(tags?{tags}:{})});
export const barriersOsm={elements:[
 node(100,5,-20),node(101,5,-2),node(102,5,0,{barrier:'gate',open:'yes',width:'1 m'}),node(103,5,2),node(104,5,20),
 {type:'way',id:200,nodes:[100,101,102,103,104],tags:{barrier:'fence',height:'1.5'}},
 node(110,15,-20),node(111,15,20),{type:'way',id:210,nodes:[110,111],tags:{barrier:'wall',height:'2 m',width:'.2'}},
 node(120,-10,-10,{barrier:'bollard',height:'80 ft',width:'-1'}),
 node(121,-10,10,{barrier:'block',height:'0.5',width:'0.7'}),
 node(130,-20,-10),node(131,-20,0,{barrier:'entrance',width:'2'}),node(132,-20,10),
 {type:'way',id:230,nodes:[130,131,132],tags:{barrier:'wall'}},
]};
