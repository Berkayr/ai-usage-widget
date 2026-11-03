import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSize,sizePresets,widgetWidth,widgetHeight} from '../app/src/sizing.js';
test('legacy settings preserve effective scale, including migration boundaries',()=>{
 for(const scale of [50,60,75,90,100,125,150,175,200,250,300]) {
  const value=normalizeSize({scale});assert.ok(Math.abs(value.scale-scale)<1e-8);
  assert.deepEqual(normalizeSize(value),value);
 }
 assert.equal(normalizeSize({scale:90}).sizePreset,'Medium');
 assert.equal(normalizeSize({scale:90}).fineTune,90);
});
test('renamed presets and explicit choices survive theme changes',()=>{
 assert.equal(normalizeSize({sizePreset:'Normal'}).sizePreset,'Medium');
 assert.equal(normalizeSize({sizePreset:'Huge'}).sizePreset,'X-Large');
 for(const [sizePreset,scale] of Object.entries(sizePresets)) {
  const settings=normalizeSize({sizePreset,fineTune:100});assert.equal(settings.scale,scale);
  assert.equal(normalizeSize({...settings,theme:'retro-lcd'}).scale,scale);
 }
 assert.equal(widgetWidth({theme:'compact-strip'},3),960);
 assert.equal(widgetWidth({theme:'system'},6),340);
});

test('five sizes use proportional boxes, including the independent strip orientation',()=>{
 assert.equal(Object.keys(sizePresets).length,5);
 for(const count of [0,1,3,6])for(const sizePreset of Object.keys(sizePresets)) {
  const settings=normalizeSize({sizePreset,fineTune:100});
  const factor=settings.scale/100;
  for(const theme of ['system','brutalist','circular-rings','compact-strip']) {
   const s={...settings,theme};
   assert.equal(widgetHeight(s,count),theme==='compact-strip'?326:116+210*Math.max(1,count));
   assert.equal(widgetWidth(s,count)*factor/(widgetHeight(s,count)*factor),widgetWidth(s,count)/widgetHeight(s,count));
  }
 }
});

test('shape migration and fixed boxes are independent of theme and provider count',()=>{
 assert.equal(normalizeSize({}).shape,'portrait');
 for(const shape of ['unknown'])assert.equal(normalizeSize({shape}).shape,'portrait');
 for(const theme of ['system','brutalist','circular-rings','compact-strip'])for(const count of [0,1,3,6])for(const shape of ['landscape','square']) {
  const settings=normalizeSize({theme,shape});
  assert.equal(widgetWidth(settings,count),shape==='landscape'?680:340);
  assert.equal(widgetHeight(settings,count),340);
 }
});

test('round dimensions and per-widget selection',async()=>{
 const {widgetProviders}=await import('../app/src/sizing.js');
 for(const count of [0,1,3,6]) for(const theme of ['system','compact-strip','brutalist']) {
  assert.equal(widgetWidth({shape:'circle',theme},count),340);assert.equal(widgetHeight({shape:'circle',theme},count),340);
  assert.equal(widgetWidth({shape:'pill',theme},count),480);assert.equal(widgetHeight({shape:'pill',theme},count),120);
 }
 const providers=Array.from({length:6},(_,id)=>({id:String(id)}));
 assert.deepEqual(widgetProviders(providers).map(p=>p.id),['0','1','2']);
 assert.deepEqual(widgetProviders(providers,['4','5']).map(p=>p.id),['4','5']);
 assert.deepEqual(widgetProviders(providers,[]),[]);
});


test('quote off preserves dimensions; portrait redistributes the provider budget',()=>{
 for(const shape of ['portrait','landscape','square','circle','pill']) for(const theme of ['system','compact-strip','brutalist']) for(const count of [0,1,3,6]) {
  const base={shape,theme};
  assert.equal(widgetWidth({...base,quoteEnabled:false},count),widgetWidth(base,count));
  assert.equal(widgetHeight({...base,quoteEnabled:false},count),widgetHeight(base,count));
  assert.equal(widgetHeight({...base,quoteEnabled:true},count),widgetHeight(base,count)+(shape==='portrait'?320-40*(theme==='compact-strip'?1:Math.max(1,count)):0));
 }
});

test('monitor fit handles panels, DPI and oversize without changing saved fine-tune',async()=>{
 const {monitorFit}=await import('../app/src/sizing.js');
 const monitor={width:1536,height:926,scale:1};
 for(const shape of ['portrait','landscape','square','circle','pill'])for(const sizePreset of Object.keys(sizePresets)) {
  const value=normalizeSize({shape,sizePreset,fineTune:82,quoteEnabled:true,position:'Top right',linux:{margin:12}});
  const fit=monitorFit(value,3,monitor);
  const actual=Math.min(value.scale,fit.maxScale)/value.scale;
  assert.ok(fit.width*actual<=1512+.001 && fit.height*actual<=902+.001);
  assert.equal(value.fineTune,82);
 }
});
