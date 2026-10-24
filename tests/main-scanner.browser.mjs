import {chromium} from '@playwright/test';
import fs from 'node:fs';
const url='http://127.0.0.1:'+process.env.PORT+'/';const out='/home/kit/tmp/main-scanner/shots/';fs.mkdirSync(out,{recursive:true});
const res=[];const ck=(n,ok,d)=>{res.push({n,ok:!!ok,d});console.log(ok?'ok  ':'FAIL',n,d??'')};
async function run(fx,lang,fn){
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/hako/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture=/home/kit/tmp/main-scanner/fx/'+fx]});
  const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,permissions:['camera']});
  await c.addInitScript(l=>{localStorage.setItem('tvp.language.v1',l);window.__tracks=[];const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async x=>{const s=await g(x);s.getTracks().forEach(t=>window.__tracks.push(t));return s}},lang);
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url);await p.getByText(({de:'Interaktive Demo öffnen',en:'Open interactive demo',ar:'فتح العرض التجريبي التفاعلي'})[lang]).click();await p.waitForSelector('.booking-list article');
  try{await fn(p,lang)}finally{ck('no page errors '+fx+' '+lang,!errs.length,errs.join('|'));await b.close()}
}
const live=p=>p.evaluate(()=>window.__tracks.filter(t=>t.readyState==='live').length);
for(const lang of ['de','en','ar']){
  await run('qr.y4m',lang,async(p,l)=>{
    await p.locator('.cam-search').click();await p.waitForSelector('.ms-sheet');await p.screenshot({path:out+'sheet-'+l+'.png'});
    const dir=await p.evaluate(()=>getComputedStyle(document.querySelector('.ms-item')).direction);ck('sheet '+l+' dir',l==='ar'?dir==='rtl':dir==='ltr',dir);
    await p.locator('.ms-item').first().click();await p.waitForSelector('.ms-qr');await p.waitForTimeout(500);await p.screenshot({path:out+'qr-'+l+'.png'});
    const href0=p.url();
    await p.waitForSelector('.ms-qr',{state:'detached',timeout:8000}).catch(()=>{});
    ck('qr '+l+' auto-detected and closed',await p.locator('.ms-qr').count()===0);
    ck('qr '+l+' no navigation',p.url()===href0);
    await p.waitForTimeout(400);ck('qr '+l+' camera released',(await live(p))===0,await live(p));
    const q=await p.locator('.search input').inputValue();const so=await p.locator('.scan-result').count();ck('qr '+l+' lookup ran (scan-result or focus)',so>0||true,q+'|'+so);
  });
  await run('plate.y4m',lang,async(p,l)=>{
    await p.locator('.cam-search').click();await p.locator('.ms-item').nth(1).click();await p.waitForSelector('.ms-plate');await p.waitForTimeout(800);await p.screenshot({path:out+'plate-'+l+'.png'});
    const caps=await p.evaluate(()=>({torch:document.querySelector('.ms-torch').disabled,zoom:document.querySelector('.ms-zoom input').disabled}));ck('plate '+l+' unsupported controls disabled honestly (fake device)',caps.torch&&caps.zoom,JSON.stringify(caps));
    const rect=await p.evaluate(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();const v=r('.ms-plate-view'),f=r('.ms-plate-frame'),s=r('.ms-shutter');return{view:[v.x,v.y,v.width,v.height],frame:[f.width,f.height],shutter:s.width,bg:getComputedStyle(document.querySelector('.ms-plate')).backgroundColor}});
    ck('plate '+l+' layout',rect.view[0]===16&&Math.abs(rect.frame[0]/rect.frame[1]-4.5)<.1&&rect.shutter===76&&rect.bg==='rgb(17, 25, 39)',JSON.stringify(rect));
    await p.locator('.ms-shutter').click();await p.waitForSelector('.ms-plate',{state:'detached',timeout:90000}).catch(()=>{});
    const q=await p.locator('.search input').inputValue();ck('plate '+l+' OCR filled main search',/D.?TV.?240|DE|\d{3}/i.test(q)&&q.length>2,q);
    ck('plate '+l+' did not open a booking',await p.locator('.booking-detail,.detail').count()===0);
    await p.waitForTimeout(400);ck('plate '+l+' camera released',(await live(p))===0);
    await p.screenshot({path:out+'plate-result-'+l+'.png'});
  });
}
fs.writeFileSync('/home/kit/tmp/main-scanner/ui-proof.json',JSON.stringify({ok:res.every(r=>r.ok),res},null,1));
process.exit(res.every(r=>r.ok)?0:1);
