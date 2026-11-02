import { escapeHtml, safeState } from '../shared/safety.js';
const hiddenStates = new Set(['DISABLED', 'NOT_INSTALLED', 'NO_SUBSCRIPTION']);
const abbreviations = { claude: 'CL', codex: 'CX', gemini: 'GM', copilot: 'CP', openrouter: 'OR', deepseek: 'DS', jetbrains: 'JB', 'jetbrains-ai': 'JB' };
const providerNames = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', copilot: 'Copilot', openrouter: 'OpenRouter', deepseek: 'DeepSeek', jetbrains: 'JetBrains' };

const severity = pct => pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'normal';
export const dotCount = () => {
  if (document.querySelector('#app').clientWidth < 220 * parseFloat(getComputedStyle(document.documentElement).fontSize) / 16) return 10;
  return [10,20,30].includes(Number(document.documentElement.dataset.dotCount)) ? Number(document.documentElement.dataset.dotCount) : 20;
};
function countdown(value) {
  if (!value) return 'RESET UNKNOWN';
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta)) return 'RESET UNKNOWN';
  if (delta <= 0) return 'RESET DUE';
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}
function dots(pct, count = dotCount()) {
  if (!Number.isFinite(pct)) return `<div class="dot-bar unknown" aria-label="Usage unknown">${'<i></i>'.repeat(count)}</div>`;
  const active = pct > 0 ? Math.max(1, Math.round(count * pct / 100)) : 0;
  return `<div class="dot-bar" role="img" aria-label="${pct}% used">${Array.from({ length: count }, (_, i) => `<i class="${i < active ? `on ${pct >= 50 && i >= Math.floor(count / 2) - 1 ? 'threshold' : ''}` : ''}" data-severity="${severity(pct)}"></i>`).join('')}</div>`;
}
function pctOf(window) {
  return typeof window?.used_percent === 'number' && Number.isFinite(window.used_percent) ? Math.max(0, Math.min(100, window.used_percent)) : null;
}
function shortWindowLabel(window) {
  const kind = String(window.kind || '').toLowerCase();
  let label = kind === 'session' ? '5-hour' : kind === 'weekly' ? 'Weekly' : String(window.label || window.id || 'Quota');
  if (label.includes(' · ')) {
    const [group, name] = label.split(' · ', 2);
    const shortGroup = group.replace(/^Gemini 4 /i, '').replace(/ models$/i, '').trim();
    const shortName = /^(weekly|week)$/i.test(name) ? 'Weekly' : /^(5h|session|5-hour)$/i.test(name) ? '5-hour' : name;
    return `${shortGroup} · ${shortName}`;
  }
  return label;
}
function windowRow(window) {
  const pct = pctOf(window);
  return `<div class="quota-window"><div class="window-top"><span>${escapeHtml(shortWindowLabel(window))}</span><b data-severity="${pct === null ? 'unknown' : severity(pct)}">${pct === null ? '—' : `${Math.round(pct)}%`}</b></div>${dots(pct)}<div class="reset">${escapeHtml(countdown(window.resets_at))}</div></div>`;
}
function balanceRows(provider) {
  const meters = Array.isArray(provider.meters) ? provider.meters : [];
  return meters.filter(m => m.unit === 'USD').map(m => `<div class="balance-row"><span>${escapeHtml(m.label || 'API balance')}</span><b>${typeof m.remaining === 'number' ? `$${m.remaining.toFixed(2)}` : '—'}</b></div>`).join('');
}
function providerCard(provider, showExtraWindows) {
  const state = safeState(provider.state);
  const issue = state !== 'OK' || provider.stale;
  const badge = issue ? `<span class="status-badge ${state.toLowerCase()}">${escapeHtml(provider.stale && state === 'OK' ? 'STALE' : state.replace('_', ' '))}</span>` : '';
  const windows = (Array.isArray(provider.windows) ? provider.windows : []).filter(w => showExtraWindows || !w.hidden_by_default);
  const meters = Array.isArray(provider.meters) ? provider.meters : [];
  const apiBalance = provider.category === 'api-balance';
  const abbreviation = abbreviations[String(provider.id || '').toLowerCase()] || String(provider.label || provider.id || '?').slice(0, 2).toUpperCase();
  const primary = windows.find(w => w.kind === 'session' || w.kind === 'short' || /5\s*[- ]?hour|·\s*5h/i.test(w.label || '')) || windows[0];
  const weekly = windows.find(w => w.kind === 'weekly');
  const compactLine = (label, window) => {
    const pct = pctOf(window);
    return `<div class="compact-line"><span>${label}</span>${dots(pct)}<b data-severity="${pct === null ? 'unknown' : severity(pct)}">${pct === null ? '—' : `${Math.round(pct)}%`}</b></div>`;
  };
  const compact = apiBalance
    ? `<div class="compact-api">${escapeHtml(abbreviation)} ${meters.filter(m => m.unit === 'USD').map(m => `$${typeof m.remaining === 'number' ? m.remaining.toFixed(2) : '—'}`).join(' ') || '—'}</div>`
    : `<div class="compact-content">${compactLine('5H', primary)}${compactLine('WK', weekly)}</div>`;
  const xs = apiBalance ? '' : `<div class="xs-content"><span class="xs-name">${issue ? '! ' : ''}${escapeHtml(abbreviation)}</span>${dots(pctOf(primary), 10)}<b data-severity="${pctOf(primary) === null ? 'unknown' : severity(pctOf(primary))}">${pctOf(primary) === null ? '—' : `${Math.round(pctOf(primary))}%`}</b><small data-severity="${weekly && pctOf(weekly) !== null ? severity(pctOf(weekly)) : 'unknown'}">${weekly && pctOf(weekly) !== null ? `${Math.round(pctOf(weekly))}%` : '—'}</small></div>`;
  const details = apiBalance ? '' : windows.map(windowRow).join('') || '';
  const otherMeters = !apiBalance ? meters.map(m => `<div class="balance-row"><span>${escapeHtml(m.label)}</span><b>${m.remaining == null ? '—' : `${escapeHtml(m.remaining)} ${escapeHtml(m.unit || '')}`}</b></div>`).join('') : '';
  const providerName = providerNames[String(provider.id || '').toLowerCase()] || provider.label || provider.id;
  return `<article class="provider-card ${provider.stale ? 'is-stale' : ''} ${apiBalance ? 'api-balance' : ''}"><div class="provider-heading"><div><h2>${escapeHtml(providerName)}</h2>${provider.plan ? `<span class="plan">${escapeHtml(String(provider.plan).toUpperCase())}</span>` : ''}</div>${badge}</div><div class="compact-view">${compact}</div>${xs}${details}${apiBalance ? balanceRows(provider) : otherMeters}</article>`;
}
export { renderSnapshot } from './snapshot.js';

export { dots, escapeHtml, severity, countdown, pctOf, shortWindowLabel, hiddenStates, providerNames };
