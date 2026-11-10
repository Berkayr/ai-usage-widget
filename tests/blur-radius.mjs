import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const main = readFileSync(new URL('../app/src/main.js', import.meta.url),'utf8');
const expression = main.match(/cornerRadiusCssPx:(\(\(\) => \{[\s\S]*?\}\)\(\))/)[1];
function radius(css,width=340,height=600) {
  const widget = {getBoundingClientRect:()=>({width,height})};
  return runInNewContext(expression,{$:()=>widget,getComputedStyle:()=>({borderTopLeftRadius:css})});
}
test('resize passes the computed theme radius, including percentage and elliptical limits',()=>{
  assert.equal(radius('22px'),22);
  assert.equal(radius('0px'),0);
  assert.equal(radius('999px'),170);
  assert.equal(radius('50%'),170);
  assert.equal(radius('10% 20%'),34);
  assert.equal(radius('30px 22px'),22);
  assert.equal(radius('80% 90%',480,120),60);
  assert.equal(radius('invalid'),0);
  assert.equal(radius('22px',0,0),0);
});
test('legacy resize IPC payload may omit the new radius argument',()=>{
  const rust = readFileSync(new URL('../app/src-tauri/src/lib.rs', import.meta.url),'utf8');
  // Tauri deserializes an omitted Option command argument as None.
  assert.match(rust,/fn resize_widget\([^)]*corner_radius_css_px: Option<f64>\)/);
});
