// Offline reproduction: synthetic providers and quote on a 1536 × 960 display.
import {mkdir,writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const stage=process.argv[2] || 'after';
if(!['before','after'].includes(stage))throw Error('Expected before or after');
const output='gorevler/ss-ayar';
await mkdir(output,{recursive:true});
const b=await browser();
try {
 await b.cdp('Network.enable');await b.cdp('Network.setBlockedURLs',{urls:['https://*']});
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const rows=[];
 for(const [sizePreset,fineTune] of [['Medium',82],['Large',82],['Medium',82]]) {
  // Native placement caps the viewport to the logical work area minus edge margins.
  const presets=stage==='before'?{Medium:100,Large:150}:{Medium:100,Large:125};
  const scale=presets[sizePreset]*fineTune/10000;
  const desiredHeight=(stage==='before'?946:946)*scale;
  const actualScale=stage==='after'?Math.min(scale,902/946,1512/340):scale;
  const height=Math.min(902,Math.ceil(946*actualScale));
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(340*actualScale),height,deviceScaleFactor:1,mobile:false});
  const row=await b.evaluate(`(async()=>{
   const api=window.__AI_USAGE_DEMO__;
   if(${JSON.stringify(stage)}==='after')await api.setWorkArea([{name:'Synthetic laptop',width:1536,height:926,primary:true,scale:1}]);
   await api.setSettings({linux:{margin:12},theme:'brutalist',shape:'portrait',sizePreset:${JSON.stringify(sizePreset)},fineTune:${fineTune},quoteEnabled:true,fitHeight:true,appearance:'dark',featuredProvider:'claude'});
   await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
   await api.setQuote({status:'ok',cards:[{quote:'Fictional words about quiet thought and patient work. '.repeat(4),author:'Example Author',work:'An Invented Book (1933)',author_description:'Fictional essayist',reason:'Died on this day, 1957'}]});
   await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
   return {text:rect('.quote-text'),quote:rect('#quote'),providers:rect('#providers'),font:getComputedStyle(document.querySelector('.quote-text')).fontSize,weight:getComputedStyle(document.querySelector('.quote-text')).fontWeight,transform:getComputedStyle(document.querySelector('.quote-text')).textTransform};
  })()`);
  rows.push({sizePreset,fineTune,desiredHeight,viewport:{width:Math.round(340*actualScale),height},...row});
  const png=await b.cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(`${output}/${stage}-${sizePreset.toLowerCase()}.png`,Buffer.from(png.data,'base64'));
 }
 if(stage==='after') {
  await b.evaluate('window.__AI_USAGE_DEMO__.setSettings({quotePosition:"top"})');
  const top=await b.cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(`${output}/after-medium-top.png`,Buffer.from(top.data,'base64'));
 }
 await writeFile(`${output}/${stage}.json`,JSON.stringify(rows,null,2)+'\n');
 console.log(JSON.stringify(rows));
} finally {await b.close();}
