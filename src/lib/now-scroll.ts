import {day} from '../model';
/** Index of the first event whose effective time is >= now; -1 when none (empty or all past). Times are ISO instants, list sorted. */
export function firstUpcomingIndex(times:readonly string[],now:number):number{
 return times.findIndex(t=>{const x=Date.parse(t);return Number.isFinite(x)&&x>=now});
}
/** Target of the Now button: Berlin today plus the row to scroll to (list assumed sorted by effective time). */
export function nowTarget(times:readonly string[],now:Date=new Date()){return{date:day(now),index:firstUpcomingIndex(times,now.getTime())}}
/** Scroll only the inner list so the row sits at its top; no future row => end of list. Safe on empty/missing. */
export function scrollListToIndex(list:HTMLElement|null,index:number){
 if(!list||!list.children.length)return;
 if(index<0){list.scrollTop=list.scrollHeight;return}
 const row=list.children[index] as HTMLElement|undefined;if(!row)return;
 list.scrollTop+=row.getBoundingClientRect().top-list.getBoundingClientRect().top;
}
