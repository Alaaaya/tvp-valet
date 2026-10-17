// Browser proof of main-list scan wiring (manual plate entry path; camera/OCR themselves covered by worker tests).
import {chromium} from '@playwright/test';
const url='http://127.0.0.1:'+process.env.PORT+(process.env.BASEP||'/');
const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/hako/bin/google-chrome',headless:true,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto(url);await p.getByText('Interaktive Demo öffnen').click();await p.waitForSelector('.booking-list article');
const scan=async v=>{await p.locator('.cam-search').click();await p.getByText('License plate').click();await p.getByLabel('Kennzeichen manuell').fill(v);await p.getByRole('button',{name:'Weiter'}).click();await p.locator('.bsc button[type=submit]').click()};
await scan('d tv-240');await p.waitForTimeout(400);
const detail=await p.locator('body').innerText();const opened=/D-TV 240/.test(detail)&&!(await p.locator('.bsc').count());
const filtersBefore=await p.evaluate(()=>JSON.stringify(Object.entries(localStorage)));
await p.reload();await p.getByText('Interaktive Demo öffnen').click();await p.waitForSelector('.booking-list article');
await scan('ZZ 9999');await p.waitForTimeout(300);
const unknown=await p.locator('.scan-result').innerText();
console.log(JSON.stringify({opened,unknown,errs}));
const ok=opened&&/Keine Buchung/.test(unknown)&&!errs.length;console.log(ok?'PASS':'FAIL');await b.close();process.exit(ok?0:1)
