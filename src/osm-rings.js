export function metres(value){
 const match=String(value??'').trim().match(/^(\d+(?:\.\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/i);
 if(!match)return null;const n=Number(match[1])*(/^(ft|feet|')$/i.test(match[2])?.3048:1);return n>0&&n<=500?n:null;
}
export function area(r){let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;}
// Join relation ways by node IDs in either direction. Never close an incomplete ring artificially.
export function stitch(parts){const rings=[],unused=parts.map(p=>p.slice());while(unused.length){let r=unused.shift(),changed=true;while(r[0]!==r.at(-1)&&changed){changed=false;for(let i=0;i<unused.length;i++){let p=unused[i];if(p[0]===r.at(-1)||p.at(-1)===r.at(-1)){if(p.at(-1)===r.at(-1))p=p.slice().reverse();r.push(...p.slice(1));unused.splice(i,1);changed=true;break;}if(p[0]===r[0]||p.at(-1)===r[0]){if(p[0]===r[0])p=p.slice().reverse();r=[...p.slice(0,-1),...r];unused.splice(i,1);changed=true;break;}}}if(r.length>=4&&r[0]===r.at(-1))rings.push(r.slice(0,-1));}return rings;}
