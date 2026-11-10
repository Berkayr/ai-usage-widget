import test from 'node:test';
import {historyDefaults} from '../app/src/history.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {equalSettings,differingKeys} from '../app/src/settings-compare.js';
test('comparison ignores order, null, absent keys and empty objects, preserving arrays',()=>{
 assert.ok(equalSettings({theme:'system',providerColors:{}},{providerPreview:['claude'],theme:'system',accent:null}));
 assert.ok(equalSettings({placement:{xRatio:.5}},{placement:{x_ratio:.5}}));
 assert.ok(!equalSettings({providerOrder:['a','b']},{providerOrder:['b','a']}));
 assert.deepEqual(differingKeys({theme:'system',fineTune:82},{theme:'terminal',fineTune:82}),['theme']);
});
test('every settings binding and default key is covered by full Rust fixture',async()=>{
 const source=await readFile(new URL('../app/src/settings-window.js',import.meta.url),'utf8');
 const fixture=Object.assign({...historyDefaults}, JSON.parse(await readFile(new URL('../docs/tools/fixtures/full-settings.json',import.meta.url),'utf8')));
 for(const name of ['defaults','bindings']) {
  const body=source.match(new RegExp('export const '+name+' = ([\\s\\S]*?);'))[1];
  const obj=Function('historyDefaults','return ('+body+')')(historyDefaults);
  const paths=value=>Object.entries(value).flatMap(([key,child])=>child&&typeof child==='object'&&!Array.isArray(child)?[key,...paths(child).map(path=>key+'.'+path)]:[key]);
  for(const path of name==='bindings'?Object.values(obj):paths(obj)) {
   let value=fixture;for(const key of path.split('.')) {assert.ok(Object.hasOwn(value,key),`${name}: ${path}`);value=value[key];}
  }
 }
 // Dynamic controls write these keys outside the binding table.
 for(const key of ['providerColors','widgetProviders','providerOrder','hiddenProviders','featuredProvider','featuredPosition','reactorMotion','sizePreset','shape','palette']) assert.ok(Object.hasOwn(fixture,key),key);
});
