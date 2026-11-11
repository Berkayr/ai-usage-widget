import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {effectiveWidget, splitWidget, widgetChangeCount, newWidgetId, overrideKeys, overrideCategories, canOverride} from '../app/src/settings-widgets.js';
const fixture = () => ({theme:'system', position:'Top right', reservedTop:null,
  taskbar:{enabled:false}, providerOrder:['a'], linux:{layer:'bottom', margin:12, monitor:null},
  placement:{monitor:'Display', xRatio:1, yRatio:0},
  widgets:[{id:'side',name:'Side',placement:{monitor:'Display', xRatio:1,yRatio:0,disconnected:'hide'},overrides:{}}]});
test('effective settings inherit live Main values and split preserves shared boundaries', () => {
  const root=fixture(), edited=effectiveWidget(root,'side');
  edited.theme='terminal';edited.position='Bottom right';edited.reservedTop=20;
  edited.linux.margin=24;edited.linux.monitor='Shared';edited.taskbar.enabled=true;
  edited.placement.yRatio=1;
  const result=splitWidget(root,'side',edited);
  assert.equal(root.widgets[0].overrides.theme,undefined);
  assert.equal(result.theme,'system');assert.equal(result.position,'Top right');assert.equal(result.reservedTop,null);
  assert.equal(result.taskbar.enabled,true);assert.equal(result.linux.monitor,'Shared');
  assert.deepEqual(result.widgets[0].overrides,{theme:'terminal',position:'Bottom right',reservedTop:20,linux:{margin:24}});
  assert.equal(effectiveWidget(result,'side').placement.yRatio,1);
  const reset=effectiveWidget(result,'side');reset.theme=result.theme;reset.linux.margin=result.linux.margin;
  const cleared=splitWidget(result,'side',reset);
  assert.equal(cleared.widgets[0].overrides.theme,undefined);assert.equal(cleared.widgets[0].overrides.linux,undefined);
  assert.throws(()=>effectiveWidget(root,'missing'));
});
test('unrelated edits preserve explicit overrides, including equal values, and inheritance',()=>{
  const root=fixture();root.widgets[0].overrides={theme:'system',linux:{margin:12}};
  const edit=effectiveWidget(root,'side');edit.position='Bottom left';
  const result=splitWidget(root,'side',edit);
  assert.equal(result.widgets[0].overrides.theme,'system');
  assert.equal(result.widgets[0].overrides.linux.margin,12);
  assert.equal(result.widgets[0].overrides.reservedTop,undefined);
  result.reservedTop=40;assert.equal(effectiveWidget(result,'side').reservedTop,40);
});
test('unsaved count spans root, additions/removals and multiple widget fields',()=>{
  const saved=fixture(), root=structuredClone(saved);
  root.widgets[0].name='Renamed';root.widgets[0].overrides.theme='terminal';
  root.widgets.push({...structuredClone(root.widgets[0]),id:'second'});root.theme='pebble';
  assert.equal(widgetChangeCount(root,saved),4);
  assert.equal(widgetChangeCount({...saved,widgets:[]},saved),1);
  assert.equal(widgetChangeCount(saved,structuredClone(saved)),0);
});
test('widget IDs are valid, bounded, unique and never main',()=>{
  const widgets=[{id:'main-1'}];
  assert.equal(newWidgetId(widgets,'Main'),'main-2');
  for(const name of ['é', 'DISPLAY / 2', 'a'.repeat(99), '']) {
    const id=newWidgetId([],name);assert.match(id,/^[a-z0-9-]{1,24}$/);
    assert.notEqual(newWidgetId([{id}],name),id);
  }
});
test('frontend override contract matches the native whitelist',async()=>{
  const source=await readFile(new URL('../app/src-tauri/src/widgets.rs',import.meta.url),'utf8');
  const body=source.match(/fn overridable\(key: &str\) -> bool \{([\s\S]*?)\n\}/)[1];
  assert.deepEqual([...overrideKeys].sort(),[...body.matchAll(/"([^"]+)"/g)].map(m=>m[1]).sort());
  assert.ok(canOverride('placement.monitor'));assert.ok(canOverride('linux.margin'));
  assert.ok(!canOverride('taskbar.enabled'));assert.ok(!canOverride('linux.monitor'));
});
test('every widget override belongs to exactly one reset category',()=>{
  const assigned=Object.values(overrideCategories).flat();
  assert.equal(new Set(assigned).size,assigned.length,'Reset categories must not overlap');
  assert.deepEqual([...assigned].sort(),[...overrideKeys].sort());
});
