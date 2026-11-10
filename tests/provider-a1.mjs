import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateProviderSvg, providerLogo } from '../app/src/icons/provider-logos.js';
import { providerEmptyState, hasMeterData } from '../app/src/themes/shared/provider-state.js';
import { hiddenStates } from '../app/src/themes/dot-matrix/render.js';
import { createRenderer } from '../app/src/themes/shared/render.js';

test('all shipped logos pass validation; active SVG is rejected', () => {
  const dir = new URL('../app/src/icons/providers/', import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.svg'))) {
    const svg = readFileSync(new URL(name, dir), 'utf8');
    assert.equal(validateProviderSvg(svg), svg);
  }
  for (const svg of ['<svg><script>alert(1)</script></svg>', '<svg ONLOAD = "evil()"/>', '<svg><use xlink:href="#x"/></svg>', '<svg><image HREF="evil"/></svg>', '<img src=x>', '<svg><foreignObject><iframe/></foreignObject></svg>', '<svg style="fill:url(https://example.invalid/icon)"/>']) {
    assert.throws(() => validateProviderSvg(svg), /Unsafe/);
  }
  assert.equal(providerLogo('missing'), '');
  assert.equal(providerLogo('__proto__'), '');
});
test('selected providers stay visible and get documented setup or empty balance explanations', () => {
  assert.equal(hiddenStates.has('NO_SUBSCRIPTION'), false);
  assert.equal(hiddenStates.has('DISABLED'), true);
  assert.equal(hiddenStates.has('NOT_INSTALLED'), true);
  assert.match(providerEmptyState({id:'copilot',state:'NO_SUBSCRIPTION'},false).detail,/gh auth login/);
  assert.match(providerEmptyState({id:'deepseek',state:'AUTH_REQUIRED'},false).detail,/DEEPSEEK_API_KEY/);
  assert.deepEqual(providerEmptyState({id:'openrouter',state:'OK',detail:'Endpoint empty'},false),{title:'No balance data',detail:'Endpoint empty'});
  assert.equal(providerEmptyState({id:'openrouter',state:'OK'},true), null);
  assert.equal(hasMeterData({remaining:0}),true);
  assert.equal(hasMeterData({used:null,remaining:null}),false);
});
test('known zero and limit-only meters remain visible', () => {
  const root={innerHTML:''};
  createRenderer('system')(root,{providers:[{id:'openrouter',state:'OK',meters:[{label:'Account credits',unit:'USD',remaining:0},{label:'Key allowance',unit:'USD',limit:15}]}]});
  assert.match(root.innerHTML,/\$0\.00/);
  assert.match(root.innerHTML,/\$15\.00 limit/);
  assert.doesNotMatch(root.innerHTML,/No balance data/);
});
test('all theme renderers escape empty reasons, retain badges, and omit disabled providers', () => {
  globalThis.document={documentElement:{dataset:{}},querySelector:()=>({clientWidth:340})};
  globalThis.getComputedStyle=()=>({fontSize:'16px'});
  for (const type of ['system','dot-matrix','circular-rings','reactor','compact-strip','terminal','retro-lcd','brutalist','minimal-pace','frosted-glass']) {
    const root={innerHTML:''};
    createRenderer(type)(root,{providers:[{id:'copilot',state:'NO_SUBSCRIPTION'}, {id:'deepseek',state:'AUTH_REQUIRED'}, {id:'openrouter',state:'OK',meters:[{remaining:null}],message:'<script>bad</script>'},{id:'disabled',state:'DISABLED'}]});
    assert.equal((root.innerHTML.match(/<article/g)||[]).length,3);
    assert.match(root.innerHTML,/No subscription found/);
    assert.match(root.innerHTML,/AUTH REQUIRED/);
    assert.match(root.innerHTML,/No balance data/);
    assert.match(root.innerHTML,/&lt;script&gt;/);
    assert.doesNotMatch(root.innerHTML,/<script>/);
  }
});
