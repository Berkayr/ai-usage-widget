import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app/src/main.js', import.meta.url), 'utf8');
const line = start => source.split('\n').find(text => text.startsWith(start));
const shortcut = source.match(/window\.addEventListener\('keydown', async event => \{.*?\}, \{ signal/s)[0];
const declarations = ['async function settingsOpen', 'async function persist'].map(line).filter(Boolean).join('\n');

async function press(open, key = '+') {
  const saves = [], toasts = [];
  let handler, prevented = false;
  const context = vm.createContext({
    settings: {theme: 'crisp', fineTune: 100}, isSample: false, widgetId: 'main', console,
    localStorage: {setItem() {}}, storageKey: value => value, effectiveSizeMode: () => 'fixed',
    applySettings() {}, requestFit() {}, openSettings() {}, showToast: text => toasts.push(text),
    domEvents: {signal: null}, window: {addEventListener: (_, callback) => { handler = callback; }},
    invoke: async (command, args) => command === 'settings_open' ? open : saves.push(structuredClone(args.settings)),
  });
  vm.runInContext(`${declarations}\n${shortcut}: domEvents.signal });`, context);
  await handler({ctrlKey: true, key, preventDefault() { prevented = true; }});
  await vm.runInContext('persist()', context);
  return {saves, toasts, prevented, settings: context.settings};
}

const blocked = await press(true);
assert.equal(blocked.saves.length, 0, 'an unsaved preview must not reach disk');
assert.equal(blocked.settings.fineTune, 100);
assert.equal(blocked.toasts.length, 1);
assert.equal(blocked.prevented, true);

const normal = await press(false);
assert.equal(normal.saves[0].fineTune, 105);
assert.equal(normal.toasts.length, 0);

const other = await press(true, 'a');
assert.equal(other.prevented, false);
assert.equal(other.toasts.length, 0);
console.log('Preview shortcut checks passed');
