import { safeState } from './safety.js';
import { escapeHtml as esc, severity, countdown, pctOf, shortWindowLabel, hiddenStates, providerNames, dotCount } from '../dot-matrix/render.js';

function pace(window) {
  // Match quotacore's documented session/weekly lengths; unknown intervals
  // remain unknown rather than acquiring a fictional marker.
  const minutes = Number.isFinite(window.window_minutes) && window.window_minutes > 0 ? window.window_minutes : window.kind === 'session' ? 300 : window.kind === 'weekly' ? 10080 : null;
  const end = Date.parse(window.resets_at);
  const start = window.starts_at ? Date.parse(window.starts_at) : minutes ? end - minutes * 60000 : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.max(0, Math.min(100, (Date.now() - start) / (end - start) * 100));
}
function meter(window, type) {
  const pct = pctOf(window), elapsed = pace(window);
  const level = pct === null ? 'unknown' : severity(pct);
  const style = `--used:${pct ?? 0}%;--level:var(--severity${level === 'warning' ? 'Warning' : level === 'danger' ? 'Danger' : 'Normal'})`;
  const label = pct === null ? 'Usage unknown' : `${Math.round(pct)}% used`;
  const count = dotCount(), active = pct === null ? 0 : Math.round(pct * count / 100);
  return `<div class="segments ${type} ${pct === null ? 'unknown' : ''}" style="${style}" role="img" aria-label="${label}">${Array.from({length: count}, (_,i) => `<i class="${i < active ? `on ${pct >= 50 && i >= Math.floor(count / 2) - 1 ? 'threshold' : ''}` : ''}"></i>`).join('')}${type === 'minimal-pace' && elapsed !== null ? `<em style="left:${elapsed}%" title="${Math.round(elapsed)}% of interval elapsed"></em>` : ''}</div>`;
}
function row(window, type) {
  const pct = pctOf(window), elapsed = pace(window);
  return `<div class="quota-window"><div class="window-top"><span>${esc(shortWindowLabel(window))}</span><b data-severity="${pct === null ? 'unknown' : severity(pct)}">${pct === null ? '—' : `${Math.round(pct)}%`}</b></div>${meter(window,type)}<div class="window-bottom"><span class="pace">${type === 'minimal-pace' ? (elapsed !== null && pct !== null ? `${pct - elapsed >= 0 ? '+' : ''}${Math.round(pct - elapsed)} pp vs elapsed` : 'Pace unavailable') : ''}</span><span class="reset">${esc(countdown(window.resets_at))}</span></div></div>`;
}
function rings(windows) {
  const rank = w => w.kind === 'session' ? 0 : w.kind === 'weekly' ? 1 : 2;
  const shown = [...windows].sort((a,b) => rank(a) - rank(b)).slice(0, 4);
  if (!shown.length) return '';
  const primary = shown.find(w => w.kind === 'session') || shown[0];
  const pct = pctOf(primary);
  return `<div class="ring-display"><svg viewBox="0 0 160 160" aria-label="Concentric usage rings" role="img">${shown.map((window,i) => {
    const p = pctOf(window), r = 67 - i * 13;
    return `<circle class="ring-track" cx="80" cy="80" r="${r}"/><circle class="ring-value" data-severity="${p === null ? 'unknown' : severity(p)}" cx="80" cy="80" r="${r}" pathLength="100" stroke-dasharray="${p ?? 0} 100" transform="rotate(-90 80 80)"/>`;
  }).join('')}</svg><div class="ring-center"><strong data-severity="${pct === null ? 'unknown' : severity(pct)}">${pct === null ? '—' : Math.round(pct)+'%'}</strong><small>${esc(shortWindowLabel(primary))}</small></div></div>`;
}
export function createRenderer(type) {
  return (root, snapshot, { noData = false, showExtraWindows = false } = {}) => {
    const providers = (Array.isArray(snapshot?.providers) ? snapshot.providers : []).filter(p => !hiddenStates.has(String(p.state).toUpperCase()));
    root.innerHTML = providers.map(p => {
      const state = safeState(p.state);
      const windows = (Array.isArray(p.windows) ? p.windows : []).filter(w => showExtraWindows || !w.hidden_by_default);
      const badge = state !== 'OK' || p.stale ? `<span class="status-badge ${p.stale || state === 'STALE' ? 'stale' : state.toLowerCase()}">${esc(p.stale && state === 'OK' ? 'STALE' : state.replaceAll('_',' '))}</span>` : '';
      const name = providerNames[String(p.id).toLowerCase()] || p.label || p.id || 'Provider';
      const meters = (Array.isArray(p.meters) ? p.meters : []).map(m => `<div class="balance-row"><span>${esc(m.label || 'Balance')}</span><b>${Number.isFinite(m.remaining) ? (m.unit === 'USD' ? '$'+m.remaining.toFixed(2) : `${esc(m.remaining)} ${esc(m.unit)}`) : '—'}</b></div>`).join('');
      return `<article class="provider-card ${p.stale ? 'is-stale' : ''}"><div class="provider-heading"><div><h2>${esc(name)}</h2>${p.plan ? `<span class="plan">${esc(p.plan)}</span>` : ''}</div>${badge}</div>${type === 'circular-rings' ? rings(windows) : ''}<div class="windows">${windows.map(w => row(w,type)).join('')}</div>${meters}${!windows.length && !meters ? '<div class="empty-window">Quota unavailable</div>' : ''}</article>`;
    }).join('') || `<div class="no-data"><strong>${noData ? 'NO DATA YET' : 'NO ACTIVE PROVIDERS'}</strong><small>${noData ? 'Waiting for quotacore snapshot' : 'Enable a provider in quotacore'}</small></div>`;
  };
}
