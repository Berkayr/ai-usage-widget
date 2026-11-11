// Offline production renderer: every screen fraction, shape, theme and card count.
import {mkdir, writeFile} from 'node:fs/promises';
import {pairwise} from './pairwise.mjs';
import {browser} from './browser-harness.mjs';
import {normalizeSize, fittedGeometry, shapes} from '../../app/src/sizing.js';
import {displays} from './fixtures/work-areas.mjs';
const output=process.env.AUDIT_OUTPUT || 'gorevler/ss-ayar';
await mkdir(output,{recursive:true});
const b=await browser();const failures=[];let cases=0;
try {
 await b.cdp('Network.enable');await b.cdp('Network.setBlockedURLs',{urls:['https://*','http://*.com/*']});
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 for(const monitor of displays) {
  if(process.env.AUDIT_DISPLAYS && !process.env.AUDIT_DISPLAYS.split(',').includes(monitor.name))continue;
  for(const theme of themes.filter(t=>!process.env.AUDIT_THEMES||process.env.AUDIT_THEMES.split(',').includes(t))) {
  const selectedShapes=shapes.filter(s=>!process.env.AUDIT_SHAPES||process.env.AUDIT_SHAPES.split(',').includes(s));
  const samples=pairwise({shape:selectedShapes,fitFraction:[1,.75,.5,1/3],quoteEnabled:[false,true],count:[1,2,3]});
  // Keep the reported KDE Portrait case even if the covering array omits it.
  if(theme==='system' && selectedShapes.includes('portrait') && !samples.some(row=>row.shape==='portrait'&&row.fitFraction===1&&row.count===3&&row.quoteEnabled))
    samples.push({shape:'portrait',fitFraction:1,count:3,quoteEnabled:true});
  for(const {shape,fitFraction,quoteEnabled,count} of samples) {
   const settings=normalizeSize({theme,shape,sizeMode:'screen',fitFraction,fitFineTune:100,quoteEnabled,position:'Top right',linux:{margin:12},fitHeight:true,appearance:'dark',featuredProvider:'auto',featuredPosition:'top'});
   const geometry=fittedGeometry(settings,count,monitor,monitor.platform);
   const unit=monitor.platform==='windows'?monitor.scale:1;
   await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(geometry.width/unit),height:Math.ceil(geometry.height/unit),deviceScaleFactor:1,mobile:false});
   const errors=await b.evaluate(`(async()=>{
    const api=window.__AI_USAGE_DEMO__;
    await Promise.all([api.setWorkArea([${JSON.stringify({...monitor,primary:true})}],${JSON.stringify(monitor.platform)}),
    api.setSettings(${JSON.stringify(settings)}),
    api.setSnapshot({providers:['claude','codex','gemini'].slice(0,${count}).map((id,i)=>({id,plan:'DEMO',state:'OK',windows:[{kind:'session',used_percent:84-i*20,resets_at:'2099-01-01T00:00:00Z'},{kind:'weekly',used_percent:62,resets_at:'2099-01-02T00:00:00Z'}]}))}),
    api.setQuote({status:'ok',cards:[{quote:'Fictional words about patient work. '.repeat(4),author:'Example Author',reason:'A fictional selection'}]})]);
    await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const errors=[],shellElement=document.querySelector('#widget'),shell=shellElement.getBoundingClientRect();
    const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    for(const el of document.querySelectorAll('.header,.app-title,#providers,.provider-card,.quote-section,.quote-content,.quote-text')) {
      if(!visible(el))continue;
      const r=el.getBoundingClientRect();
      if(el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth)errors.push(el.className+': overflow '+el.scrollWidth+'/'+el.clientWidth+' '+el.scrollHeight+'/'+el.clientHeight);
      const clippedHeader=el.classList.contains('header')&&shellElement.contains(el)&&getComputedStyle(shellElement).overflow==='hidden'&&r.right>shell.left&&r.left<shell.right&&r.bottom>shell.top&&r.top<shell.bottom;
      if(!clippedHeader&&(r.top<shell.top-1||r.bottom>shell.bottom+1||r.left<shell.left-1||r.right>shell.right+1))errors.push(el.className+': outside shell');
    }
    if(shell.height>innerHeight+1 || shell.width>innerWidth+1)errors.push('shell outside viewport');
    if(${JSON.stringify(shape)}!=='portrait' && Math.abs(shell.height-innerHeight)>1)errors.push('shell fails to fill requested height');
    const title=document.querySelector('.app-title');
    if(visible(title)){const range=document.createRange();range.selectNodeContents(title);const r=range.getBoundingClientRect();if(r.left<shell.left-1||r.right>shell.right+1)errors.push('title text outside shell');}
    return errors;
   })()`);
   cases++;if(errors.length)failures.push({monitor:monitor.name,theme,shape,fitFraction,quoteEnabled,count,errors});
   if(monitor.name==='KDE 1200p 125%'&&theme==='system'&&shape==='portrait'&&fitFraction===1&&count===3&&quoteEnabled) {
    const png=await b.cdp('Page.captureScreenshot',{format:'png'});await writeFile(`${output}/screen-fit-portrait.png`,Buffer.from(png.data,'base64'));
   }
  }
  }
  console.log(`${monitor.name}: ${cases} cases, ${failures.length} failures`);
  await writeFile(`${output}/screen-fit-results.json`,JSON.stringify({cases,failures},null,2)+'\n');
 }
 console.log(`${cases} screen-fit cases; ${failures.length} failures`);if(failures.length)process.exitCode=1;
} finally {await b.close();}
