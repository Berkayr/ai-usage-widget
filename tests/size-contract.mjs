import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSize,shapes,sizePresets,widgetWidth,widgetHeight} from '../app/src/sizing.js';
test('legacy settings preserve effective scale, including migration boundaries',()=>{
 for(const scale of [50,60,75,90,100,125,150,175,200,250,300]) {
  const value=normalizeSize({scale});assert.ok(Math.abs(value.scale-scale)<1e-8);
  assert.deepEqual(normalizeSize(value),value);
 }
 assert.equal(normalizeSize({scale:90}).sizePreset,'Small');
 assert.equal(normalizeSize({scale:90}).fineTune,90/85*100);
});
test('renamed presets and explicit choices survive theme changes',()=>{
 assert.equal(normalizeSize({sizePreset:'Normal'}).sizePreset,'Medium');
 assert.equal(normalizeSize({sizePreset:'Huge'}).sizePreset,'X-Large');
 for(const [sizePreset,scale] of Object.entries(sizePresets)) {
  const settings=normalizeSize({sizePreset,fineTune:100});assert.equal(settings.scale,scale);
  assert.equal(normalizeSize({...settings,theme:'retro-lcd'}).scale,scale);
 }
 assert.equal(widgetWidth({theme:'compact-strip'},3),340);
 assert.equal(widgetWidth({theme:'system'},6),340);
});

test('five sizes use proportional boxes, including the independent strip orientation',()=>{
 assert.equal(Object.keys(sizePresets).length,5);
 for(const count of [0,1,3,6])for(const sizePreset of Object.keys(sizePresets)) {
  const settings=normalizeSize({sizePreset,fineTune:100});
  const factor=settings.scale/100;
  for(const theme of ['system','brutalist','circular-rings','compact-strip']) {
   const s={...settings,theme};
   assert.equal(widgetHeight(s,count),116+210*Math.max(1,count));
   assert.ok(Math.abs(widgetWidth(s,count)*factor/(widgetHeight(s,count)*factor)-widgetWidth(s,count)/widgetHeight(s,count))<1e-12);
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


test('quote off preserves dimensions; portrait retains the shared provider budget',()=>{
 for(const shape of shapes) for(const theme of ['system','compact-strip','brutalist']) for(const count of [0,1,3,6]) {
  const base={shape,theme};
  assert.equal(widgetWidth({...base,quoteEnabled:false},count),widgetWidth(base,count));
  assert.equal(widgetHeight({...base,quoteEnabled:false},count),widgetHeight(base,count));
  assert.equal(widgetHeight({...base,quoteEnabled:true},count),widgetHeight(base,count)+(shape==='portrait'?320:0));
 }
});

test('monitor fit handles panels, DPI and oversize without changing saved fine-tune',async()=>{
 const {monitorFit}=await import('../app/src/sizing.js');
 const monitor={width:1536,height:926,scale:1};
 for(const shape of shapes)for(const sizePreset of Object.keys(sizePresets)) {
  const value=normalizeSize({shape,sizePreset,fineTune:82,quoteEnabled:true,position:'Top right',linux:{margin:12}});
  const fit=monitorFit(value,3,monitor);
  const actual=Math.min(value.scale,fit.maxScale)/value.scale;
  assert.ok(fit.width*actual<=1512+.001 && fit.height*actual<=902+.001);
  assert.equal(value.fineTune,82);
 }
});


test('frontend scale matrix matches the fixture deserialized by Rust',async()=>{
 const {readFile}=await import('node:fs/promises');
 const fixture=JSON.parse(await readFile(new URL('../docs/tools/fixtures/scale-settings.json',import.meta.url),'utf8'));
 const expected=Object.keys(sizePresets).flatMap(sizePreset=>[50,79,82,83,97,150].map(fineTune=>normalizeSize({sizePreset,fineTune})));
 assert.deepEqual(fixture,expected);
 assert.equal(normalizeSize({sizePreset:'Large',fineTune:82}).scale,98.4);
 assert.equal(normalizeSize({sizePreset:'Small',fineTune:82}).scale,69.7);
 assert.equal(normalizeSize({sizePreset:'2X-Large',fineTune:150}).scale,300);
});

test('strip geometry and one-time legacy loading migration',()=>{
 assert.deepEqual(shapes,['portrait','landscape','square','circle','pill','strip']);
 for(const theme of ['system','compact-strip','brutalist'])for(const count of [0,1,3,6]) {
  assert.equal(widgetWidth({shape:'strip',theme},count),30+310*Math.max(1,count));
  assert.equal(widgetHeight({shape:'strip',theme,quoteEnabled:true},count),326);
 }
 for(const shape of [undefined,'portrait']) {
  const legacy=normalizeSize({theme:'compact-strip',shape},true);
  assert.equal(legacy.shape,'strip');
  assert.equal(normalizeSize({...legacy,shape:'portrait'},true).shape,'portrait');
 }
 for(const shape of shapes.filter(s=>s!=='portrait'))assert.equal(normalizeSize({theme:'compact-strip',shape},true).shape,shape);
 assert.equal(normalizeSize({theme:'system'},true).shape,'portrait');
 const root=normalizeSize({theme:'system',widgets:[{id:'old',overrides:{theme:'compact-strip'}},{id:'keep',overrides:{theme:'compact-strip',shape:'square'}}]},true);
 assert.deepEqual(root.widgets,[{id:'old',overrides:{theme:'compact-strip',shape:'strip'}},{id:'keep',overrides:{theme:'compact-strip',shape:'square'}}]);
 assert.deepEqual(normalizeSize(root,true),root);
 assert.equal(normalizeSize({theme:'compact-strip',shape:'portrait'}).shape,'portrait');
});

test('every theme shares geometry and fit scale for identical settings',async()=>{
 const {readdir}=await import('node:fs/promises');
 const ids=(await readdir(new URL('../app/src/themes/',import.meta.url),{withFileTypes:true})).filter(e=>e.isDirectory()&&e.name!=='shared').map(e=>e.name);
 const {fittedGeometry}=await import('../app/src/sizing.js');
 for(const shape of shapes)for(const count of [0,1,3,6])for(const quoteEnabled of [true,false])for(const sizeMode of ['fixed','screen'])for(const sizePreset of Object.keys(sizePresets)) {
  const base=normalizeSize({shape,quoteEnabled,sizeMode,sizePreset,fineTune:100,fitHeight:true});
  const expected=fittedGeometry(base,count,{width:1920,height:1080,scale:1});
  for(const theme of ids)assert.deepEqual(fittedGeometry({...base,theme},count,{width:1920,height:1080,scale:1}),expected);
 }
});
