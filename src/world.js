// Shared solid visual/collision geometry. Sky and ground paint are renderer-only.
export const playground=[
 {kind:'ground',size:[100,.2,100],position:[0,-.1,0],color:0x596f48},
 {kind:'barrier',size:[.3,.5,6],position:[8,.25,0],color:0xe0e4df},
 {kind:'barrier',size:[4,.4,.25],position:[-3,.2,-5],color:0xdb7632},
 {kind:'barrier',size:[.25,.4,4],position:[-7,.2,2],color:0xe0e4df},
 {kind:'ramp',size:[3,.15,2],position:[2,.34,-6],angle:.22,color:0x9ba7aa},
 {kind:'platform',size:[2,.7,2],position:[4.4,.35,-6],color:0x79868c},
 ...Array.from({length:6},(_,i)=>({kind:'cone',size:[.22,.5,.22],position:[1+i*.85,.25,2+(i%2)*.6],color:0xff7f20})),
 ...Array.from({length:12},(_,i)=>({kind:'bump',size:[.45,.04+(i%3)*.025,2],position:[-2+i*.5,.02+(i%3)*.0125,6],color:0x687650}))
];
