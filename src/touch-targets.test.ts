import {readFileSync} from 'node:fs';import {it,expect} from 'vitest';
const css=readFileSync(new URL('./style.css',import.meta.url),'utf8');
const tail=css.slice(css.indexOf('/* 44px touch targets'));
it('date/search/filter controls reach 44px',()=>{
 for(const s of['.date-strip button{min-height:44px','.date-strip input{min-height:44px','.now-button{min-height:44px','.search input{height:44px','.filter{min-height:44px','.filter-group input[type=date]{min-height:44px','.filter-chips button{min-height:44px','.export-btn{min-height:44px'])expect(tail).toContain(s);
 expect(tail).not.toMatch(/blur\(|gradient|shadow|rgba\(|opacity|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{8}\b/);
});
it('menu and filter close are 44x44',()=>{for(const x of['.topbar>button{width:44px;min-width:44px;min-height:44px}','.filter-screen>header>button{width:44px;min-width:44px;min-height:44px}'])expect(tail).toContain(x)});
