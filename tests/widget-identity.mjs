import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../app/src/main.js', import.meta.url), 'utf8');
const identity = source.match(/const widgetId = [^\n]+\nconst storageKey = [^\n]+/)[0];
const persist = source.match(/async function persist\(\) \{[^\n]+/)[0];
const startup = source.slice(source.indexOf('let initialSettingsError = null;'), source.indexOf('const initialOverrides ='));

async function session(search, storage, settings, isSample = false) {
  const calls = [];
  const context = {
    URLSearchParams, location: {search}, settings, isSample,
    localStorage: {setItem: (key, value) => storage.set(key, value)},
    invoke: async (command, args) => {
      calls.push({command, args: structuredClone(args)});
      return command === 'load_settings' ? {theme: 'terminal'} : undefined;
    },
    showToast: message => assert.fail(message),
  };
  await runInNewContext(`${identity}\n${persist}\n(async () => { ${startup}\nawait persist(); })()`, context);
  return calls;
}

test('default main and explicit main preserve the legacy storage keys and settings identity', async () => {
  for (const query of ['', '?widget=main']) {
    const storage = new Map();
    const calls = await session(query, storage, {colorMode: 'auto'});
    assert.equal(storage.get('widgetTheme'), 'terminal');
    assert.equal(JSON.parse(storage.get('widgetLook')).colorMode, 'auto');
    assert.equal(calls[0].command, 'load_settings');
    assert.equal(calls[0].args.widgetId, 'main');
    assert.equal(calls[1].command, 'save_settings');
    assert.equal(calls[1].args.widgetId, 'main');
  }
});

test('secondary widget preferences and settings IPC do not overwrite main or another widget', async () => {
  const storage = new Map([['widgetTheme', 'system'], ['widgetLook', '{}']]);
  for (const id of ['side-2', 'other']) {
    const calls = await session(`?widget=${id}`, storage, {colorMode: id});
    assert.equal(calls[0].args.widgetId, id);
    assert.equal(calls[1].args.widgetId, id);
    assert.equal(storage.get(`widgetTheme:${id}`), 'terminal');
    assert.equal(JSON.parse(storage.get(`widgetLook:${id}`)).colorMode, id);
  }
  assert.equal(storage.get('widgetTheme'), 'system');
  assert.equal(storage.get('widgetLook'), '{}');
  assert.equal(JSON.parse(storage.get('widgetLook:side-2')).colorMode, 'side-2');
});

test('sample mode does not read or persist widget settings', async () => {
  const storage = new Map();
  assert.deepEqual(await session('?sample=a1&widget=side-2', storage, {}, true), []);
  assert.equal(storage.size, 0);
});
