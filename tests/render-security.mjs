import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { escapeHtml, safeState } from '../app/src/themes/shared/safety.js';
const attack = '\" data-probe=\"injected\"><img src=x onerror=alert(1)>';
assert.equal(safeState(attack), 'SOURCE_UNAVAILABLE');
assert.equal(safeState('ok'), 'OK');
assert.ok(!escapeHtml(attack).includes('<img'));
let count = 0;
for (const entry of await readdir(new URL('../app/src/themes/', import.meta.url), {withFileTypes:true})) {
  if (!entry.isDirectory() || entry.name === 'shared') continue;
  const { renderSnapshot } = await import(`../app/src/themes/${entry.name}/render.js`);
  const root = { innerHTML: '' };
  renderSnapshot(root, {providers:[{
    id:attack, label:attack, state:attack, plan:attack,
    windows:[{id:attack, label:attack, kind:attack, used_percent:50, resets_at:attack}],
    meters:[{label:attack, remaining:1, unit:attack}],
  }]});
  assert.ok(!root.innerHTML.includes('<img'), entry.name);
  assert.ok(!root.innerHTML.includes(' data-probe="injected"'), entry.name);
  assert.match(root.innerHTML, /source_unavailable/);
  assert.match(root.innerHTML, /&lt;img/);
  count++;
}
assert.equal(count, 8);
console.log(`${count} theme renderers escape hostile snapshot fields and restrict states`);
