export const LIST_SIZE_KEY='tvp:list-size:v1';
export const LIST_SIZES=[{label:'S',percent:85},{label:'M',percent:120},{label:'L',percent:135},{label:'XL',percent:150}] as const;
export const DEFAULT_LIST_SIZE=120;
export function normalizeListSize(value:unknown):number {
 if(typeof value!=='number'||!Number.isFinite(value))return DEFAULT_LIST_SIZE;
 return LIST_SIZES.some(s=>s.percent===value)?value:DEFAULT_LIST_SIZE;
}
export function readListSize(storage:Pick<Storage,'getItem'>):number {
 try {const raw=storage.getItem(LIST_SIZE_KEY);return normalizeListSize(raw===null?null:JSON.parse(raw));}catch{return DEFAULT_LIST_SIZE;}
}
export function writeListSize(storage:Pick<Storage,'setItem'>,value:number):void {
 try{storage.setItem(LIST_SIZE_KEY,JSON.stringify(normalizeListSize(value)));}catch{/* Local preference works even when persistence is unavailable. */}
}
