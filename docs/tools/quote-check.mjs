import {writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {widgetWidth,widgetHeight} from '../../app/src/sizing.js';
export async function auditQuotes(b) {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 let count=0;
 for(const theme of themes)for(const shape of ['portrait','landscape','square','circle','pill'])for(const appearance of ['dark','light']) for(const sizePreset of ['Small','Medium','X-Large']) {
  const settings={theme,shape,appearance,quoteEnabled:true,sizePreset,fineTune:100};
  const scale=({Small:.75,Medium:1,'X-Large':2})[sizePreset];
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(widgetWidth(settings,3)*scale),height:Math.ceil(widgetHeight(settings,3)*scale)+10,deviceScaleFactor:1,mobile:false});
  await b.evaluate(`(async()=>{
   const api=window.__AI_USAGE_DEMO__;await api.setSettings(${JSON.stringify(settings)});
   await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
   await api.setQuote({status:'offline',cards:[{quote:'<img src=x onerror=alert(1)> '+ 'A long fictional quote about patience and perseverance. '.repeat(40),author:'Example author',reason:'Born on this day, 1769',source_url:'javascript:alert(1)',license:'CC BY-SA 4.0'},{quote:'Second fictional quote.',author:'Another author',reason:'Daily pick',source_url:'https://en.wikiquote.org/wiki/Example',license:'CC BY-SA 4.0'}]});
   const q=document.querySelector('#quote'),toggle=q.querySelector('.quote-toggle');
   if(['square','circle'].includes(${JSON.stringify(shape)})&&document.documentElement.dataset.quotePage!=='true'){toggle.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
   if(q.hidden)throw Error('Quote hidden');
   if(q.querySelector('img,script'))throw Error('Remote HTML rendered');
   if(${JSON.stringify(shape)}!=='pill'&&q.querySelector('.quote-label').textContent!==({reactor:'CORE / DAILY QUOTE',terminal:'> quote','retro-lcd':'[ DAILY QUOTE ]','dot-matrix':'•• DAILY QUOTE',brutalist:'DAILY QUOTE','minimal-pace':'Daily reflection','compact-strip':'QUOTE /','circular-rings':'◉ Daily quote','frosted-glass':'Daily inspiration'})[${JSON.stringify(theme)}]&&${JSON.stringify(theme)}!=='system')throw Error('Theme quote signature');
   if(${JSON.stringify(theme)}==='reactor'&&${JSON.stringify(shape)}!=='pill'){
    const content=getComputedStyle(q.querySelector('.quote-content')),label=getComputedStyle(q.querySelector('.quote-label'));
    if(!content.backgroundImage.includes('radial-gradient')||!content.boxShadow.includes('inset')||!content.boxShadow.includes('1px'))throw Error('Reactor quote core line/glow signature');
    if(label.textTransform!=='uppercase'||Math.abs(parseFloat(label.letterSpacing)/parseFloat(label.fontSize)-.1)>.01)throw Error('Reactor quote technical label signature');
   }
   const w=document.querySelector('#widget').getBoundingClientRect();
   for(const el of q.querySelectorAll('button,.quote-author,.quote-label,.quote-reason')){
    if(!el.getClientRects().length)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
    if(r.left<w.left-1||r.right>w.right+1||r.top<w.top-1||r.bottom>w.bottom+1)throw Error('Quote outside '+${JSON.stringify(theme+' '+shape)});
    if(getComputedStyle(el).fontFamily!==getComputedStyle(document.querySelector('#widget')).fontFamily)throw Error('Quote family mismatch');
   }
   const link=q.querySelector('.quote-source')||toggle;link.click();
   const dialog=document.querySelector('.quote-dialog');if(!dialog?.open||!dialog.textContent.includes('CC BY-SA 4.0'))throw Error('Attribution inaccessible');if(dialog.querySelector('a').hasAttribute('href'))throw Error('Unsafe source URL');dialog.close();
  })()`);count++;
 }
 console.log(`${count} quote theme/shape/appearance checks passed`);
}
async function sheet(b) {
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:2300,height:3800,deviceScaleFactor:1,mobile:false});
 await b.evaluate(`(async()=>{
 const themes=window.__AI_USAGE_DEMO__.themes.map(t=>t.id);
 document.documentElement.removeAttribute('style');document.head.querySelector('#active-theme').remove();
 document.body.innerHTML='<h1>AI Usage · daily quote</h1><p>Fictional documentation data · portrait / landscape / square / circle / pill</p><div id="sheet"></div>';
 const style=document.createElement('style');style.textContent='html,body{height:auto!important;overflow:visible!important;background:#151922!important;color:#fff!important;font:16px system-ui!important}body{padding:20px!important}#sheet{display:grid;grid-template-columns:repeat(5,440px);gap:12px}iframe{border:0;display:block}h2{font:14px system-ui;margin:6px}';document.head.append(style);
 for(const theme of themes)for(const shape of ['portrait','landscape','square','circle','pill']){
 const section=document.createElement('section');section.innerHTML='<h2>'+theme+' · '+shape+'</h2>';document.querySelector('#sheet').append(section);
 const f=document.createElement('iframe');f.width=shape==='landscape'?680:shape==='pill'?480:340;f.height=shape==='portrait'?526:shape==='pill'?120:340;
 if(shape==='landscape'||shape==='pill'){f.style.transform='scale(.62)';f.style.transformOrigin='top left';f.style.marginBottom='-'+(Number(f.height)*.38)+'px';}
 f.src='/?sample';section.append(f);await new Promise(r=>f.onload=r);const w=f.contentWindow;while(!w.__AI_USAGE_DEMO__)await new Promise(r=>setTimeout(r,20));
 await w.__AI_USAGE_DEMO__.setSettings({theme,shape,quoteEnabled:true,sizePreset:'Medium',fineTune:100,fitHeight:true,appearance:'dark'});
 await w.__AI_USAGE_DEMO__.setSnapshot({providers:[{id:'claude',state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}]});
 if(['square','circle'].includes(shape)){f.contentDocument.querySelector('.quote-toggle').click();await new Promise(r=>setTimeout(r,30));}
 await f.contentDocument.fonts.ready;
 }
 })()`);
 const height=await b.evaluate('document.body.scrollHeight');
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:2300,height,deviceScaleFactor:1,mobile:false});
 const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
 await writeFile('docs/tools/quote-sheet.png',Buffer.from(png.data,'base64'));
}
if(process.argv[1]?.endsWith('/quote-check.mjs')) {const b=await browser();try{await auditQuotes(b);await sheet(b);}finally{await b.close();}}
