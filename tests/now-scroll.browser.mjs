// Real-browser proof: other date -> Now shows Berlin today and scrolls the inner list to the first event >= now.
// Usage: PORT=xxxx node tests/now-scroll.browser.mjs (vite dev server must be running)
import {chromium} from '@playwright/test';
const url='http://127.0.0.1:'+process.env.PORT+(process.env.BASEP||'/');
const browser=await chromium.launch({executablePath:process.env.CHROME||'/opt/hako/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errs=[];page.on('pageerror',e=>errs.push(String(e)));
await page.clock.install({time:new Date('2026-10-17T10:00:00Z')}); // 12:00 Berlin
await page.goto(url);await page.getByText('Interaktive Demo öffnen').click();
await page.waitForSelector('.booking-list article');
const shell=await page.evaluate(()=>{const l=document.querySelector('.booking-list'),d=document.scrollingElement;return{listScrolls:l.scrollHeight>l.clientHeight,docScrolls:(window.scrollTo(0,500),window.scrollY>0),top:l.getBoundingClientRect().top}});
for(let i=0;i<3;i++)await page.getByLabel('Nächster Tag').click();
const other=await page.locator('.date-text').innerText();
await page.getByRole('button',{name:/Now/}).click();
await page.waitForTimeout(300);
const r=await page.evaluate(()=>{const l=document.querySelector('.booking-list'),lt=l.getBoundingClientRect().top;const rows=[...l.children].map(e=>({t:(e.querySelector('.blr-time strong')?.textContent||'').trim(),y:Math.round(e.getBoundingClientRect().top-lt)}));return{date:document.querySelector('.date-text').textContent,scrollTop:l.scrollTop,rows}});
console.log(JSON.stringify({shell,other,after:r.date,scrollTop:r.scrollTop,first:r.rows.slice(0,6),errs}));
const atTop=r.rows.find(x=>Math.abs(x.y)<=2);
const ok=r.date==='17.10.2026'&&other==='20.10.2026'&&shell.listScrolls&&!shell.docScrolls&&errs.length===0&&(!atTop||/^(1[2-9]|2\d):/.test(atTop.t));
console.log(ok?'PASS':'FAIL');await browser.close();process.exit(ok?0:1);
