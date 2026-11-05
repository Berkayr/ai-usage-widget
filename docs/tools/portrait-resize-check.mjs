// Synthetic native-height emulation: content must grow out of a previously fitted viewport.
import assert from 'node:assert/strict';
import {browser} from './browser-harness.mjs';
const b=await browser();
const snapshot=count=>({providers:['claude','codex','gemini'].slice(0,count).map(id=>({id,state:'OK',plan:'DEMO',windows:[{kind:'session',used_percent:54},{kind:'weekly',used_percent:32}]}))});
try{
 await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
 await b.evaluate(`window.__AI_USAGE_DEMO__.setWorkArea([{width:1536,height:960,scale:1.25,primary:true}])`);
 const height=()=>b.evaluate(`document.querySelector('#widget').getBoundingClientRect().height`);
 const viewport=height=>b.cdp('Emulation.setDeviceMetricsOverride',{width:340,height:Math.ceil(height),deviceScaleFactor:1,mobile:false});
 for(const quoteEnabled of [false,true]){
  await viewport(960);
  await b.evaluate(`window.__AI_USAGE_DEMO__.setSettings({theme:'system',shape:'portrait',sizeMode:'fixed',sizePreset:'Medium',fineTune:100,quoteEnabled:${quoteEnabled},fitHeight:true})`);
  await b.evaluate(`window.__AI_USAGE_DEMO__.setSnapshot(${JSON.stringify(snapshot(1))})`);
  const one=await height();await viewport(one);
  await b.evaluate(`window.__AI_USAGE_DEMO__.setSnapshot(${JSON.stringify(snapshot(3))})`);
  const three=await height();assert.ok(three>one+40,'three cards must grow out of the old one-card viewport');
  await viewport(three);
  await b.evaluate(`window.__AI_USAGE_DEMO__.setSnapshot(${JSON.stringify(snapshot(1))})`);
  assert.ok(Math.abs(await height()-one)<2,'one card must return to its original content height');
 }
 await viewport(960);
 await b.evaluate(`window.__AI_USAGE_DEMO__.setSettings({sizeMode:'screen',fitFraction:1,fitFineTune:100,quoteEnabled:false})`);
 const tier=await b.evaluate(`(()=>{const root=document.querySelector('#providers');return {growth:Number(root.style.getPropertyValue('--portrait-growth')),number:parseFloat(getComputedStyle(root.querySelector('.window-top b')).fontSize),unit:parseFloat(getComputedStyle(document.documentElement).fontSize)}})()`);
 assert.ok(tier.growth>0&&tier.growth<=1,'Fit must spend spare height on the existing type tiers');
 assert.ok(tier.number>1.25*tier.unit&&tier.number<=2.25*tier.unit+.1,'numbers must grow within the existing display tier');
 console.log('PASS: portrait grows/shrinks after viewport fitting, quote on/off; Fit promotes existing type tiers');
}finally{await b.close();}
