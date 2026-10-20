import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {printableText} from './print-text';

it('uses actual encodable code points, NFC and no replacements for Arabic or supplementary emoji',async()=>{
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const fonts=[await doc.embedFont(StandardFonts.Helvetica),await doc.embedFont(StandardFonts.HelveticaBold),
  await doc.embedFont(readFileSync('public/print/LiberationSans-Regular.ttf'),{subset:true}),
  await doc.embedFont(readFileSync('public/print/LiberationSans-Bold.ttf'),{subset:true})];
 for(const font of fonts){
  expect(printableText('آية محمد عبدالله',font).trim()).toBe('');
  expect(printableText('Alaa علاء 123 😀 🅿️',font)).toBe('Alaa  123  ');
  expect(printableText('Mu\u0308ller A\u0308 O\u0308 U\u0308 äöüß € „Text“ – …',font)).toBe('Müller Ä Ö Ü äöüß € „Text“ – …');
  expect(printableText('a\u0000b\r\nc\rd\u007fe',font)).toBe('ab\nc\nde');
  expect(printableText('\ud83dA\ude00',font)).toBe('A');
  for(const char of Array.from(printableText('اسم 😀 Müller 123 €',font)))expect(()=>font.encodeText(char)).not.toThrow();
 }
});
it('does not trust missing-glyph encoding or listed coverage alone',()=>{
 const font={getCharacterSet:()=>[65,66,0x1f600],encodeText:(s:string)=>{if(s==='B')throw Error('cannot encode')}} as any;
 expect(printableText('AB😀C',font)).toBe('A😀');
});
