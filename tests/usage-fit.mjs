import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fittedUsageHeight } from '../app/src/usage-fit.js';

test('shared geometry survives a short viewport and stops at the work area', () => {
  const widget = {height:'1158px', getBoundingClientRect:()=>({height:300})};
  globalThis.getComputedStyle = el => ({getPropertyValue:()=>el.height || ''});
  assert.equal(fittedUsageHeight(widget), 1158);
  assert.equal(fittedUsageHeight(widget,1500), 1158);
  assert.equal(fittedUsageHeight(widget,900), 900);
});

test('unmeasured content uses its rendered height', () => {
  globalThis.getComputedStyle = () => ({getPropertyValue:()=>''});
  assert.equal(fittedUsageHeight({dataset:{},getBoundingClientRect:()=>({height:326})},900),326);
});
