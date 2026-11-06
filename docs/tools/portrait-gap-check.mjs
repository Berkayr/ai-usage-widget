// Offline synthetic portrait spacing audit; baseline mode records failures without failing.
import {mkdir, writeFile} from 'node:fs/promises';
import {pairwise} from './pairwise.mjs';
import {browser} from './browser-harness.mjs';
import {normalizeSize,fittedGeometry,sizePresets} from '../../app/src/sizing.js';
const output=process.env.AUDIT_OUTPUT || 'gorevler/portrait-gap';
await mkdir(output,{recursive:true});
const b=await browser(),results=[];
try {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 for(const theme of themes.filter(t=>!process.env.AUDIT_THEMES||process.env.AUDIT_THEMES.split(',').includes(t)))for(const {width,count,featured,quoteEnabled,choice} of pairwise({width:[1536,1920],count:[1,2,3].filter(n=>!process.env.AUDIT_COUNTS||process.env.AUDIT_COUNTS.split(',').includes(String(n))),featured:[false,true],quoteEnabled:[false,true],choice:[...Object.keys(sizePresets),1,.75,.5,1/3]})) {
  if(process.env.AUDIT_CHOICES&&!process.env.AUDIT_CHOICES.split(',').includes(String(choice)))continue;
  const height=width===1536?960:1080;
  const monitor={width,height,scale:1.25,primary:true};
  const settings=normalizeSize({theme,shape:'portrait',sizePreset:typeof choice==='string'?choice:'Medium',fineTune:100,sizeMode:typeof choice==='number'?'screen':'fixed',fitFraction:typeof choice==='number'?choice:1,fitFineTune:100,quoteEnabled,fitHeight:true,appearance:'dark',featuredProvider:featured?'claude':'none',featuredPosition:'top',position:'Top right',linux:{margin:12}});
  const box=fittedGeometry(settings,count,monitor);
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(box.width),height:Math.ceil(box.height),deviceScaleFactor:1,mobile:false});
  const metrics=await b.evaluate(`(async()=>{
   const api=window.__AI_USAGE_DEMO__;
   await Promise.all([api.setWorkArea([${JSON.stringify(monitor)}]),api.setSettings(${JSON.stringify(settings)}),
   api.setSnapshot({providers:['claude','codex','gemini'].slice(0,${count}).map((id,i)=>({id,state:'OK',plan:'DEMO',windows:[{kind:'session',used_percent:84-i*20,resets_at:'2099-01-01T00:00:00Z'},{kind:'weekly',used_percent:62,resets_at:'2099-01-02T00:00:00Z'}]}))}),
   api.setQuote({status:'ok',cards:[{quote:'Patient work makes room for a clear thought. '.repeat(4),author:'Example Author',reason:'Fictional selection'}]})]);
   await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
   function measure(container){
    const r=container.getBoundingClientRect(),runs=[];
    for(const el of container.querySelectorAll('*'))if(visible(el)){
     for(const n of el.childNodes)if(n.nodeType===3&&n.textContent.trim()){const range=document.createRange();range.selectNodeContents(n);for(const t of range.getClientRects())runs.push([t.top,t.bottom]);}
     if(el.matches('.meter,.segments,.dot-bar,.ring-display')){const t=el.getBoundingClientRect();runs.push([t.top,t.bottom]);}
    }
    let end=r.top,gap=0,used=0;for(const [top,bottom] of runs.sort((a,b)=>a[0]-b[0])){const a=Math.max(r.top,top),z=Math.min(r.bottom,bottom);if(z<=a)continue;gap=Math.max(gap,a-end);used+=Math.max(0,z-Math.max(a,end));end=Math.max(end,z);}gap=Math.max(gap,r.bottom-end);
    return {height:r.height,gap,unused:1-used/r.height,limit:Math.max(2.5*parseFloat(getComputedStyle(document.documentElement).fontSize),r.height*.12)};
   }
   const errors=[];const shell=document.querySelector('#widget').getBoundingClientRect();
   for(const el of document.querySelectorAll('#providers,.provider-card,.quote-section,.quote-text'))if(visible(el)){
    const r=el.getBoundingClientRect();if(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)errors.push(el.className+': overflow');
    if(r.bottom>shell.bottom+1||r.top<shell.top-1||r.left<shell.left-1||r.right>shell.right+1)errors.push(el.className+': outside shell');
   }
   for(const card of document.querySelectorAll('.provider-card')){
    const bounds=card.getBoundingClientRect(),text=[];
    for(const el of card.querySelectorAll('*'))if(visible(el))for(const n of el.childNodes)if(n.nodeType===3&&n.textContent.trim()){
     const range=document.createRange();range.selectNodeContents(n);
     for(const r of range.getClientRects()){
      if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1)errors.push('card text clipped');
      text.push({...r.toJSON(),text:n.textContent});
     }
    }
    for(let i=0;i<text.length;i++)for(let j=i+1;j<text.length;j++)if(Math.min(text[i].right,text[j].right)-Math.max(text[i].left,text[j].left)>1&&Math.min(text[i].bottom,text[j].bottom)-Math.max(text[i].top,text[j].top)>1)errors.push('card text overlaps: '+text[i].text+' / '+text[j].text);
   }
   return {cards:[...document.querySelectorAll('.provider-card')].map(measure),widget:measure(document.querySelector('#widget')),errors};
  })()`);
  results.push({width,height,theme,count,featured,quoteEnabled,choice,...metrics});
  if(results.length%216===0)console.log(`${results.length} portrait cases measured`);
 }
 const failures=results.filter(r=>r.errors.length||r.cards.some(c=>c.gap>c.limit+1));
 const summary=[...Object.keys(sizePresets),1,.75,.5,1/3].map(choice=>{const rows=results.filter(r=>r.choice===choice);return {choice,worstGap:Math.max(...rows.flatMap(r=>r.cards.map(c=>c.gap))),worstUnused:Math.max(...rows.flatMap(r=>r.cards.map(c=>c.unused))),failures:rows.filter(r=>failures.includes(r)).length};});
 await writeFile(`${output}/results.json`,JSON.stringify({cases:results.length,summary,failures:failures.length,results},null,2));
 console.log(JSON.stringify({cases:results.length,summary,failures:failures.length},null,2));
 if(failures.length&&!process.env.AUDIT_BASELINE)process.exitCode=1;
}finally{await b.close();}
