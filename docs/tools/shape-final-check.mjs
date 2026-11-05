// Offline, synthetic shape acceptance matrix and review sheets.
import {mkdir,writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {normalizeSize,fittedGeometry,shapes} from '../../app/src/sizing.js';
const output=process.env.AUDIT_OUTPUT || 'gorevler/ss-sekil-final';await mkdir(output,{recursive:true});
const monitor={width:1536,height:926,scale:1,primary:true};
const b=await browser();const failures=[],geometry=[];let cases=0;
try{
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 for(const theme of themes.filter(t=>!process.env.AUDIT_THEMES||process.env.AUDIT_THEMES.split(',').includes(t)))for(const shape of shapes.filter(t=>!process.env.AUDIT_SHAPES||process.env.AUDIT_SHAPES.split(',').includes(t)))for(const sizePreset of ['Small','Medium','Large'])for(const quoteEnabled of [false,true])for(const count of [1,2,3]){
  const settings=normalizeSize({theme,shape,sizePreset,fineTune:100,sizeMode:'fixed',quoteEnabled,appearance:'dark',featuredProvider:'claude',featuredPosition:'top',position:'Top right',linux:{margin:12}});
  const box=fittedGeometry(settings,count,monitor);
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(box.width),height:Math.ceil(box.height),deviceScaleFactor:1,mobile:false});
  const errors=await b.evaluate(`(async()=>{
   const api=window.__AI_USAGE_DEMO__;
   await api.setWorkArea([${JSON.stringify(monitor)}]);
   await api.setSettings(${JSON.stringify(settings)});
   await api.setSnapshot({generated_at:new Date().toISOString(),providers:['claude','codex','gemini'].slice(0,${count}).map((id,i)=>({id,state:'OK',plan:'DEMO',windows:[{kind:'session',used_percent:[21.4,8.25,30.1][i],resets_at:new Date(Date.now()+7200000).toISOString()},{kind:'weekly',used_percent:[33.3489,13.5,18.334913][i],resets_at:new Date(Date.now()+172800000).toISOString()}]}))});
   await api.setQuote({status:'ok',cards:[{quote:'Patient work makes room for a clear thought, and a clear thought makes room for the next small step. Fictional words that run as long as a real daily quote, so the usage rows below it must still stay visible.',author:'Example Author',reason:'Fictional selection'}]});
   await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const errors=[],shell=document.querySelector('#widget').getBoundingClientRect();
   const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return el.getClientRects().length&&s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0};
   const clipped=el=>{const r=el.getBoundingClientRect();for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(s.overflow+s.overflowX+s.overflowY)&&(r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1))return true;}return false;};
   for(const el of document.querySelectorAll('.widget *')){
    if(!visible(el))continue;
    if([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){
     if(parseFloat(getComputedStyle(el).fontSize)<10.99)errors.push(el.className+': font '+getComputedStyle(el).fontSize);
     if(clipped(el))errors.push(el.className+': clipped');
    }
   }
   for(const el of document.querySelectorAll('#providers,.provider-card'))if(visible(el)&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1))errors.push(el.className+': overflow '+el.scrollWidth+'/'+el.clientWidth+' '+el.scrollHeight+'/'+el.clientHeight);
   if(${JSON.stringify(shape)}==='pill'){
    for(const el of document.querySelectorAll('[data-kind=weekly] .window-bottom'))if(visible(el))errors.push('pill weekly timing visible');
    if(${JSON.stringify(sizePreset)}==='Large')for(const el of document.querySelectorAll('[data-kind=session] .window-bottom'))if(!visible(el))errors.push('pill session timing missing');
    for(const el of document.querySelectorAll('.plan'))if(visible(el))errors.push('pill plan visible');
    for(const el of document.querySelectorAll('.window-top b'))if(parseFloat(getComputedStyle(el).fontSize)<(${JSON.stringify(sizePreset)}==='Small'?13:15)-.01)errors.push('pill percentage too small');
   }
   if(${JSON.stringify(shape)}==='square'){
    const cards=[...document.querySelectorAll('.provider-card')].map(el=>el.getBoundingClientRect());
    if(cards.some(r=>Math.abs(r.width-cards[0].width)>1||Math.abs(r.height-cards[0].height)>1))errors.push('unequal square rows');
   }
   if(['square','pill'].includes(${JSON.stringify(shape)}))for(const card of document.querySelectorAll('.provider-card'))for(const kind of ['session','weekly']){
    const row=card.querySelector('[data-kind='+kind+']'),value=row?.querySelector('b'),meter=row?.querySelector('.meter,.segments,.dot-bar');
    if(!value||!visible(value)||clipped(value)||!meter||!visible(meter)||clipped(meter))errors.push(card.dataset.provider+' '+kind+': missing value/bar');
   }
   if(${JSON.stringify(shape)}==='circle')for(const el of document.querySelectorAll('.header,.footer,.quote-section'))if(visible(el)&&['Top','Right','Bottom','Left'].some(side=>parseFloat(getComputedStyle(el)['border'+side+'Width'])>0))errors.push('circle chrome border');
   if(/\d\.\d{2,}/.test(document.querySelector('#widget').innerText))errors.push('unrounded number');
   if(shell.width>innerWidth+1||shell.height>innerHeight+1)errors.push('outside viewport');
   return [...new Set(errors)];
  })()`);
  if(shape!=='portrait')geometry.push({theme,shape,sizePreset,quoteEnabled,count,boxes:await b.evaluate(`[...document.querySelectorAll('.widget,.header,#providers,.provider-card,.window-top,.meter,.segments,.dot-bar,.quote-section')].map(el=>{const r=el.getBoundingClientRect();return [el.className,...['x','y','width','height'].map(k=>Math.round(r[k]*100)/100)]})`)});
  cases++;if(cases%90===0)console.log(`${cases} cases, ${failures.length} failures`);if(errors.length)failures.push({theme,shape,sizePreset,quoteEnabled,count,errors});
 }
 await writeFile(`${output}/geometry.json`,JSON.stringify(geometry));
 await writeFile(`${output}/matrix.json`,JSON.stringify({cases,failures},null,2));
 console.log(`${cases} shape cases; ${failures.length} failures`);
 if(failures.length){console.log(JSON.stringify(failures.slice(0,8),null,2));process.exitCode=1;}
}finally{await b.close();}
