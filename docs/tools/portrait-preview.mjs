// Focused synthetic portrait captures for visual review, never starts the native app.
import {mkdir,writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {normalizeSize,fittedGeometry} from '../../app/src/sizing.js';
const output=process.env.AUDIT_OUTPUT||'gorevler/portrait-preview';await mkdir(output,{recursive:true});
const b=await browser(),count=Number(process.env.AUDIT_COUNT)||3;
try{
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 for(const theme of themes.filter(t=>!process.env.AUDIT_THEMES||process.env.AUDIT_THEMES.split(',').includes(t)))for(const sizeMode of ['screen','fixed']){
  const monitor={width:1536,height:960,scale:1.25,primary:true};
  const settings=normalizeSize({theme,shape:'portrait',sizeMode,sizePreset:'Small',fineTune:100,fitFraction:1,fitFineTune:100,quoteEnabled:true,quotePosition:'bottom',fitHeight:true,featuredProvider:count===1?'claude':'gemini',featuredPosition:'top',appearance:'dark',position:'Top right',linux:{margin:12}});
  const box=fittedGeometry(settings,count,monitor);
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(box.width),height:Math.ceil(box.height),deviceScaleFactor:1,mobile:false});
  await b.evaluate(`(async()=>{const api=window.__AI_USAGE_DEMO__;await api.setWorkArea([${JSON.stringify(monitor)}]);await api.setSettings(${JSON.stringify(settings)});await api.setSnapshot({providers:['claude','codex','gemini'].slice(0,${count}).map(id=>({id,state:'OK',plan:'DEMO',windows:[{kind:'session',used_percent:54,resets_at:'2099-01-01T00:00:00Z'},{kind:'weekly',used_percent:32,resets_at:'2099-01-02T00:00:00Z'}]}))});await api.setQuote({status:'ok',cards:[{quote:'Patient work makes room for a clear thought. '.repeat(4),author:'Example Author',reason:'Fictional selection'}]});await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
  const bounds=await b.evaluate(`(()=>{const r=document.querySelector('#widget').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
  const png=await b.cdp('Page.captureScreenshot',{format:'png',clip:bounds});await writeFile(`${output}/${theme}-${sizeMode}.png`,Buffer.from(png.data,'base64'));
 }
}finally{await b.close();}
