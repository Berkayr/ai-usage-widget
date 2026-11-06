import {auditColorModes} from './color-mode-check.mjs';
import * as identity from '../../app/src/themes/shared/identity.js';
// Production DOM, fictional quotas. CIE76 ΔE in D65 Lab; no provider credentials.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {pairwise} from './pairwise.mjs';
const b=await browser();
try {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>({id:t.id,palettes:Object.keys(t.palettes)}))');
 const result={combinations:0,minDelta:Infinity,failures:[],batches:[]};
 for(const theme of themes) {
 const cases=pairwise({palette:theme.palettes,appearance:['dark','light'],colorMode:['calm','vivid','mono'],used:[20,65,90],shape:['circle','pill']});
 const started=performance.now();
 const batch=await b.evaluate(`(async()=>{
 const api=window.__AI_USAGE_DEMO__,failures=[];let combinations=0,minDelta=Infinity;
 const lab=color=>{
  const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
  const xyz=[[.4124564,.3575761,.1804375],[.2126729,.7151522,.072175],[.0193339,.119192,.9503041]].map((row,i)=>row.reduce((s,v,k)=>s+v*rgb[k],0)/[.95047,1,1.08883][i]).map(v=>v>216/24389?Math.cbrt(v):(24389/27*v+16)/116);
  return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];
 };
 const check=(ok,message,context)=>{if(!ok)failures.push({message,...context})};
 for(const {palette,appearance,colorMode,used,shape} of ${JSON.stringify(cases)}) {
  const theme=${JSON.stringify(theme)};
  const context={theme:theme.id,palette,appearance,colorMode,used,shape};combinations++;
  await api.setSettings({...context,theme:theme.id,sizePreset:'Medium',fineTune:100,widgetProviders:['claude','codex','gemini']});
  await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:used}]}))});
  let colors,patterns;
  if(shape==='circle') {
   colors=[...document.querySelectorAll('.dial-value')].map(el=>getComputedStyle(el).stroke);
   patterns=[...document.querySelectorAll('.dial-pattern')].map(el=>getComputedStyle(el).strokeDasharray);
   check(document.querySelectorAll('.dial-arc-label').length===3,'Three endpoint labels',context);
   check(document.querySelectorAll('.dial-status').length===(used>=50?3:0),'Threshold endpoint markers',context);
  } else {
   const cards=[...document.querySelectorAll('.provider-card')];
   colors=cards.map(el=>getComputedStyle(el,'::after').borderBottomColor);
   patterns=cards.map(el=>getComputedStyle(el,'::after').borderBottomStyle);
  }
  check(colors.length===3,'Three identity marks',context);
  if(colorMode==='mono')check(new Set(patterns).size===3,'Three monochrome patterns',context);
  else for(let i=0;i<colors.length;i++)for(let j=i+1;j<colors.length;j++) {
   const a=lab(colors[i]),c=lab(colors[j]),delta=Math.hypot(...a.map((v,k)=>v-c[k]));minDelta=Math.min(minDelta,delta);
   check(delta>=20,'Identity ΔE '+delta.toFixed(2)+' < 20',context);
  }
 }
 return {combinations,minDelta,failures};
 })()`);
 result.combinations+=batch.combinations;result.minDelta=Math.min(result.minDelta,batch.minDelta);result.failures.push(...batch.failures);
 result.batches.push({theme:theme.id,cases:batch.combinations,seconds:(performance.now()-started)/1000});
 console.log(JSON.stringify(result.batches.at(-1)));
 }
 const stable=await b.evaluate(`(async()=>{
 const api=window.__AI_USAGE_DEMO__,failures=[];const check=(ok,message,context)=>{if(!ok)failures.push({message,...context})};
 // Known providers must retain colors when reordered/subselected.
 await api.setSettings({shape:'circle',colorMode:'vivid',widgetProviders:['gemini','claude']});
 await api.setSnapshot({providers:['gemini','claude'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:20}]}))});
 check([...document.querySelectorAll('.dial-value')].map(el=>el.dataset.identity).join(',')==='2,0','Stable provider identity',{});
 await api.setSettings({shape:'circle',colorMode:'vivid',providerColors:{claude:'#b85d40'}});
 check(getComputedStyle(document.querySelector('[data-identity="0"].dial-value')).stroke==='rgb(184, 93, 64)','User override applied',{});

 for(const shape of ['portrait','landscape','square','pill']){
   await api.setSettings({shape});
   const mark=[...document.querySelectorAll('.provider-card')].find(el=>el.dataset.identity==='0');
   check(!!mark&&getComputedStyle(mark).getPropertyValue('--provider-0').trim()==='#b85d40','User override in '+shape,{});
 }
 await api.setSettings({providerColors:{}});
 return failures;
 })()`);
 result.failures.push(...stable);
 for(const dir of await readdir('app/src/themes')) {
   let theme;try{theme=JSON.parse(await readFile(`app/src/themes/${dir}/theme.json`,'utf8'));}catch{continue;}
   for(const palette of Object.values(theme.palettes))for(const appearance of ['dark','light']){
     const bg={...palette,...palette[appearance]}.bgWidget,colors=identity.defaultProviderColors(bg);
     for(let i=0;i<colors.length;i++){
       if(identity.colorContrast(colors[i],bg)<4.5)result.failures.push({message:'Default contrast',theme:dir,appearance,i});
       for(let j=0;j<i;j++)if(identity.colorDistance(colors[i],colors[j])<20)result.failures.push({message:'Extended default ΔE',theme:dir,appearance,i,j,delta:identity.colorDistance(colors[i],colors[j])});
     }
   }
 }
 if(identity.providerColorWarnings({providerColors:{claude:'#ffffff',codex:'#ffffff'}},'#ffffff').length<2)result.failures.push({message:'User warnings'});
 const modes=await auditColorModes(b);result.colorModes=modes.results;result.failures.push(...modes.failures.map(row=>({message:'Calm/Vivid pixel saturation',...row})));
 await writeFile('docs/tools/provider-identity-results.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));if(result.failures.length)process.exitCode=1;
}finally{await b.close();}
