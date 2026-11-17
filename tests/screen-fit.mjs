import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSize, fittedGeometry, shapes, workAreaMonitor,selectedWorkArea,widgetWidth,widgetHeight,screenCoverage,sizePresets,effectiveSizeMode,maxPortraitWidthFraction} from '../app/src/sizing.js';
import {displays} from '../docs/tools/fixtures/work-areas.mjs';

test('screen fractions fit every work area and preserve aspect and saved fixed settings',()=>{
 let cases=0;
 for(const monitor of displays)for(const fitFraction of [1,.75,.5,1/3])for(const shape of shapes)for(const quoteEnabled of [false,true])for(const count of [1,2,3])for(const position of ['Free','Top right','Bottom right','Top left','Bottom left'])for(const matchPhysicalSize of [false,true])for(const fitFineTune of [50,100,150]) {
  const settings=normalizeSize({sizeMode:'screen',fitFraction,fitFineTune,shape,quoteEnabled,position,matchPhysicalSize,theme:'system',linux:{margin:12}});
  const fit=fittedGeometry(settings,count,monitor,monitor.platform);
  assert.ok(fit.width<=fit.availableWidth+1e-6 && fit.height<=fit.availableHeight+1e-6);
  assert.ok(Math.abs(fit.width/fit.height-widgetWidth(settings,count)/widgetHeight(settings,count))<1e-6);
  if(effectiveSizeMode(settings)==='screen' && fitFraction===1 && fitFineTune===100) assert.ok(Math.abs(fit.width-fit.availableWidth)<1e-6 || Math.abs(fit.height-fit.availableHeight)<1e-6 || Math.abs(fit.scale-fit.maxScale)<1e-6);
  assert.equal(settings.scale,100);cases++;
 }
 assert.equal(cases,30240);
});
test('manual reservations replace auto insets and handle zero and physical Windows units',()=>{
 const monitor={width:1536,height:926,y:34,detectedTop:34,scale:1.25};
 assert.equal(workAreaMonitor(monitor,{reservedTop:0}).height,960);
 assert.equal(workAreaMonitor(monitor,{reservedTop:46,reservedBottom:10}).height,904);
 assert.equal(workAreaMonitor(monitor,{reservedTop:null}).height,926);
 assert.equal(workAreaMonitor({width:1920,height:1032,detectedBottom:48,scale:2},{reservedBottom:0},'windows').height,1080);
});

test('monitor selection matches native fallback and legacy index rules',()=>{
 const monitors=[{name:'primary',primary:true},{name:'secondary'}];
 assert.equal(selectedWorkArea(monitors,{linux:{monitor:1}}).name,'secondary');
 assert.equal(selectedWorkArea(monitors,{linux:{monitor:9},placement:{disconnected:'hide'}}).name,'primary');
 assert.equal(selectedWorkArea(monitors,{placement:{monitor:'gone',disconnected:'monitor',fallbackMonitor:'secondary'}}).name,'secondary');
 assert.equal(selectedWorkArea(monitors,{placement:{monitor:'gone',disconnected:'hide'}}),null);
 assert.equal(selectedWorkArea(monitors,{placement:{monitor:'gone'}}).name,'primary');
});
test('screen mode warnings describe the actual fitted box rather than the saved fixed size',()=>{
 const settings=normalizeSize({sizeMode:'screen',sizePreset:'2X-Large',fineTune:150,fitFraction:.5});
 const fit=fittedGeometry(settings,3,displays[1]);
 assert.ok(fit.fits);assert.ok(fit.requestedHeight>fit.availableHeight);assert.ok(fit.height<fit.availableHeight);
 for(const reservedTop of [0,1000])for(const reservedBottom of [0,1000]) {
  const area=workAreaMonitor({...displays[1],y:34},{reservedTop,reservedBottom});
  assert.ok(area.y>=0 && area.y+area.height<=960);
 }
});

test('coverage and dimensions across all themes, shapes, modes, providers and work areas', async () => {
 const {readdir,readFile}=await import('node:fs/promises');
 const base=new URL('../app/src/themes/',import.meta.url);
 const themes=await Promise.all((await readdir(base,{withFileTypes:true})).filter(e=>e.isDirectory()&&e.name!=='shared').map(async e=>JSON.parse(await readFile(new URL(e.name+'/theme.json',base),'utf8'))));
 const monitors=[{width:800,height:560,scale:1},{width:1366,height:728,scale:1}, ...displays];
 let cases=0;
 for(const theme of themes)for(const shape of shapes)for(const quoteEnabled of [false,true])for(const count of [1,2,3])for(const monitor of monitors)for(const matchPhysicalSize of [false,true]) {
  const choices=[...Object.keys(sizePresets).flatMap(sizePreset=>[50,100,150].map(fineTune=>({sizeMode:'fixed',sizePreset,fineTune}))), ...[1,.75,.5,1/3].flatMap(fitFraction=>[50,100,150].map(fitFineTune=>({sizeMode:'screen',fitFraction,fitFineTune})))];
  for(const choice of choices) {
   const settings=normalizeSize({...choice,theme:theme.id,shape,quoteEnabled,matchPhysicalSize});
   const original=JSON.stringify(settings),fit=fittedGeometry(settings,count,monitor,monitor.platform);
   assert.ok(fit.width*fit.height<=screenCoverage(settings)*fit.availableWidth*fit.availableHeight+1e-6);
   assert.ok(fit.width<=fit.availableWidth+1e-6 && fit.height<=fit.availableHeight+1e-6);
   assert.equal(JSON.stringify(settings),original);cases++;
  }
 }
 console.log(`${cases} coverage cases`);
});

test('screen mode supports portrait and strip and preserves the stored choice',()=>{
 assert.equal(maxPortraitWidthFraction,.3);
 const monitor={width:1536,height:926,scale:1};
 for(const theme of ['system','compact-strip'])for(const shape of shapes)for(const count of [1,2,3]) {
  const settings=normalizeSize({theme,shape,sizeMode:'screen',sizePreset:'Small'});
  const fit=fittedGeometry(settings,count,monitor);
  assert.equal(settings.sizeMode,'screen');
  if(['portrait','strip'].includes(shape)) {
   assert.equal(effectiveSizeMode(settings),'screen');
   assert.ok(fit.width<=fit.availableWidth*(shape==='portrait'?maxPortraitWidthFraction:1)+1e-8);
   if(shape==='strip')assert.ok(Math.abs(fit.width-fit.availableWidth)<1e-6 || Math.abs(fit.scale-fit.maxScale)<1e-6);
  } else {
   assert.equal(effectiveSizeMode(settings),'fixed');
   assert.equal(fit.scale,fittedGeometry({...settings,sizeMode:'fixed'},count,monitor).scale);
  }
 }
});

test('history height caps every mode at the actual reserved work area and margins',async()=>{
 const {historyHeight,monitorFit}=await import('../app/src/sizing.js');
 const settings=normalizeSize({position:'Top right',reservedTop:36,linux:{margin:18},quoteEnabled:true});
 const monitor=workAreaMonitor({width:1229,height:768,y:0,scale:1},settings);
 const fit=monitorFit(settings,3,monitor);
 assert.equal(fit.availableHeight,696);
 for(const extra of [0,160,200,560]) {
   const result=historyHeight(600,extra,fit.availableHeight);
   assert.ok(result.height<=696);assert.equal(result.history,result.height-600);
 }
 assert.deepEqual(historyHeight(900,200,696),{height:696,history:0});
});
