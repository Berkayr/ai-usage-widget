// Synthetic examples, using the production renderer without a native window.
import {writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const b=await browser();
try {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 console.log(await b.evaluate(`(async()=>{
  const api=window.__AI_USAGE_DEMO__,assert=(ok,message)=>{if(!ok)throw Error(message)};
  await api.setSettings({shape:'square',theme:'system',sizePreset:'Medium',fineTune:100});
  await api.setSnapshot({providers:Array.from({length:6},(_,i)=>({id:'demo-'+i,label:'Provider '+(i+1),state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
  assert(document.querySelectorAll('.provider-card').length===4,'First square page');
  document.querySelector('.shape-pages button:last-child').click();await new Promise(r=>setTimeout(r,60));
  assert(document.querySelectorAll('.provider-card').length===2,'Second square page');
  assert(document.querySelector('.provider-heading h2').textContent==='Provider 5','Second page provider identity');
  await api.setSettings({shape:'landscape'});assert(document.querySelectorAll('.provider-card').length===6,'Landscape restores all providers');
  assert(document.querySelector('.shape-pages').hidden,'Landscape hides pagination');
  await api.setSnapshot({providers:[{id:'one',state:'AUTH_REQUIRED',windows:[]},{id:'hidden',state:'DISABLED'}]});
  assert(document.querySelectorAll('.provider-card').length===1,'Hidden providers excluded');
  await api.setSettings({shape:'square',fitHeight:false,sizePreset:'Small',fineTune:50});
  await api.setSnapshot({providers:[]});
  assert(document.querySelector('.shape-pages').hidden,'Stale pages removed');
  assert(document.querySelector('.no-data'),'Empty shape');
  const rect=document.querySelector('.widget').getBoundingClientRect();assert(Math.abs(rect.height-127.5)<1,'Fixed height with fit disabled');
  for(const el of document.querySelectorAll('.widget *')){if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||!el.getClientRects().length)continue;const r=el.getBoundingClientRect();if(r.width&&r.height)assert(parseFloat(getComputedStyle(el).fontSize)>=9,'Fine-tune text floor');}
  await api.setSettings({shape:'circle',sizePreset:'Medium',fineTune:100,widgetProviders:['demo-3','demo-5']});
  await api.setSnapshot({providers:Array.from({length:6},(_,i)=>({id:'demo-'+i,label:'Provider '+(i+1),state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
  assert(document.querySelectorAll('.dial-track').length===2,'Pinned circle providers');assert(document.querySelector('.dial-legend').textContent.includes('Provider 4')&&!document.querySelector('.dial-legend').textContent.includes('Provider 1'),'Pinned identities');
  await api.setSettings({shape:'pill'});assert(document.querySelectorAll('.provider-card').length===2,'Pill keeps selection');
  await api.setSettings({widgetProviders:[]});assert(document.querySelector('.no-data'),'Empty pill selection');
  await api.setSettings({shape:'circle'});assert(document.querySelector('.dial-name').textContent==='NO ACTIVE PROVIDERS','Empty circle selection');
  return 'PASS: round selection, pinned identities, empty selections, square pages, provider identity, shape transitions, hidden providers, empty state, fit disabled, 9px fine-tune floor';
 })()`));
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1630,height:1830,deviceScaleFactor:1,mobile:false});
 await b.evaluate(`(async()=>{
  const themes=window.__AI_USAGE_DEMO__.themes.map(t=>t.id);
  document.documentElement.removeAttribute('style');document.head.querySelector('#active-theme').remove();
  document.body.innerHTML='<h1>AI Usage · Shapes</h1><p>Five shapes · Small · fictional usage data</p><div id="sheet"></div>';
  const style=document.createElement('style');style.textContent='html,body{height:auto!important;overflow:visible!important;background:#141820!important;color:#f4f5f7!important;font:16px system-ui!important}body{padding:24px!important}h1{margin:0}p{color:#bac4d5}#sheet{display:grid;grid-template-columns:repeat(3,510px);gap:18px}iframe{border:0;display:block;margin-bottom:8px}h2{font-size:16px;margin:8px 0}';document.head.append(style);
  for(const theme of themes){
   const cell=document.createElement('section');cell.innerHTML='<h2>'+theme+'</h2>';document.querySelector('#sheet').append(cell);
   for(const shape of ['portrait','landscape','square','circle','pill']){
    const f=document.createElement('iframe');f.width=shape==='landscape'?510:shape==='pill'?360:255;f.height=shape==='portrait'?560:shape==='pill'?90:255;f.src='/?sample';cell.append(f);await new Promise(r=>f.onload=r);
    while(!f.contentWindow.__AI_USAGE_DEMO__)await new Promise(r=>setTimeout(r,20));
    await f.contentWindow.__AI_USAGE_DEMO__.setSettings({theme,shape,sizePreset:'Small',fineTune:100,appearance:'dark'});
    await f.contentWindow.__AI_USAGE_DEMO__.setSnapshot({generated_at:new Date().toISOString(),providers:['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:[34,78,12][i],resets_at:new Date(Date.now()+9600000).toISOString()},{kind:'weekly',used_percent:[62,41,89][i],resets_at:new Date(Date.now()+144000000).toISOString()}]}))});
    await f.contentDocument.fonts.ready;
   }
  }
 })()`);
 const {cssContentSize}=await b.cdp('Page.getLayoutMetrics');
 const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:cssContentSize.width,height:cssContentSize.height,scale:1}});
 await writeFile('docs/screenshots/shapes.png',Buffer.from(png.data,'base64'));
}finally{await b.close();}
