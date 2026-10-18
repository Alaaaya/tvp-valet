export interface DisplayComment {text:string;vehicle:string;location:string;imported:boolean}
/** Deduplicate within one note only; retain the first line verbatim and compare case-sensitively. */
export function uniqueNoteLines(note:string):string {
 const seen=new Set<string>();
 return note.split(/\r?\n/).filter(line=>{
  const key=line.trim();
  if(!key)return true;
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).join('\n');
}
// Recognize only imported HTML line breaks, never parse or execute markup.
export function normalizeImportedNoteText(note:string):string {
 return note.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<br\s*\/?\s*$/gi,'\n');
}
/** Presentation only. Original import content remains unchanged in storage. */
export function displayComment(raw:string,deduplicateImportedNotes=false):DisplayComment {
 const result:DisplayComment={text:'',vehicle:'',location:'',imported:false};const notes:string[]=[],separateNotes:string[]=[];
 const vehicle=(value:unknown)=>{if(value&&typeof value==='object'&&!Array.isArray(value)){const v=value as Record<string,unknown>;result.vehicle=['brand','type','color','description'].map(k=>v[k]).filter(v=>typeof v==='string'&&v.trim()).join(' · ')}};
 const object=(value:unknown):boolean=>{if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>;if(!Object.keys(v).some(k=>/^(source|source_id|sourceId|parkingpro|parkingpro_id|vehicle|car|imported_at|importedAt|provenance)$/i.test(k)))return false;result.imported=true;vehicle(v.vehicle||v.car);if(typeof v.location==='string')result.location=v.location;for(const key of ['comment','comments','notes'])if(typeof v[key]==='string')separateNotes.push(deduplicateImportedNotes?uniqueNoteLines(v[key] as string):v[key] as string);return true};
 const text=raw||'';try{if(object(JSON.parse(text))){result.text=separateNotes.map(n=>deduplicateImportedNotes?uniqueNoteLines(normalizeImportedNoteText(n)):n).join('\n');if(deduplicateImportedNotes)result.text=result.text.trim();return result}}catch{/* mixed text import */}
 const lines=text.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/^\s*ParkingPro source\s+/i.test(line)){result.imported=true;continue}
  if(/^\s*Fahrzeug\s*:/i.test(line)){
   let json=line.replace(/^\s*Fahrzeug\s*:\s*/i,'');let end=i;let parsed:unknown;
   while(end<lines.length){try{parsed=JSON.parse(json);break}catch{if(end+1>=lines.length)break;json+='\n'+lines[++end]}}
   if(parsed&&typeof parsed==='object'){vehicle(parsed);result.imported=true;i=end;continue}
  }
  if(result.imported&&/^\s*Standort\s*:/i.test(line)){result.location=line.replace(/^\s*Standort\s*:\s*/i,'');continue}
  // Older imports append one JSON provenance object after human notes.
  const tail=lines.slice(i).join('\n');try{if(object(JSON.parse(tail)))break}catch{/* ordinary comment */}
  notes.push(line);
 }
 const human=notes.join('\n');
 result.text=[deduplicateImportedNotes&&result.imported?uniqueNoteLines(normalizeImportedNoteText(human)):human,...separateNotes.map(n=>deduplicateImportedNotes&&result.imported?uniqueNoteLines(normalizeImportedNoteText(n)):n)].filter(Boolean).join('\n').trim();return result;
}

/** Hide only exact external-reference pipe tokens in display text, never stored notes. */
export function omitExternalReference(text:string,externalId?:string|null,code?:string):string{
 const id=externalId?.trim();
 if(!id||id===code)return text;
 const reference=id.split('|').map(part=>part.trim());
 return text.split('\n').map(line=>{
  const parts=line.split('|'),kept:string[]=[];
  for(let i=0;i<parts.length;){
   if(reference.every((part,j)=>parts[i+j]?.trim()===part))i+=reference.length;
   else kept.push(parts[i++]);
  }
  return kept.join('|').trim();
 }).filter(Boolean).join('\n').trim();
}
