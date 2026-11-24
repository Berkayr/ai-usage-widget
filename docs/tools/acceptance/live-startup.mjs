import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {browser} from '../browser-harness.mjs';

const fixture = JSON.parse(await readFile(new URL('../../../app/src/sample-snapshot.json', import.meta.url), 'utf8'));
const fakeSnapshot = {generated_at:'2026-11-06T10:00:00Z',providers:[{id:'claude',label:'Real account',plan:'Real plan',state:'OK',windows:[{id:'session',label:'Session',used_percent:87,resets_in_minutes:30,kind:'session'}],meters:[]}]};
const scenarios = [
  ['settings', 'settings unavailable'],
  ['snapshot', 'snapshot unavailable'],
  ['after-snapshot', 'event subscription unavailable']
];

function setupSource(mode, snapshot) {
  return `(() => {
    window.__browserErrors = [];
    addEventListener('error', event => window.__browserErrors.push(event.message));
    addEventListener('unhandledrejection', event => window.__browserErrors.push(String(event.reason)));
    const mode = ${JSON.stringify(mode)};
    const snapshot = ${JSON.stringify(snapshot)};
    window.__TAURI_INTERNALS__ = {
      metadata: {currentWindow:{label:'main'},currentWebview:{label:'main'}},
      transformCallback(callback) { window.__browserCallbacks ??= {}; const id = Object.keys(window.__browserCallbacks).length + 1; window.__browserCallbacks[id] = callback; return id; },
      unregisterCallback(id) { delete window.__browserCallbacks[id]; },
      invoke(command) {
        if (mode === 'settings' && command === 'load_settings') return Promise.reject(new Error('settings unavailable'));
        if (command === 'load_settings') return Promise.resolve({});
        if (command === 'get_monitor_scale') return Promise.resolve(1);
        if (command === 'get_desktop_info') return Promise.resolve({platform:'linux'});
        if (command === 'get_placement_monitors') return Promise.resolve({monitors:[]});
        if (command === 'get_provider_config') return Promise.resolve({initialized:true,providers:{}});
        if (command === 'get_snapshot') return mode === 'snapshot' ? Promise.reject(new Error('snapshot unavailable')) : Promise.resolve({snapshot});
        if (command === 'plugin:event|listen') return mode === 'after-snapshot' && arguments[1]?.event === 'open-settings' ? Promise.reject(new Error('event subscription unavailable')) : Promise.resolve(1);
        if (command === 'plugin:event|unlisten') return Promise.resolve();
        return Promise.resolve(null);
      }
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}};
  })()`;
}

const b = await browser();
try {
  for (const [mode, detail] of scenarios) {
    await b.cdp('Page.addScriptToEvaluateOnNewDocument', {source:setupSource(mode, fakeSnapshot)});
    await b.navigate('/', "document.querySelector('#runtime-error')?.textContent.startsWith('Unable to load quota data:')");
    const state = await b.evaluate(`({hidden:document.querySelector('#runtime-error').hidden,message:document.querySelector('#runtime-error').textContent,providers:document.querySelector('#providers').innerText,providerCount:document.querySelectorAll('#providers .provider-card').length,errors:window.__browserErrors,body:document.body.innerText})`);
    assert.equal(state.hidden, false, `${mode}: persistent runtime error should be visible`);
    assert.equal(state.message, `Unable to load quota data: Error: ${detail}`, `${mode}: error message should identify the failure`);
    assert.deepEqual(state.errors, [], `${mode}: frontend should have no JavaScript errors`);
    if (mode === 'after-snapshot') {
      assert.equal(state.providerCount, 1);
      assert.match(state.providers, /Claude/);
      assert.match(state.providers, /Real plan/);
      assert.match(state.providers, /87%/);
    } else {
      assert.equal(state.providerCount, 0, `${mode}: no fictional providers should be rendered`);
    }
    assert.doesNotMatch(state.body, new RegExp(fixture.providers[0].label));
    assert.doesNotMatch(state.body, new RegExp(`\\b${fixture.providers[0].plan}\\b`));
    for (const provider of fixture.providers) {
      for (const window of provider.windows || []) if (Number.isFinite(window.used_percent))
        assert.doesNotMatch(state.body, new RegExp(`\\b${window.used_percent}%`), `${mode}: sample percentage leaked`);
      for (const meter of provider.meters || []) if (Number.isFinite(meter.remaining))
        assert.doesNotMatch(state.body, new RegExp(`\\$${meter.remaining.toFixed(2)}`), `${mode}: sample balance leaked`);
    }
    await new Promise(resolve => setTimeout(resolve, 4100));
    assert.equal(await b.evaluate("document.querySelector('#runtime-error').hidden"), false, `${mode}: error should remain after the toast expires`);
    console.log(`PASS: live ${mode} failure renders persistent error without fictional data`);
  }

  await b.cdp('Page.addScriptToEvaluateOnNewDocument', {source:`delete window.__TAURI_INTERNALS__; delete window.__TAURI_EVENT_PLUGIN_INTERNALS__;`});
  await b.navigate('/?sample', "document.querySelectorAll('.provider-card').length > 0");
  const sampleState = await b.evaluate(`({body:document.body.innerText, providerCount:document.querySelectorAll('.provider-card').length, plans:[...document.querySelectorAll('.plan')].map(el=>el.textContent),percentages:[...document.querySelectorAll('.quota-window b')].map(el=>el.textContent),balances:[...document.querySelectorAll('.balance-row b')].map(el=>el.textContent)})`);
  assert(sampleState.providerCount > 0, 'sample mode should render fictional providers');
  for (const provider of fixture.providers) {
    // The fitter may hide a plan badge on compact cards, so check the rendered badge text, not visible text.
    if (provider.plan) assert(sampleState.plans.includes(provider.plan), `sample mode should render ${provider.plan}`);
    for (const window of provider.windows || []) if (!window.hidden_by_default && Number.isFinite(window.used_percent))
      assert(sampleState.percentages.includes(`${Math.round(window.used_percent)}%`), `sample mode should render ${window.used_percent}%`);
    for (const meter of provider.meters || []) if (Number.isFinite(meter.remaining))
      assert(sampleState.balances.includes(`$${meter.remaining.toFixed(2)}`), `sample mode should render $${meter.remaining.toFixed(2)}`);
  }
  console.log('PASS: explicit sample mode still renders fixture providers, plans, percentages and balances');
} finally {
  await b.close();
}
