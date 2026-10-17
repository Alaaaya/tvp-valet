export const nextDay=(d:string)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10)};
export const delayText=(d:number|null)=>d?(d>0?'+':'−')+Math.abs(d)+'′':'';
