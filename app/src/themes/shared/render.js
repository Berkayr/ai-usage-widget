import { providerLogo } from '../../icons/provider-logos.js';
import { providerEmptyState, hasMeterData } from './provider-state.js';
import { safeState } from './safety.js';
import { escapeHtml as esc, severity, countdown, pctOf, shortWindowLabel, hiddenStates, providerNames, dotCount, dots } from '../dot-matrix/render.js';

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
  if (type === 'dot-matrix') return dots(pct, window);
  if (type === 'system') return `<div class="meter ${pct === null ? 'unknown' : ''}" data-severity="${level}" style="${style}" role="img" aria-label="${label}"><i></i></div>`;
  const count = dotCount(), active = pct === null ? 0 : Math.round(pct * count / 100);
  return `<div class="segments ${type} ${pct === null ? 'unknown' : ''}" style="${style}" role="img" aria-label="${label}">${Array.from({length: count}, (_,i) => `<i class="${i < active ? `on ${pct >= 50 && i >= Math.floor(count / 2) - 1 ? 'threshold' : ''}` : ''}"></i>`).join('')}${type === 'minimal-pace' && elapsed !== null ? `<em style="left:${elapsed}%" title="${Math.round(elapsed)}% of interval elapsed"></em>` : ''}</div>`;
}
function row(window, type, separateCard = false) {
  const pct = pctOf(window), elapsed = pace(window);
  const text = document.documentElement.dataset?.shape === 'pill'
    ? (!separateCard && window?.pool?.id && window.pool.id !== 'main' ? shortWindowLabel(window, false) : ({session:'5h',weekly:'W'}[window.kind] || shortWindowLabel(window, separateCard)))
    : shortWindowLabel(window, separateCard);
  return `<div class="quota-window" data-kind="${esc(window.kind || 'quota')}"><div class="window-top"><span>${esc(text)}</span><b data-severity="${pct === null ? 'unknown' : severity(pct)}">${pct === null ? '—' : `${window.estimated ? '~' : ''}${Math.round(pct)}%`}</b></div>${meter(window,type)}<div class="window-bottom"><span class="pace" title="Usage compared with elapsed interval">${type === 'minimal-pace' ? (elapsed !== null && pct !== null ? `${pct - elapsed >= 0 ? '+' : ''}${Math.round(pct - elapsed)} pp<span class="pace-context"> vs elapsed</span>` : 'Pace unavailable') : ''}</span><span class="reset">${esc(countdown(window.resets_at))}</span></div></div>`;
}
function rings(windows, separateCard = false) {
  const rank = w => w.kind === 'session' ? 0 : w.kind === 'weekly' ? 1 : 2;
  const ordered = [...windows].sort((a,b) => rank(a) - rank(b));
  const shown = ordered.slice(0, 4);
  if (!shown.length) return '';
  const primary = shown.find(w => w.kind === 'session') || shown[0];
  const pct = pctOf(primary);
  const summary = [shortWindowLabel(primary, separateCard), ...ordered.filter(w => w !== primary).map(w =>
    `${shortWindowLabel(w, separateCard)} ${pctOf(w) === null ? '—' : Math.round(pctOf(w)) + '%'}`
  )].join(' · ');
  return `<div class="ring-display"><svg viewBox="0 0 160 160" aria-label="Concentric usage rings" role="img">${shown.map((window,i) => {
    const p = pctOf(window), r = 67 - i * 13;
    return `<circle class="ring-track" cx="80" cy="80" r="${r}"/><circle class="ring-value" data-severity="${p === null ? 'unknown' : severity(p)}" cx="80" cy="80" r="${r}" pathLength="100" stroke-dasharray="${p ?? 0} 100" transform="rotate(-90 80 80)"/>`;
  }).join('')}</svg><div class="ring-center"><strong data-severity="${pct === null ? 'unknown' : severity(pct)}">${pct === null ? '—' : Math.round(pct)+'%'}</strong></div></div><small class="ring-secondary" title="${esc(summary)}">${esc(summary)}</small>`;
}
export function createRenderer(type) {
  return (root, snapshot, { noData = false, showExtraWindows = false } = {}) => {
    const providers = (Array.isArray(snapshot?.providers) ? snapshot.providers : []).filter(p => !hiddenStates.has(String(p.state).toUpperCase()));
    root.innerHTML = providers.map(p => {
      const state = safeState(p.state);
      const separateCard = Boolean(p.baseId);
      const windows = (Array.isArray(p.windows) ? p.windows : []).filter(w => showExtraWindows || !w.hidden_by_default)
        // The fixed-height pill fits two rows at every size.
        .slice(0, globalThis.document?.documentElement?.dataset?.shape === 'pill' ? 2 : undefined);
      const badge = state !== 'OK' || p.stale ? `<span class="status-badge ${p.stale || state === 'STALE' ? 'stale' : state.toLowerCase()}">${esc(p.stale && state === 'OK' ? 'STALE' : state.replaceAll('_',' '))}</span>` : '';
      const name = providerNames[String(p.id).toLowerCase()] || p.label || p.id || 'Provider';
      const meters = (Array.isArray(p.meters) ? p.meters : []).filter(hasMeterData).map(m => `<div class="balance-row"><span>${esc(m.label || 'Balance')}</span><b>${Number.isFinite(m.remaining) ? (m.unit === 'USD' ? '$'+m.remaining.toFixed(2) : `${esc(m.remaining)} ${esc(m.unit)}`) : Number.isFinite(m.used) ? (m.unit === 'USD' ? '$'+m.used.toFixed(2)+' used' : `${esc(m.used)} ${esc(m.unit)} used`) : Number.isFinite(m.limit) ? (m.unit === 'USD' ? '$'+m.limit.toFixed(2)+' limit' : `${esc(m.limit)} ${esc(m.unit)} limit`) : '—'}</b></div>`).join('');
      const empty = providerEmptyState(p, windows.length > 0 || Boolean(meters));
      return `<article class="provider-card ${p.stale ? 'is-stale' : ''}"><div class="provider-heading"><div><h2>${providerLogo(p.baseId || p.id)}<span class="provider-name">${esc(name)}</span></h2>${p.plan ? `<span class="plan">${esc(p.plan)}</span>` : ''}</div>${badge}<small class="heading-reset">${esc(countdown(windows.find(w=>w.kind==='session')?.resets_at))}</small></div>${type === 'circular-rings' ? rings(windows, separateCard) : ''}<div class="windows" style="--window-count:${windows.length}">${windows.map(w => row(w, type, separateCard)).join('')}</div>${meters}${empty ? `<div class="empty-window" role="status"><strong>${esc(empty.title)}</strong><small>${esc(empty.detail)}</small></div>` : ''}</article>`;
    }).join('') || `<div class="no-data"><strong>${noData ? 'NO DATA YET' : 'NO ACTIVE PROVIDERS'}</strong><small>${noData ? 'Waiting for quotacore snapshot' : 'Enable a provider in quotacore'}</small></div>`;
  };
}
