import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitKey, applyLimits, normalizeLimitVisibility } from '../app/src/limits.js';
import { orderedProviders, featuredProvider } from '../app/src/provider-layout.js';
import { widgetProviders } from '../app/src/sizing.js';
import { providerIndex } from '../app/src/themes/shared/identity.js';
import { aggregateHistory } from '../app/src/history.js';
import { createRenderer } from '../app/src/themes/shared/render.js';
import { renderRound } from '../app/src/themes/shared/round.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const makeSnapshot = () => deepFreeze([
  {
    id: 'claude',
    label: 'Claude Code',
    plan: 'Synthetic Pro',
    state: 'OK',
    stale: false,
    captured_at: '2026-11-01T11:58:00Z',
    windows: [
      { id: 'five_hour', label: '5 hour', kind: 'session', used_percent: 30 },
      { id: 'seven_day', label: '7 day', kind: 'weekly', used_percent: 55 },
      { id: 'claude-extra', label: 'Extra preview', kind: 'other', used_percent: 18, hidden_by_default: true },
      { id: 'limit-weekly_scoped-fable', label: 'Fable · weekly', kind: 'weekly', used_percent: 42, hidden_by_default: true, pool: { id: 'fable', label: 'Fable' } },
    ],
    meters: [{ id: 'm1', label: 'Balance', unit: 'USD', remaining: 10 }],
    history: {
      scope: 'local',
      daily: [{ date: '2026-11-01', tokens: 250000 }],
    },
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    plan: 'Synthetic Advanced',
    state: 'STALE',
    stale: true,
    captured_at: '2026-11-01T11:45:00Z',
    windows: [
      { id: 'gemini-5h', label: 'Gemini Models · 5h', kind: 'session', used_percent: 12 },
      { id: 'gemini-weekly', label: 'Gemini Models · weekly', kind: 'weekly', used_percent: 28 },
      { id: '3p-5h', label: 'Claude and GPT models · 5h', kind: 'session', used_percent: 19, hidden_by_default: true, pool: { id: 'claude-and-gpt-models', label: 'Claude and GPT models' } },
      { id: '3p-weekly', label: 'Claude and GPT models · weekly', kind: 'weekly', used_percent: 64, hidden_by_default: true, pool: { id: 'claude-and-gpt-models', label: 'Claude and GPT models' } },
      { id: 'null-3p', label: 'Claude and GPT models · reserve', kind: 'other', used_percent: null, hidden_by_default: true, pool: { id: 'claude-and-gpt-models', label: 'Claude and GPT models' } },
    ],
    meters: [],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek API',
    plan: null,
    state: 'AUTH_REQUIRED',
    stale: false,
    windows: [],
    meters: [],
  },
]);

test('limitKey normalizes missing pool to main and uses pool id', () => {
  assert.equal(limitKey('gemini', { id: 'gemini-5h' }), 'gemini/main');
  assert.equal(limitKey('gemini', {}), 'gemini/main');
  assert.equal(limitKey('gemini', null), 'gemini/main');
  assert.equal(limitKey('gemini', { pool: { id: 'claude-and-gpt-models', label: 'Claude and GPT models' } }), 'gemini/claude-and-gpt-models');
  assert.equal(limitKey('claude', { pool: { id: 'fable', label: 'Fable' } }), 'claude/fable');
});

test('automatic defaults never mutate input and keep hidden pools/extra windows hidden', () => {
  const input = makeSnapshot();
  const result = applyLimits(input, {});
  assert.deepEqual(result.map(p => p.id), ['claude', 'gemini', 'deepseek']);
  assert.deepEqual(result[0].windows.map(w => w.id), ['five_hour', 'seven_day']);
  assert.deepEqual(result[1].windows.map(w => w.id), ['gemini-5h', 'gemini-weekly']);
  assert.deepEqual(result[2].windows, []);
});

test('unknown pool appears automatically when visible by default or when showExtraWindows is on', () => {
  const providers = deepFreeze([{
    id: 'gemini',
    label: 'Google Gemini',
    state: 'OK',
    windows: [
      { id: 'gm-5h', label: '5h', kind: 'session', used_percent: 10 },
      { id: 'quantum-hidden', label: 'Quantum · weekly', kind: 'weekly', used_percent: 45, hidden_by_default: true, pool: { id: 'quantum', label: 'Quantum' } },
      { id: 'open-pool', label: 'Open · weekly', kind: 'weekly', used_percent: 22, pool: { id: 'open-tier', label: 'Open tier' } },
    ],
  }]);
  const autoOff = applyLimits(providers, { showExtraWindows: false });
  assert.deepEqual(autoOff[0].windows.map(w => w.id), ['gm-5h', 'open-pool']);

  const everythingOn = applyLimits(providers, { showExtraWindows: true });
  assert.deepEqual(everythingOn[0].windows.map(w => w.id), ['gm-5h', 'quantum-hidden', 'open-pool']);
  assert.equal(everythingOn[0].windows[1].hidden_by_default, undefined);

  const explicitHideWins = applyLimits(providers, { showExtraWindows: true, limitVisibility: { 'gemini/quantum': false } });
  assert.deepEqual(explicitHideWins[0].windows.map(w => w.id), ['gm-5h', 'open-pool']);
});

test('only-Antigravity-everything shows chosen Gemini pools with hidden_by_default cleared while keeping Claude extras hidden', () => {
  const input = makeSnapshot();
  const result = applyLimits(input, {
    showExtraWindows: false,
    limitVisibility: { 'gemini/claude-and-gpt-models': true },
  });
  assert.deepEqual(result[0].windows.map(w => w.id), ['five_hour', 'seven_day']);
  assert.deepEqual(result[1].windows.map(w => w.id), ['gemini-5h', 'gemini-weekly', '3p-5h', '3p-weekly']);
  assert.ok(result[1].windows.every(w => !w.hidden_by_default));
});

test('everything-on reveals main extra windows and non-main pools while keeping null used_percent hidden', () => {
  const input = deepFreeze([
    ...makeSnapshot().slice(0, 2),
    {
      id: 'codex',
      label: 'Codex',
      state: 'OK',
      windows: [
        { id: 'primary', label: '5 hour', kind: 'session', used_percent: 14 },
        { id: 'credits', label: 'Credits', kind: 'other', used_percent: null, hidden_by_default: true },
      ],
    },
  ]);
  const result = applyLimits(input, { showExtraWindows: true });
  assert.deepEqual(result[0].windows.map(w => w.id), ['five_hour', 'seven_day', 'claude-extra', 'limit-weekly_scoped-fable']);
  assert.deepEqual(result[1].windows.map(w => w.id), ['gemini-5h', 'gemini-weekly', '3p-5h', '3p-weekly']);
  assert.deepEqual(result[2].windows.map(w => w.id), ['primary']);
});

test('main hidden keeps only non-main pool or omits base card only when separate cards exist, and never drops error providers', () => {
  const input = makeSnapshot();
  const combined = applyLimits(input, {
    limitVisibility: { 'gemini/main': false, 'gemini/claude-and-gpt-models': true },
    separatePools: false,
  });
  assert.deepEqual(combined.map(p => p.id), ['claude', 'gemini', 'deepseek']);
  assert.deepEqual(combined[1].windows.map(w => w.id), ['3p-5h', '3p-weekly']);

  const separated = applyLimits(input, {
    limitVisibility: { 'gemini/main': false, 'gemini/claude-and-gpt-models': true, 'deepseek/main': false },
    separatePools: true,
  });
  assert.deepEqual(separated.map(p => p.id), ['claude', 'gemini~claude-and-gpt-models', 'deepseek']);
  const derived = separated[1];
  assert.equal(derived.baseId, 'gemini');
  assert.equal(derived.label, 'Claude and GPT models');
  assert.equal(derived.state, 'STALE');
  assert.equal(derived.stale, true);
  assert.equal(derived.plan, 'Synthetic Advanced');
  assert.equal(derived.captured_at, '2026-11-01T11:45:00Z');
  assert.deepEqual(derived.windows.map(w => w.label), ['5h', 'weekly']);
  assert.deepEqual(derived.meters, []);
  assert.equal(derived.history, undefined);

  const mainHiddenWithoutSeparate = applyLimits(input, {
    limitVisibility: { 'gemini/main': false },
    separatePools: true,
  });
  assert.deepEqual(mainHiddenWithoutSeparate.map(p => p.id), ['claude', 'gemini', 'deepseek']);
  assert.deepEqual(mainHiddenWithoutSeparate[1].windows, []);
});

test('separatePools places derived cards right after base and integrates with order, featured, round selection, and identity', () => {
  const input = makeSnapshot();
  const settings = {
    showExtraWindows: true,
    separatePools: true,
    providerOrder: ['gemini', 'claude', 'deepseek'],
  };
  const limited = applyLimits(input, settings);
  assert.deepEqual(limited.map(p => p.id), ['claude', 'claude~fable', 'gemini', 'gemini~claude-and-gpt-models', 'deepseek']);
  assert.equal(limited[1].history, undefined);
  assert.deepEqual(limited[1].meters, []);
  assert.equal(limited[0].meters.length, 1);

  const ordered = orderedProviders(limited, settings);
  assert.deepEqual(ordered.map(p => p.id), ['gemini', 'gemini~claude-and-gpt-models', 'claude', 'claude~fable', 'deepseek']);
  assert.equal(featuredProvider(ordered, { featuredProvider: 'auto' }).id, 'gemini~claude-and-gpt-models');
  assert.equal(featuredProvider(ordered, { featuredProvider: 'claude~fable' }).id, 'claude~fable');
  assert.deepEqual(widgetProviders(ordered, ['claude~fable', 'gemini~claude-and-gpt-models']).map(p => p.id), ['gemini~claude-and-gpt-models', 'claude~fable']);
  assert.equal(providerIndex(ordered[1], 9), providerIndex({ id: 'gemini' }, 0));
  assert.equal(providerIndex(ordered[3], 9), providerIndex({ id: 'claude' }, 0));
});

test('history totals stay on original providers even when separatePools is on or main pool is hidden', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const input = makeSnapshot();
  const baseline = aggregateHistory(input, 7, now);

  const withSeparate = applyLimits(input, { showExtraWindows: true, separatePools: true });
  assert.deepEqual(aggregateHistory(withSeparate, 7, now).daily.map(d => d.tokens), baseline.daily.map(d => d.tokens));

  const mainHidden = applyLimits(input, {
    limitVisibility: { 'claude/main': false, 'claude/fable': true },
    separatePools: true,
  });
  assert.deepEqual(mainHidden.map(p => p.id), ['claude~fable', 'gemini', 'deepseek']);
  assert.equal(mainHidden[0].history, undefined);
  // Passing original providers to history preserves totals when base card is omitted.
  const preserved = aggregateHistory(input, 7, now);
  assert.equal(preserved.daily.at(-1).tokens, 250000);
});

test('normalizeLimitVisibility ignores non-booleans and ring/round renderers list >4 windows without dropping limits', () => {
  assert.deepEqual(normalizeLimitVisibility({ 'gemini/main': false, 'claude/fable': true, bad: 'yes', n: 1, nil: null, '': true }), {
    'gemini/main': false,
    'claude/fable': true,
  });

  globalThis.document = { documentElement: { dataset: { dotCount: '20', shape: 'landscape' } }, querySelector: () => ({ clientWidth: 340 }) };
  globalThis.getComputedStyle = () => ({ fontSize: '16px' });
  const fiveWindows = applyLimits([{
    id: 'gemini',
    label: 'Google Gemini',
    state: 'OK',
    windows: [
      { id: 'w1', label: '5h', kind: 'session', used_percent: 10 },
      { id: 'w2', label: 'weekly', kind: 'weekly', used_percent: 20 },
      { id: 'w3', label: 'Pool A · 5h', kind: 'session', used_percent: 31, hidden_by_default: true, pool: { id: 'pool-a', label: 'Pool A' } },
      { id: 'w4', label: 'Pool A · weekly', kind: 'weekly', used_percent: 41, hidden_by_default: true, pool: { id: 'pool-a', label: 'Pool A' } },
      { id: 'w5', label: 'Pool B · weekly', kind: 'weekly', used_percent: 52, hidden_by_default: true, pool: { id: 'pool-b', label: 'Pool B' } },
    ],
  }], { showExtraWindows: true, separatePools: false });

  const ringRoot = { innerHTML: '' };
  createRenderer('circular-rings')(ringRoot, { providers: fiveWindows }, { showExtraWindows: true });
  assert.equal((ringRoot.innerHTML.match(/class="ring-track"/g) || []).length, 4);
  assert.equal((ringRoot.innerHTML.match(/class="quota-window"/g) || []).length, 5);
  assert.match(ringRoot.innerHTML, /Pool B · Weekly 52%/);

  const circleRoot = { innerHTML: '' };
  renderRound(circleRoot, { providers: fiveWindows }, { shape: 'circle', theme: 'circular-rings', featuredProvider: 'gemini', colorMode: 'calm' });
  assert.equal((circleRoot.innerHTML.match(/class="dial-track"/g) || []).length, 4);
  assert.match(circleRoot.innerHTML, /class="dial-weekly">Weekly 20%</);
});
