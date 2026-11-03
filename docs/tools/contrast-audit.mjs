// npm --prefix app run build; node docs/tools/contrast-audit.mjs
// CHROME_BIN may point to Chromium/Edge. Set CHROME_NO_SANDBOX=1 only in an
// already isolated environment whose user namespace sandbox is unavailable.
import { auditSettings } from './settings-contrast-audit.mjs';
import { sizePresets } from '../../app/src/sizing.js';
import { browser } from './browser-harness.mjs';
const session=await browser();
try {
  await session.navigate('/?sample','window.__AI_USAGE_DEMO__');
  const total={combinations:0,texts:0,arcLabels:0,failures:[]};
  for(const sizePreset of Object.keys(sizePresets)) for(const shape of ['portrait','landscape','square','circle','pill']) for(const width of (shape==='portrait'?[200,340,600]:[shape==='landscape'?680:shape==='pill'?480:340])) {
  await session.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(width*sizePresets[sizePreset]/100),height:Math.ceil(1400*sizePresets[sizePreset]/100),deviceScaleFactor:1,mobile:false});
  const result=await session.evaluate(`(async()=>{
    const api=window.__AI_USAGE_DEMO__;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)};
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const failures=[];let combinations=0,texts=0,arcLabels=0;
    for(const theme of api.themes)for(const palette of Object.keys(theme.palettes))for(const appearance of ['light','dark'])for(const colorMode of ['calm','vivid','mono']) {
      await api.setSettings({sizePreset:${JSON.stringify(sizePreset)},fineTune:100,quoteEnabled:true,shape:${JSON.stringify(shape)},theme:theme.id,palette,appearance,colorMode,widgetOpacity:100,backgroundOpacity:100,accent:null,background:null});combinations++;
      const toggle=document.querySelector('#quote .quote-toggle');
      if(['circle','square'].includes(${JSON.stringify(shape)})&&document.documentElement.dataset.quotePage!=='true'){toggle.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
      if(${JSON.stringify(shape)}==='pill')toggle.click();
      await document.fonts.ready;
      for(const el of document.querySelectorAll('#widget *, .quote-dialog *')) {
        if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
        const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
        const layers=[];let opacity=1;
        for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);layers.unshift(rgba(s.backgroundColor));opacity*=Number(s.opacity);}
        let bg=[128,128,128];for(const l of layers)bg=bg.map((v,i)=>l[i]*l[3]+v*(1-l[3]));
        const s=getComputedStyle(el),fg=rgba(s.color),alpha=fg[3]*opacity;const painted=fg.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));
        if(el.classList.contains('dial-arc-label'))arcLabels++;
        const value=contrast(painted,bg),size=parseFloat(s.fontSize),large=size>=24||(size>=18&&Number(s.fontWeight)>=700),threshold=large?3:4.5;texts++;
        if(value<threshold)failures.push({shape:${JSON.stringify(shape)},theme:theme.id,palette,appearance,colorMode,text:el.textContent.trim().slice(0,70),selector:el.className||el.tagName,foreground:s.color,background:bg.map(Math.round).join(','),ratio:Number(value.toFixed(3)),threshold});
      }
      document.querySelector('.quote-dialog')?.close();
    }
    return {combinations,texts,arcLabels,failures};
  })()`);
  total.arcLabels+=result.arcLabels;total.combinations+=result.combinations;total.texts+=result.texts;total.failures.push(...result.failures.map(f=>({shape,width,sizePreset,...f})));
  }
  if(!total.arcLabels)total.failures.push({message:'Circle endpoint labels were not audited'});
  const settings=await auditSettings(session);
  total.combinations+=settings.combinations;total.texts+=settings.texts;total.failures.push(...settings.failures);
  const result=total;
  console.log(`${result.combinations} combinations, ${result.texts} visible text elements (${result.arcLabels} arc labels), ${result.failures.length} below threshold`);
  if(result.failures.length){console.table(result.failures);process.exitCode=1;}
}finally{await session.close();}
