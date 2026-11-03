// Reviewable examples of configured layouts; synthetic providers only.
import {writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const b=await browser();
try{
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 await b.evaluate(`(()=>{document.querySelector('#active-theme').remove();document.documentElement.removeAttribute('style');document.body.innerHTML='<h1>Provider layout · fictional data</h1><div id="sheet"></div>';const css=document.createElement('style');css.textContent='html,body{height:auto!important;overflow:visible!important;background:#151a22!important;color:#eee!important;font:16px system-ui!important}body{padding:20px}#sheet{display:grid;grid-template-columns:repeat(4,340px);gap:16px}iframe{border:0}h2{font-size:16px}';document.head.append(css)})()`);
 for(const featuredProvider of ['auto','claude','none'])for(const featuredPosition of ['top','bottom']){
  await b.evaluate(`(async()=>{const section=document.createElement('section');section.innerHTML='<h2>${featuredProvider} / ${featuredPosition}</h2>';const frame=document.createElement('iframe');frame.width=340;frame.height=746;frame.src='/?sample';section.append(frame);document.querySelector('#sheet').append(section);await new Promise(r=>frame.onload=r);while(!frame.contentWindow.__AI_USAGE_DEMO__)await new Promise(r=>setTimeout(r,20));const api=frame.contentWindow.__AI_USAGE_DEMO__;await api.setSettings({theme:'brutalist',shape:'portrait',sizePreset:'Medium',fineTune:100,featuredProvider:'${featuredProvider}',featuredPosition:'${featuredPosition}',appearance:'dark'});await api.setSnapshot({providers:['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:[20,90,60][i]},{kind:'weekly',used_percent:30}]}))});await frame.contentDocument.fonts.ready;})()`);
 }
 await b.cdp('Emulation.setDeviceMetricsOverride',{width:1460,height:1670,deviceScaleFactor:1,mobile:false});
 const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('docs/tools/featured-sheet.png',Buffer.from(png.data,'base64'));
}finally{await b.close()}
