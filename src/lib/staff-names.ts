/** Session-only names, including inactive assignees. Old asynchronous loads cannot repopulate a new session. */
export const staffNames=new Map<string,string>();
let generation=0;
export const staffNamesGeneration=()=>generation;
export const clearStaffNames=()=>{generation++;staffNames.clear()};
export const rememberStaffNames=(list:readonly {id:string;full_name?:string|null}[]|null|undefined,expected=generation)=>{
 if(expected!==generation)return;
 staffNames.clear();
 for(const x of list??[])if(x.id&&x.full_name?.trim())staffNames.set(x.id,x.full_name.trim());
};
