// Nine production dials at Medium; synthetic data only, no native process.
import {writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const allOk=process.env.CIRCLE_ALL_OK==='1';
const output=allOk?'circle-sheet-all-ok.png':'circle-sheet.png';
const b=await browser();
try {
  await b.cdp('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  await b.evaluate(`(async()=>{
    const themes=window.__AI_USAGE_DEMO__.themes.map(t=>t.id);
    document.documentElement.removeAttribute('style');document.documentElement.removeAttribute('data-shape');
    document.querySelector('#active-theme').remove();
    document.body.innerHTML='<h1>AI Usage · Circle</h1><p>Medium · three fictional providers · dark / light · ${allOk?'all OK':'mixed thresholds'}</p><div id="sheet"></div>';
    const style=document.createElement('style');style.textContent='html,body{height:auto!important;overflow:visible!important;background:transparent!important;color:#6f7a8c!important;font:16px system-ui!important}body{padding:24px!important}h1{margin:0}#sheet{display:grid;grid-template-columns:repeat(3,700px);gap:20px}section{display:flex;flex-wrap:wrap;gap:10px}h2{width:100%;font-size:18px;margin:12px 0 0}iframe{border:0;display:block;background:transparent}';document.head.append(style);
    for(const theme of themes){
      const cell=document.createElement('section');cell.innerHTML='<h2>'+theme+'</h2>';document.querySelector('#sheet').append(cell);
      for(const appearance of ['dark','light']){
        const frame=document.createElement('iframe');frame.width=340;frame.height=340;frame.src='/?sample';cell.append(frame);await new Promise(r=>frame.onload=r);
        while(!frame.contentWindow.__AI_USAGE_DEMO__)await new Promise(r=>setTimeout(r,20));
        const api=frame.contentWindow.__AI_USAGE_DEMO__;
        await api.setSettings({theme,shape:'circle',sizePreset:'Medium',fineTune:100,appearance});
        await api.setSnapshot({providers:['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:${allOk?"[16,20,30][i]":"[34,78,92][i]"},resets_at:new Date(Date.now()+9600000).toISOString()},{kind:'weekly',used_percent:[62,41,89][i]}]}))});
        await frame.contentDocument.fonts.ready;
      }
    }
  })()`);
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:2200,height:1350,deviceScaleFactor:1,mobile:false});
  const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  const corners=await b.evaluate(`(async()=>{
    const img=new Image();img.src='data:image/png;base64,${png.data}';await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    let checked=0;
    for(const frame of document.querySelectorAll('iframe')){const r=frame.getBoundingClientRect();for(const x of [r.left+2,r.right-3])for(const y of [r.top+2,r.bottom-3]){if(ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data[3]!==0)throw Error('Opaque circle corner: '+frame.contentDocument.documentElement.dataset.theme);checked++;}}
    return checked;
  })()`);
  console.log(corners+' transparent circle corners verified from PNG pixels');
  await writeFile('docs/tools/'+output ,Buffer.from(png.data,'base64'));
  console.log(output+': nine themes, Medium, three providers, dark/light, transparent canvas');
} finally {await b.close();}
