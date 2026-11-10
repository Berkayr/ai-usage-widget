import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fittedUsageHeight } from '../app/src/usage-fit.js';

test('content fitting grows beyond the current viewport and stops at the work area', () => {
  const widget = {dataset:{usageHeight:'1158'}, getBoundingClientRect:()=>({height:300})};
  assert.equal(fittedUsageHeight(widget), 1158);
  assert.equal(fittedUsageHeight(widget,1500), 1158);
  assert.equal(fittedUsageHeight(widget,900), 900);
});

test('unmeasured content uses its rendered height', () => {
  assert.equal(fittedUsageHeight({dataset:{},getBoundingClientRect:()=>({height:326})},900),326);
});
