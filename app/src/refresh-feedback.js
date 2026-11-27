import { hiddenStates, providerNames } from './themes/dot-matrix/render.js';

export const refreshProgress = { message: 'Refreshing…', duration: 0 };
const reasonByState = new Map([
  ['AUTH_REQUIRED', 'sign-in needed'],
  ['RATE_LIMITED', 'rate limited']
]);
const failureDuration = 8000;

export function formatRefreshResult(snapshot, completed = new Date(), started = undefined) {
  const time = [completed.getHours(), completed.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
  // Floor to whole seconds because RFC 3339 timestamps may omit sub-second precision.
  const startFloor = started === undefined ? undefined : Math.floor(new Date(started).getTime() / 1000) * 1000;
  const problems = [];
  const notes = [];
  let fresh = false;
  for (const provider of snapshot?.providers ?? []) {
    const state = String(provider.state).toUpperCase();
    if (hiddenStates.has(state) || provider.enabled === false) continue;
    const name = Object.hasOwn(providerNames, provider.id) ? providerNames[provider.id] : provider.label || provider.id || 'Provider';
    if (state === 'OK' && provider.stale !== true) {
      const measuredNew = startFloor === undefined || (
        (typeof provider.captured_at === 'string' || provider.captured_at instanceof Date) &&
        Date.parse(provider.captured_at) >= startFloor
      );
      if (measuredNew) {
        fresh = true;
      } else {
        notes.push(`${name}: no new reading`);
      }
      continue;
    }
    const reason = reasonByState.get(state) ?? (state === 'STALE' || provider.stale === true ? 'showing older data' : 'unavailable');
    problems.push(`${name}: ${reason}`);
  }
  if (!fresh && notes.length && !problems.length) {
    return { message: `Checked ${time} · no new readings`, duration: 3200 };
  }
  const combined = [...problems, ...notes];
  const details = combined.slice(0, 2);
  if (combined.length > 2) details.push(`+${combined.length - 2} more`);
  const usable = fresh || notes.length > 0;
  if (!usable && !details.length) details.push('no fresh provider data');
  return {
    message: [fresh ? `Updated ${time}` : usable ? `Checked ${time}` : 'Refresh failed', ...details].join(' · '),
    duration: problems.length || !usable ? failureDuration : 3200
  };
}

function formatRefreshError(error) {
  const reason = String(error?.message ?? error ?? '')
    .replace(/\s+/gu, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  const characters = [...reason];
  const message = characters.length > 120 ? characters.slice(0, 119).join('') + '…' : reason;
  return { message: `Refresh failed · ${message || 'unavailable'}`, duration: failureDuration };
}

export function createRefreshFeedback(refresh, show) {
  let running = false;
  let disposed = false;
  return {
    isRunning: () => running,
    async run() {
      if (running || disposed) return;
      running = true;
      let outcome;
      try {
        show(refreshProgress);
        const started = new Date();
        const snapshot = await refresh();
        outcome = formatRefreshResult(snapshot, new Date(), started);
      } catch (error) {
        outcome = formatRefreshError(error);
      } finally {
        running = false;
      }
      if (!disposed) show(outcome);
    },
    dispose() {
      disposed = true;
      running = false;
    }
  };
}
