// Snapshot values never become markup or arbitrary CSS classes.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const states = new Set(['OK', 'STALE', 'DISABLED', 'NOT_INSTALLED', 'NO_SUBSCRIPTION', 'AUTH_REQUIRED', 'RATE_LIMITED', 'SOURCE_UNAVAILABLE', 'SCHEMA_CHANGED']);
export const safeState = value => {
  const state = String(value ?? '').toUpperCase();
  return states.has(state) ? state : 'SOURCE_UNAVAILABLE';
};
