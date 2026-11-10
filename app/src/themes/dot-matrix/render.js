import { escapeHtml } from '../shared/safety.js';
const hiddenStates = new Set(['DISABLED', 'NOT_INSTALLED']);
const providerNames = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', copilot: 'Copilot', openrouter: 'OpenRouter', deepseek: 'DeepSeek', jetbrains: 'JetBrains', zai: 'Z.ai', moonshot: 'Kimi', siliconflow: 'SiliconFlow', openai_admin: 'OpenAI API', anthropic_admin: 'Anthropic API' };

const severity = pct => pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'normal';
export const dotCount = () => {
  if (document.querySelector('#app').clientWidth < 220 * parseFloat(getComputedStyle(document.documentElement).fontSize) / 16) return 10;
  return [10,20,30].includes(Number(document.documentElement.dataset.dotCount)) ? Number(document.documentElement.dataset.dotCount) : 20;
};
function countdown(value) {
  if (!value) return 'RESET UNKNOWN';
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta)) return 'RESET UNKNOWN';
  if (delta <= 0) return 'Awaiting refresh';
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}
function dots(pct, quotaWindow = {}, count = dotCount()) {
  if (!Number.isFinite(pct)) return `<div class="dot-bar unknown" aria-label="Usage unknown">${'<i></i>'.repeat(count)}</div>`;
  const active = pct > 0 ? Math.max(1, Math.round(count * pct / 100)) : 0;
  return `<div class="dot-bar" role="img" aria-label="${quotaWindow.estimated ? '~' : ''}${pct}% used">${Array.from({ length: count }, (_, i) => `<i class="${i < active ? `on ${pct >= 50 && i >= Math.floor(count / 2) - 1 ? 'threshold' : ''}` : ''}" data-severity="${severity(pct)}"></i>`).join('')}</div>`;
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
export { renderSnapshot } from './snapshot.js';

export { dots, escapeHtml, severity, countdown, pctOf, shortWindowLabel, hiddenStates, providerNames };
