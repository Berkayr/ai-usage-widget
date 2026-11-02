// Production render path, fictional data, no native application or credentials.
import { writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
import { sizePresets, normalizeSize, widgetWidth, widgetHeight } from '../../app/src/sizing.js';
const b = await browser();
try {
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  const themes = await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  const rows = [];
  for (const theme of themes) for (const sizePreset of Object.keys(sizePresets)) for (const count of [0,1,3,6]) {
    const settings = normalizeSize({theme,sizePreset,fineTune:100});
    const factor = settings.scale / 100;
    const width = widgetWidth(settings,count)*factor, height = widgetHeight(settings,count)*factor;
    await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(width),height:Math.ceil(height)+100,deviceScaleFactor:1,mobile:false});
    const measured = await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__;
      await api.setSettings(${JSON.stringify({...settings,fitHeight:true})});
      await api.setSnapshot({providers:Array.from({length:${count}},(_,i)=>({id:'fictional-'+i,label:'Provider '+(i+1),state:i%3===1?'AUTH_REQUIRED':'OK',windows:i%3===1?[]:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
      await document.fonts.ready;
      const rect=document.querySelector('#widget').getBoundingClientRect();
      const title=document.querySelector('.app-title'), style=getComputedStyle(title);
      if(title.textContent!=='AI USAGE'||parseFloat(style.letterSpacing)<0||style.transform!=='none'||style.fontStretch!=='100%')throw Error('Title contract: '+${JSON.stringify(theme)});
      if(style.fontFamily!==getComputedStyle(document.querySelector('.widget')).fontFamily)throw Error('Title/body family mismatch');
      return {width:rect.width,height:rect.height,cards:[...document.querySelectorAll('.provider-card,.no-data')].map(el=>el.getBoundingClientRect().height)};
    })()`);
    // Grid themes redistribute the same provider budget over two columns.
    const grid = ['brutalist','circular-rings'].includes(theme) && count > 0;
    const expectedCard = grid
      ? (count * 210 - (theme === 'brutalist' ? 10 : Math.ceil(count/2)*10)) / Math.ceil(count/2) * factor
      : 200 * factor;
    const error = Math.max(Math.abs(width-measured.width),Math.abs(height-measured.height),...measured.cards.map(h=>Math.abs(h-expectedCard)));
    rows.push({theme,sizePreset,providers:count,width:measured.width,height:measured.height,providerHeight:measured.cards[0],expectedWidth:width,expectedHeight:height,error});
  }
  console.table(rows);
  const failures=rows.filter(r=>r.error>2);
  await writeFile('docs/tools/size-audit.json',JSON.stringify({tolerancePx:2,rows,failures},null,2)+'\n');
  // A normal-size widget and a separate 150% header crop for every theme.
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:2040,deviceScaleFactor:1,mobile:false});
  await b.evaluate(`(async()=>{
    document.documentElement.removeAttribute('style');document.head.querySelector('#active-theme').remove();
    document.body.innerHTML='<h1>AI Usage · size & title contract</h1><p>Medium · one fictional provider. Header detail at 150% below each card.</p><div id="sheet"></div>';
    const style=document.createElement('style');style.textContent='html,body{height:auto!important;overflow:visible!important;background:#141820!important;color:#f4f5f7!important;font:16px system-ui!important}body{padding:28px!important}#sheet{display:grid;grid-template-columns:repeat(3,340px);gap:28px 40px}iframe{border:0;display:block}h2{font-size:16px;margin:12px 0}p{color:#bac4d5}';document.head.append(style);
    for(const theme of ${JSON.stringify(themes)}) {
      const cell=document.createElement('section');cell.innerHTML='<h2>'+theme+'</h2>';document.querySelector('#sheet').append(cell);
      for(const detail of [false,true]){
        const f=document.createElement('iframe');f.width=detail?340:340;f.height=detail?110:326;f.src='/?sample';cell.append(f);
        await new Promise(r=>f.onload=r);const w=f.contentWindow;
        while(!w.__AI_USAGE_DEMO__)await new Promise(r=>setTimeout(r,20));
        await w.__AI_USAGE_DEMO__.setSettings({theme,sizePreset:'Medium',fineTune:detail?150:100,fitHeight:true,appearance:'dark'});
        await w.__AI_USAGE_DEMO__.setSnapshot({providers:[{id:'claude',state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}]});
        await f.contentDocument.fonts.ready;
      }
    }
  })()`);
  const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('docs/tools/size-sheet.png',Buffer.from(png.data,'base64'));
  console.log(`${rows.length} theme/size/provider combinations; ${failures.length} outside ±2 px. size-sheet.png generated.`);
  if(failures.length)process.exitCode=1;
} finally { await b.close(); }
