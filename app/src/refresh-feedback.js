import { hiddenStates, providerNames } from './themes/dot-matrix/render.js';

export const refreshProgress = { message: 'Refreshing…', duration: 0 };
const reasonByState = new Map([
  ['AUTH_REQUIRED', 'sign-in needed'],
  ['RATE_LIMITED', 'rate limited']
]);
const failureDuration = 8000;

export function formatRefreshResult(snapshot, completed = new Date()) {
  const time = [completed.getHours(), completed.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
  const problems = [];
  let fresh = false;
  for (const provider of snapshot?.providers ?? []) {
    const state = String(provider.state).toUpperCase();
    if (hiddenStates.has(state) || provider.enabled === false) continue;
    if (state === 'OK' && provider.stale !== true) {
      fresh = true;
      continue;
    }
    const reason = reasonByState.get(state) ?? (state === 'STALE' || provider.stale === true ? 'showing older data' : 'unavailable');
    problems.push(`${Object.hasOwn(providerNames, provider.id) ? providerNames[provider.id] : provider.label || provider.id || 'Provider'}: ${reason}`);
  }
  const details = problems.slice(0, 2);
  if (problems.length > 2) details.push(`+${problems.length - 2} more`);
  if (!fresh && !details.length) details.push('no fresh provider data');
  return {
    message: [fresh ? `Updated ${time}` : 'Refresh failed', ...details].join(' · '),
    duration: problems.length || !fresh ? failureDuration : 3200
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
        outcome = formatRefreshResult(await refresh());
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
