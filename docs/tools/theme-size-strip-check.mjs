// Fictional snapshots only: exercise real layout without native settings or credentials.
import assert from 'node:assert/strict';
import {browser} from './browser-harness.mjs';
import {normalizeSize,fittedGeometry} from '../../app/src/sizing.js';
const b=await browser();
let cases=0;
const failures=[];
try {
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 const themes=await b.evaluate('__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 const monitor={width:1920,height:1080,scale:1,primary:true};
 await b.evaluate(`(async()=>{
  await __AI_USAGE_DEMO__.setWorkArea([${JSON.stringify(monitor)}]);
  await __AI_USAGE_DEMO__.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62},{kind:'extra',label:'Additional window',used_percent:28}]}))});
  await __AI_USAGE_DEMO__.setQuote({status:'ok',cards:[{quote:'Fictional words about patient work.',author:'Example Author'}]});
 })()`);
 for(const shape of ['portrait','strip'])for(const sizeMode of ['fixed','screen'])for(const fitHeight of [false,true])for(const quoteEnabled of [false,true])for(const showExtraWindows of [false,true]) {
  const settings=normalizeSize({shape,sizeMode,fitHeight,quoteEnabled,showExtraWindows,sizePreset:'Medium',fineTune:100,fitFraction:1,fitFineTune:100,featuredProvider:'none'});
  const geometry=fittedGeometry(settings,3,monitor);
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(geometry.width),height:Math.ceil(geometry.height)+100,deviceScaleFactor:1,mobile:false});
  const measurements=[];
  for(const theme of themes) {
   const result=await b.evaluate(`(async()=>{
    const api=__AI_USAGE_DEMO__;
    await api.setSettings(${JSON.stringify({...settings,theme})});
    await document.fonts.ready;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const widget=document.querySelector('#widget').getBoundingClientRect();
    const cards=[...document.querySelectorAll('.provider-card')].map(el=>{const r=el.getBoundingClientRect();return {top:r.top,left:r.left,height:r.height,bottom:r.bottom,overflow:el.scrollHeight-el.clientHeight};});
    return {width:widget.width,height:widget.height,cards,quoteHidden:document.querySelector('#quote').hidden,shape:api.getSettings().shape};
   })()`);
   const label=JSON.stringify({theme,shape,sizeMode,fitHeight,quoteEnabled,showExtraWindows});
   try {
    assert.equal(result.shape,shape,label);
    assert.ok(Math.abs(result.width-geometry.width)<=2 && Math.abs(result.height-geometry.height)<=2,label+' outer geometry '+JSON.stringify(result));
    assert.equal(result.cards.length,3,label);
    assert.ok(Math.max(...result.cards.map(c=>c.height))-Math.min(...result.cards.map(c=>c.height))<=2,label+' equal cards');
    if(shape==='strip') {
     assert.ok(result.quoteHidden,label+' quote');
     assert.ok(result.cards.every(c=>Math.abs(c.top-result.cards[0].top)<=2),label+' horizontal row');
     assert.ok(result.cards[2].left>result.cards[1].left && result.cards[1].left>result.cards[0].left,label+' card order');
    } else assert.ok(result.cards[2].top>result.cards[1].top && result.cards[1].top>result.cards[0].top,label+' vertical column');
    if(measurements.length)assert.ok(Math.abs(result.height-measurements[0].height)<=2 && Math.abs(result.width-measurements[0].width)<=2,label+' theme independence');
   } catch(error) {failures.push(error.message);}
   measurements.push(result);cases++;
  }
 }
 console.log(`${cases} theme/shape/Fit/extra-window cases; ${failures.length} failures`);
 if(failures.length) {console.error(failures.slice(0,20).join('\n'));process.exitCode=1;}
} finally {await b.close();}
