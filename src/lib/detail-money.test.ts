import {afterEach,expect,it} from 'vitest';
import {detailMoney} from './booking-detail-view';
import {setLanguage} from './i18n';
afterEach(()=>setLanguage('de'));
it('detail English reference amount and German/Arabic locale formatting',()=>{
 setLanguage('en');expect(detailMoney(60)).toBe('60.00€');
 setLanguage('de');expect(detailMoney(60)).toBe(new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(60));
 setLanguage('ar');expect(detailMoney(60)).toBe(new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EUR'}).format(60));
});
