import {mkdir,writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {normalizeSize,fittedGeometry,shapes} from '../../app/src/sizing.js';
const output='gorevler/ss-sekil-final';await mkdir(output,{recursive:true});
const monitor={width:1536,height:926,scale:1,primary:true};
const b=await browser();
try{
 await b.cdp('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 for(const shape of shapes.filter(s=>!process.env.AUDIT_SHAPES||process.env.AUDIT_SHAPES.split(',').includes(s)))for(const theme of themes)for(const sizePreset of (theme==='system'?['Small','Medium','Large','X-Large']:['Medium'])){
  const settings=normalizeSize({theme,shape,sizePreset,fineTune:100,sizeMode:'fixed',quoteEnabled:true,appearance:'dark',featuredProvider:'claude',featuredPosition:'top',position:'Top right',linux:{margin:12}});
  const box=fittedGeometry(settings,3,monitor);
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(box.width),height:Math.ceil(box.height),deviceScaleFactor:1,mobile:false});
  await b.evaluate(`(async()=>{const api=window.__AI_USAGE_DEMO__;await api.setWorkArea([${JSON.stringify(monitor)}]);await api.setSettings(${JSON.stringify(settings)});await api.setSnapshot({generated_at:new Date().toISOString(),providers:['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:[21,8,30][i],resets_at:new Date(Date.now()+7200000).toISOString()},{kind:'weekly',used_percent:[33,13,18][i],resets_at:new Date(Date.now()+172800000).toISOString()}]}))});await api.setQuote({status:'ok',cards:[{quote:'Patient work makes room for a clear thought.',author:'Example Author',reason:'Fictional selection'}]});await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
  const png=await b.cdp('Page.captureScreenshot',{format:'png'});await writeFile(`${output}/${shape}-${theme}-${sizePreset}.png`,Buffer.from(png.data,'base64'));
 }
 console.log('Synthetic shape screenshots saved');
}finally{await b.close();}
