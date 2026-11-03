// Production DOM, fictional quotas. CIE76 ΔE in D65 Lab; no provider credentials.
import {writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const b=await browser();
try {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const result=await b.evaluate(`(async()=>{
 const api=window.__AI_USAGE_DEMO__,failures=[];let combinations=0,minDelta=Infinity;
 const lab=color=>{
  const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
  const xyz=[[.4124564,.3575761,.1804375],[.2126729,.7151522,.072175],[.0193339,.119192,.9503041]].map((row,i)=>row.reduce((s,v,k)=>s+v*rgb[k],0)/[.95047,1,1.08883][i]).map(v=>v>216/24389?Math.cbrt(v):(24389/27*v+16)/116);
  return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];
 };
 const check=(ok,message,context)=>{if(!ok)failures.push({message,...context})};
 for(const theme of api.themes)for(const palette of Object.keys(theme.palettes))for(const appearance of ['dark','light'])for(const colorMode of ['calm','vivid','mono'])for(const used of [20,65,90])for(const shape of ['circle','pill']) {
  const context={theme:theme.id,palette,appearance,colorMode,used,shape};combinations++;
  await api.setSettings({...context,theme:theme.id,sizePreset:'Medium',fineTune:100,widgetProviders:['claude','codex','gemini']});
  await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:used}]}))});
  let colors,patterns;
  if(shape==='circle') {
   colors=[...document.querySelectorAll('.dial-value')].map(el=>getComputedStyle(el).stroke);
   patterns=[...document.querySelectorAll('.dial-pattern')].map(el=>getComputedStyle(el).strokeDasharray);
   [...document.querySelectorAll('.dial-legend i')].forEach((el,i)=>{
    check(getComputedStyle(el)[colorMode==='mono'?'borderBottomColor':'backgroundColor']===colors[i],'Legend identity differs from ring',context);
   });
   check(document.querySelectorAll('.dial-status').length===(used>=50?3:0),'Threshold endpoint markers',context);
   check([...document.querySelectorAll('.dial-status-label')].every(el=>el.textContent===(used>=80?' !!':used>=50?' !':'')),'Threshold symbols',context);
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
 // Known providers must retain colors when reordered/subselected.
 await api.setSettings({shape:'circle',colorMode:'vivid',widgetProviders:['gemini','claude']});
 await api.setSnapshot({providers:['gemini','claude'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:20}]}))});
 check([...document.querySelectorAll('.dial-value')].map(el=>el.dataset.identity).join(',')==='2,0','Stable provider identity',{});
 return {combinations,minDelta,failures};
 })()`);
 await writeFile('docs/tools/provider-identity-results.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));if(result.failures.length)process.exitCode=1;
}finally{await b.close();}
