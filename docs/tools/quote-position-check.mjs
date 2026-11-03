// Production renderer and logical Linux layer-shell work area; entirely offline.
import {browser} from './browser-harness.mjs';
import {normalizeSize,monitorFit,widgetWidth,widgetHeight,sizePresets,shapes} from '../../app/src/sizing.js';
const b=await browser();let count=0;
try {
 await b.cdp('Network.enable');await b.cdp('Network.setBlockedURLs',{urls:['https://*']});
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 const monitor={name:'Synthetic laptop',width:1536,height:926,primary:true,scale:1};
 for(const theme of themes)for(const shape of shapes)for(const sizePreset of Object.keys(sizePresets))for(const quotePosition of ['top','bottom']) {
  const settings=normalizeSize({theme,shape,sizePreset,fineTune:82,quoteEnabled:true,quotePosition,fitHeight:true,position:'Top right',linux:{margin:12}});
  const fit=monitorFit(settings,3,monitor),factor=Math.min(settings.scale,fit.maxScale)/100;
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(widgetWidth(settings,3)*factor),height:Math.ceil(widgetHeight(settings,3)*factor),deviceScaleFactor:1,mobile:false});
  await b.evaluate(`(async()=>{
   const api=window.__AI_USAGE_DEMO__;
   await api.setWorkArea([${JSON.stringify(monitor)}]);await api.setSettings(${JSON.stringify(settings)});
   await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
   await api.setQuote({status:'ok',cards:[{quote:'An invented reflection about quiet thought and patient work. '.repeat(4),author:'Example Author',work:'An Invented Work (1933)',author_description:'Fictional writer',reason:'Died on this day, 1957'}]});
   await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const fail=m=>{throw Error(${JSON.stringify([theme,shape,sizePreset,quotePosition].join('/'))}+': '+m)};
   if(api.getSettings().fineTune!==82)fail('Fine-tune changed');
   const widget=document.querySelector('#widget').getBoundingClientRect();
   if(widget.right>innerWidth+1||widget.bottom>innerHeight+1)fail('Shell outside viewport');
   if(['portrait','landscape'].includes(${JSON.stringify(shape)})) {
    const q=document.querySelector('#quote').getBoundingClientRect(),p=document.querySelector('#providers').getBoundingClientRect();
    if(${JSON.stringify(quotePosition)}==='top' ? q.bottom>p.top+1 : p.bottom>q.top+1)fail('Quote order / overlap');
    const t=document.querySelector('.quote-text');if(t.scrollHeight>t.clientHeight||t.scrollWidth>t.clientWidth)fail('Quote overflow');
   }
   document.querySelector('.quote-source')?.click();
   const dialog=document.querySelector('.quote-dialog');
   if(dialog){if(!dialog.textContent.includes('An Invented Work (1933)')||!dialog.textContent.includes('Fictional writer'))fail('Missing dialog context');dialog.close();}
  })()`);count++;
 }
 console.log(`${count} work-area / quote-position cases passed; 1536x960 output, 34px panel, 12px margin, fine-tune 82`);
} finally {await b.close();}
