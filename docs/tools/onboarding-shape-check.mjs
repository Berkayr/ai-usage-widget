import assert from 'node:assert/strict';
import {browser} from './browser-harness.mjs';
const b=await browser();
try{
 for(const shape of ['portrait','landscape','square','circle','pill']){
  const fixture={settings:{theme:'system',shape,sizePreset:'Medium',fineTune:100,quoteEnabled:false},snapshot:{providers:[]},providerConfig:{initialized:false,providers:{claude:{enabled:false},codex:{enabled:false},gemini:{enabled:false}},detected:{},disclosures:{claude:'Reads local usage metadata. Synthetic example.',codex:'Reads local usage metadata. Synthetic example.',gemini:'Reads local usage metadata. Synthetic example.'}}};
  const script=await b.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__QUOTA_DOCS_FIXTURE__=${JSON.stringify(fixture)}`});
  await b.navigate('/?sample','window.__QUOTA_DOCS_READY__');
  const result=await b.evaluate(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const el=document.querySelector('#provider-onboarding'),button=el.querySelector('button'),s=getComputedStyle(document.querySelector('.widget')),r=button.getBoundingClientRect(),box=document.querySelector('.widget').getBoundingClientRect();return {shape:document.documentElement.dataset.shape,clip:s.clipPath,hidden:el.hidden,inside:r.top>=box.top&&r.bottom<=box.bottom&&r.left>=box.left&&r.right<=box.right};})()`);
  assert.equal(result.shape,'portrait');assert.equal(result.clip,'none');assert.equal(result.hidden,false);assert.equal(result.inside,true,shape);
  await b.evaluate(`document.querySelector('#provider-onboarding button').click()`);
  await new Promise(r=>setTimeout(r,40));
  assert.equal(await b.evaluate('document.documentElement.dataset.shape'),shape);
  await b.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});
 }
 console.log('PASS: all five shapes use a plain portrait onboarding shell, Start stays inside, saved shape restored');
}finally{await b.close();}
