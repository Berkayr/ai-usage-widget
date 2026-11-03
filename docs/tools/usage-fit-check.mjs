// Offline usage geometry matrix, including featured placement and quote placement.
import {mkdir, writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {shapes, sizePresets, widgetWidth, widgetHeight} from '../../app/src/sizing.js';
const b = await browser();
const failures = [];
let cases = 0;
const output = process.env.AUDIT_OUTPUT || 'gorevler/ss-ayar';
await mkdir(output, {recursive:true});
try {
  await b.cdp('Network.enable');
  await b.cdp('Network.setBlockedURLs', {urls:['https://*']});
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  await b.evaluate(`window.__AI_USAGE_DEMO__.setQuote({status:'ok',cards:[{quote:'Fictional words about quiet thought and patient work. '.repeat(4),author:'Example Author',reason:'A fictional selection'}]})`);
  const themes = await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  const select = (values, variable) => values.filter(v=>!process.env[variable] || process.env[variable].split(',').includes(v));
  async function check(settings, count, capture) {
    const scale = sizePresets[settings.sizePreset] * settings.fineTune / 10000;
    await b.cdp('Emulation.setDeviceMetricsOverride', {width:Math.round(widgetWidth(settings,count)*scale),height:Math.ceil(widgetHeight(settings,count)*scale),deviceScaleFactor:1,mobile:false});
    const errors = await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__;
      await api.setSettings(${JSON.stringify({...settings,fitHeight:true,appearance:'dark',widgetProviders:null})});
      await api.setSnapshot({providers:['claude','codex','gemini'].slice(0,${count}).map((id,i)=>({id,plan:'DEMO',state:'OK',windows:[{kind:'session',used_percent:84-i*20,resets_at:'2099-01-01T00:00:00Z'},{kind:'weekly',used_percent:62,resets_at:'2099-01-02T00:00:00Z'}]}))});
      if (${Boolean(capture)}) await api.setQuote({status:'ok',cards:[{quote:'Fictional words about quiet thought and patient work. '.repeat(4),author:'Example Author',reason:'A fictional selection'}]});
      await document.fonts.ready;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const errors=[],list=document.querySelector('#providers'),shell=document.querySelector('#widget').getBoundingClientRect(),lr=list.getBoundingClientRect();
      const visible=el=>getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length;
      for(const el of [document.querySelector('.header'),document.querySelector('.app-title'),list,...list.querySelectorAll('.provider-card')]) {
        if(!visible(el))continue;
        const cs=getComputedStyle(el),r=el.getBoundingClientRect();
        if(el.scrollHeight>el.clientHeight)errors.push(el.className+': vertical overflow '+el.scrollHeight+'/'+el.clientHeight);
        if(el.scrollWidth>el.clientWidth)errors.push(el.className+': horizontal overflow '+el.scrollWidth+'/'+el.clientWidth);
        const scrollbar=el.offsetWidth-el.clientWidth-parseFloat(cs.borderLeftWidth)-parseFloat(cs.borderRightWidth);
        if(scrollbar>0.5)errors.push(el.className+': scrollbar '+scrollbar);
        if(r.top<shell.top-1||r.bottom>shell.bottom+1||r.left<shell.left-1||r.right>shell.right+1)errors.push(el.className+': outside shell');
        if(el.classList.contains('provider-card')&&(r.top<lr.top-1||r.bottom>lr.bottom-parseFloat(getComputedStyle(list).paddingBottom)+1))errors.push('card edge clipped');
      }
      for (const card of list.querySelectorAll('.provider-card')) {
        if (!visible(card)) continue;
        const blocks=[...card.querySelectorAll('.provider-heading,.quota-window')].filter(visible).map(el=>el.getBoundingClientRect());
        for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++){
          const a=blocks[i],b=blocks[j];
          if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) errors.push('quota blocks overlap');
        }
      }
      return errors;
    })()`);
    cases++;
    if(errors.length) failures.push({settings,count,errors});
    if(capture) {
      const png=await b.cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(`${output}/${capture}.png`,Buffer.from(png.data,'base64'));
    }
  }
  // Reported 82% geometry is always measured, including after viewport changes.
  await check({theme:'brutalist',shape:'portrait',sizePreset:'Medium',fineTune:82,featuredProvider:'auto',featuredPosition:'top',quoteEnabled:true,quotePosition:'bottom'},3,process.env.AUDIT_CAPTURE || 'featured-after');
  if(!process.env.AUDIT_REPRO_ONLY) for(const theme of select(themes,'AUDIT_THEMES')) {
    for(const shape of select(shapes,'AUDIT_SHAPES')) for(const sizePreset of select(Object.keys(sizePresets),'AUDIT_SIZES')) for(const featured of ['none','auto','top','bottom']) for(const quote of ['off','top','bottom']) for(const count of [1,2,3]) {
      await check({theme,shape,sizePreset,fineTune:100,featuredProvider:featured==='none'?'none':'auto',featuredPosition:featured==='auto'?'bottom':featured,quoteEnabled:quote!=='off',quotePosition:quote==='top'?'top':'bottom'},count);
    }
    await writeFile(`${output}/usage-fit-results.json`,JSON.stringify({cases,failures},null,2)+'\n');
    console.log(`${theme}: ${cases} cases, ${failures.length} failures`);
  }
  await writeFile(`${output}/usage-fit-results.json`,JSON.stringify({cases,failures},null,2)+'\n');
  console.log(`${cases} usage-fit cases; ${failures.length} failures. ${output}/usage-fit-results.json`);
  if(failures.length)process.exitCode=1;
} finally {await b.close();}
