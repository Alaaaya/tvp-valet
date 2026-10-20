import type {PDFFont} from 'pdf-lib';

const coverage=new WeakMap<PDFFont,{points:Set<number>;encoded:Map<string,boolean>}>();
/** PDF-only policy: keep the actual font's encodable code points, never alter booking data.
 * NFC keeps decomposed German accents intact. Unsupported text is silently omitted,
 * not transliterated or replaced with missing-glyph boxes. Newlines remain layout breaks.
 */
export function printableText(value:string,font:PDFFont):string{
 let support=coverage.get(font);
 if(!support){support={points:new Set(font.getCharacterSet()),encoded:new Map()};coverage.set(font,support)}
 return Array.from(value.normalize('NFC').replace(/\r\n?/g,'\n')).filter(char=>{
  if(char==='\n')return true;
  const point=char.codePointAt(0)!;
  if(point<32||point===127||!support.points.has(point))return false;
  let ok=support.encoded.get(char);
  if(ok===undefined){try{font.encodeText(char);ok=true}catch{ok=false}support.encoded.set(char,ok)}
  return ok;
 }).join('');
}
