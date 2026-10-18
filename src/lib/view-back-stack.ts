// The app uses local view state, not browser-history entries. Never history.back().
export function pushView(stack:readonly string[],current:string,next:string):string[]{
 if(next===current)return [...stack];
 if(next==='today')return [];
 return [...stack,current];
}
export function popView(stack:readonly string[]):{view:string;stack:string[]}{
 return {view:stack.at(-1)||'today',stack:stack.slice(0,-1)};
}
