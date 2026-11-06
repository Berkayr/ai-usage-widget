import test from 'node:test';
import assert from 'node:assert/strict';
import {startupFailure} from '../app/src/live-startup.js';

async function injectedFailure(load, snapshot = null) {
  try {
    await load();
    assert.fail('injected startup failure did not reject');
  } catch (error) {
    return startupFailure(error, snapshot);
  }
}

test('live startup failures show persistent error state without sample data', async () => {
  const settingsFailure = await injectedFailure(() => Promise.reject(new Error('settings unavailable')));
  const snapshotFailure = await injectedFailure(async () => {
    await Promise.resolve({});
    throw new Error('snapshot unavailable');
  });
  for (const failure of [settingsFailure, snapshotFailure]) {
    assert.equal(failure.snapshot, null);
    assert.equal(failure.noData, true);
    assert.match(failure.message, /Unable to load quota data/);
  }
});

test('a prior real snapshot survives startup failure', async () => {
  const previous = {generated_at: '2026-11-06T10:00:00Z', providers: [{id: 'fixture-real'}]};
  const failure = await injectedFailure(() => Promise.reject(new Error('startup failed')), previous);
  assert.equal(failure.snapshot, previous);
  assert.equal(failure.noData, false);
});
