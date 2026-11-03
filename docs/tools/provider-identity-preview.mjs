// Representative combined silhouettes across all color modes. Fictional data only.
import {writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const b=await browser();
try {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 await b.evaluate(`(async()=>{
 document.documentElement.removeAttribute('style');document.documentElement.removeAttribute('data-shape');document.querySelector('#active-theme').remove();
 document.body.innerHTML='<h1>Provider identity</h1><p>Fictional providers · same OK / warning / danger status per row · Calm / Vivid / Mono</p><main id="sheet"></main>';
 const style=document.createElement('style');style.textContent='html,body{height:auto!important;overflow:visible!important;background:#777!important;color:white!important;font:16px system-ui!important}body{padding:20px!important}#sheet{display:grid;grid-template-columns:repeat(3,490px);gap:16px}section{display:flex;align-items:center;flex-direction:column;gap:8px}h2{font-size:16px}iframe{border:0;display:block}';document.head.append(style);
 for(const [theme,used] of [['brutalist',20],['circular-rings',65],['retro-lcd',90]])for(const colorMode of ['calm','vivid','mono']){
  const cell=document.createElement('section');cell.innerHTML='<h2>'+theme+' · '+colorMode+' · '+used+'%</h2>';document.querySelector('#sheet').append(cell);
  for(const shape of ['circle','pill']){
   const frame=document.createElement('iframe');frame.width=shape==='circle'?340:480;frame.height=shape==='circle'?340:120;frame.src='/?sample';cell.append(frame);await new Promise(r=>frame.onload=r);
   while(!frame.contentWindow.__AI_USAGE_DEMO__)await new Promise(r=>setTimeout(r,20));
   const api=frame.contentWindow.__AI_USAGE_DEMO__;
   await api.setSettings({theme,shape,colorMode,appearance:'dark',sizePreset:'Medium',fineTune:100});
   await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:used}]}))});
   await frame.contentDocument.fonts.ready;
  }
 }
 })()`);
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1550,height:1750,deviceScaleFactor:1,mobile:false});
 const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
 await writeFile('docs/tools/provider-identity-sheet.png',Buffer.from(png.data,'base64'));
 console.log('provider-identity-sheet.png: circle/pill, Calm/Vivid/Mono, OK/warning/danger');
}finally{await b.close();}
