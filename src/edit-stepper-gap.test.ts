import {readFileSync} from 'node:fs';import {expect,it} from 'vitest';
it('edit stepper keeps a space between count and label',()=>{expect(readFileSync('src/booking-edit.css','utf8')).toMatch(/\.be-stepper span\{[^}]*gap:\.3em/)});
