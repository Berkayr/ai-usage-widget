import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { escapeHtml, safeState } from '../app/src/themes/shared/safety.js';
const attack = '\" data-probe=\"injected\"><img src=x onerror=alert(1)>';
assert.equal(safeState(attack), 'SOURCE_UNAVAILABLE');
assert.equal(safeState('ok'), 'OK');
assert.ok(!escapeHtml(attack).includes('<img'));
// The renderers read the responsive meter setting from the host document.
globalThis.document = { documentElement: { dataset: { dotCount: '20' } }, querySelector: () => ({ clientWidth: 340 }) };
globalThis.getComputedStyle = () => ({ fontSize: '16px' });
// Match the registry's */theme.json discovery; a missing renderer must fail.
const themeRoot = new URL('../app/src/themes/', import.meta.url);
const registered = [];
for (const entry of await readdir(themeRoot, {withFileTypes:true})) {
  if (!entry.isDirectory()) continue;
  try {
    const manifest = JSON.parse(await readFile(new URL(`${entry.name}/theme.json`, themeRoot), 'utf8'));
    registered.push({directory:entry.name, id:manifest.id});
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
assert.ok(registered.length > 0, 'Theme registry must not be empty');
let count = 0;
for (const entry of registered) {
  assert.equal(entry.id, entry.directory, 'Manifest ID matches renderer directory');
  const { renderSnapshot } = await import(`../app/src/themes/${entry.directory}/render.js`);
  const root = { innerHTML: '' };
  renderSnapshot(root, {providers:[{
    id:attack, label:attack, state:attack, plan:attack,
    windows:[{id:attack, label:attack, kind:attack, used_percent:50, resets_at:attack}],
    meters:[{label:attack, remaining:1, unit:attack}],
  }]});
  assert.ok(!root.innerHTML.includes('<img'), entry.id);
  assert.ok(!root.innerHTML.includes(' data-probe="injected"'), entry.id);
  assert.match(root.innerHTML, /source_unavailable/);
  assert.match(root.innerHTML, /&lt;img/);
  count++;
}
assert.equal(count, registered.length);
console.log(`${count} theme renderers escape hostile snapshot fields and restrict states`);
