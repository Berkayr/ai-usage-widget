import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRefreshFeedback, formatRefreshResult, refreshProgress } from '../app/src/refresh-feedback.js';

const completed = new Date(2026, 0, 1, 7, 5);
const fresh = { id: 'codex', state: 'OK' };
const ignored = [
  { id: 'copilot', state: 'DISABLED' },
  { id: 'jetbrains', state: 'NOT_INSTALLED' },
  { id: 'moonshot', state: 'OK', enabled: false }
];
const problems = [
  [{ id: 'claude', state: 'auth_required', stale: true }, 'Claude: sign-in needed'],
  [{ id: 'gemini', state: 'RATE_LIMITED', stale: true }, 'Gemini: rate limited'],
  [{ id: 'deepseek', state: 'STALE' }, 'DeepSeek: showing older data'],
  [{ id: 'codex', state: 'OK', stale: true }, 'Codex: showing older data'],
  [{ id: 'openrouter', state: 'UNAVAILABLE' }, 'OpenRouter: unavailable']
];

test('formats completion in local 24-hour time and ignores hidden providers', () => {
  const data = { generated_at: '2020-01-01T00:00:00Z', providers: [...ignored, fresh] };
  assert.deepEqual(formatRefreshResult(data, completed), { message: 'Updated 07:05', duration: 3200 });
  for (const [provider, reason] of problems) {
    assert.deepEqual(formatRefreshResult({ providers: [fresh, provider] }, completed),
      { message: `Updated 07:05 · ${reason}`, duration: 8000 });
    assert.deepEqual(formatRefreshResult({ providers: [provider, ...ignored] }, completed),
      { message: `Refresh failed · ${reason}`, duration: 8000 });
  }
  assert.deepEqual(formatRefreshResult({ providers: problems.map(([provider]) => provider) }, completed),
    { message: 'Refresh failed · Claude: sign-in needed · Gemini: rate limited · +3 more', duration: 8000 });
  assert.deepEqual(formatRefreshResult(null, completed),
    { message: 'Refresh failed · no fresh provider data', duration: 8000 });
});

test('coalesces menu activation and releases the guard on resolve and reject', async () => {
  let pending;
  let calls = 0;
  const shown = [];
  const feedback = createRefreshFeedback(() => new Promise((resolve, reject) => {
    calls++;
    pending = { resolve, reject };
  }), message => shown.push(message));
  const first = feedback.run();
  await feedback.run();
  assert.equal(calls, 1);
  assert.equal(feedback.isRunning(), true);
  assert.deepEqual(shown, [refreshProgress]);
  pending.resolve({ providers: [{ ...fresh, captured_at: new Date().toISOString() }] });
  await first;
  assert.equal(feedback.isRunning(), false);
  assert.match(shown.at(-1).message, /^Updated \d{2}:\d{2}$/);

  const second = feedback.run();
  pending.reject(new Error('Collector\r\n timed out\u0000\u202e ' + '⚠'.repeat(150)));
  await second;
  assert.equal(calls, 2);
  assert.equal(feedback.isRunning(), false);
  assert.match(shown.at(-1).message, /^Refresh failed · Collector timed out ⚠+…$/u);
  assert.equal([...shown.at(-1).message.split(' · ')[1]].length, 120);
  assert.equal(shown.at(-1).duration, 8000);

  const third = feedback.run();
  pending.resolve({ providers: [{ ...fresh, captured_at: new Date().toISOString() }] });
  await third;
  assert.equal(calls, 3);
});

test('dispose releases the guard and suppresses late completion', async () => {
  let finish;
  const shown = [];
  const feedback = createRefreshFeedback(() => new Promise(resolve => { finish = resolve; }), message => shown.push(message));
  const running = feedback.run();
  feedback.dispose();
  assert.equal(feedback.isRunning(), false);
  finish({ providers: [fresh] });
  await running;
  await feedback.run();
  assert.deepEqual(shown, [refreshProgress]);
});

test('distinguishes newly measured readings from unchanged OK providers when start time is given', () => {
  const started = new Date(2026, 0, 1, 7, 4);
  const geminiOld = { id: 'gemini', state: 'OK', captured_at: new Date(2025, 11, 30, 7, 4).toISOString() };
  const codexNew = { id: 'codex', state: 'OK', captured_at: new Date(2026, 0, 1, 7, 4, 30).toISOString() };
  const claudeAuth = { id: 'claude', state: 'AUTH_REQUIRED' };

  assert.deepEqual(
    formatRefreshResult({ providers: [geminiOld] }, completed, started),
    { message: 'Checked 07:05 · no new readings', duration: 3200 }
  );
  assert.deepEqual(
    formatRefreshResult({ providers: [codexNew, geminiOld] }, completed, started),
    { message: 'Updated 07:05 · Gemini: no new reading', duration: 3200 }
  );
  assert.deepEqual(
    formatRefreshResult({ providers: [geminiOld, claudeAuth] }, completed, started),
    { message: 'Checked 07:05 · Claude: sign-in needed · Gemini: no new reading', duration: 8000 }
  );
  assert.deepEqual(
    formatRefreshResult(
      { providers: [{ id: 'codex', state: 'OK', captured_at: new Date(2026, 0, 1, 7, 4, 12, 0).toISOString() }] },
      completed,
      new Date(2026, 0, 1, 7, 4, 12, 850)
    ),
    { message: 'Updated 07:05', duration: 3200 }
  );
  assert.deepEqual(
    formatRefreshResult(
      { providers: [{ id: 'codex', state: 'OK' }, { id: 'gemini', state: 'OK', captured_at: 'not-a-date' }] },
      completed,
      started
    ),
    { message: 'Checked 07:05 · no new readings', duration: 3200 }
  );
  assert.deepEqual(
    formatRefreshResult(
      { providers: [codexNew, geminiOld, claudeAuth, { id: 'deepseek', state: 'OK', captured_at: geminiOld.captured_at }] },
      completed,
      started
    ),
    { message: 'Updated 07:05 · Claude: sign-in needed · Gemini: no new reading · +1 more', duration: 8000 }
  );
});

test('createRefreshFeedback passes a start time so old captured_at yields Checked', async () => {
  const shown = [];
  const feedback = createRefreshFeedback(
    async () => ({ providers: [{ id: 'gemini', state: 'OK', captured_at: '2020-01-01T00:00:00Z' }] }),
    message => shown.push(message)
  );
  await feedback.run();
  assert.equal(shown.length, 2);
  assert.deepEqual(shown[0], refreshProgress);
  assert.match(shown[1].message, /^Checked \d{2}:\d{2} · no new readings$/);
  assert.equal(shown[1].duration, 3200);
});
