import { mountProviders } from './themes/shared/providers.js';
import './themes/shared/chrome.css';
import { themes, loadTheme } from './themes/registry.js';
import sample from './sample-snapshot.json';
let theme;
let renderSnapshot;
let themeRequest = 0;
const themeStyle = document.createElement('style');
themeStyle.id = 'active-theme';
document.head.append(themeStyle);
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
const unlisteners = [];
let disposed = false;
const domEvents = new AbortController();
async function subscribe(name, handler) {
  const unlisten = await listen(name, handler);
  if (disposed) unlisten(); else unlisteners.push(unlisten);
}
let pollTimer;
function dispose() {
  disposed = true;
  domEvents.abort();
  unlisteners.splice(0).forEach(stop => stop());
  clearInterval(pollTimer); clearTimeout(toastTimer);
  cancelAnimationFrame(drawFrame);
  fitObserver?.disconnect(); meterObserver.disconnect(); themeStyle.remove();
  systemAppearance.removeEventListener('change', appearanceChanged);
}
if (import.meta.hot) { import.meta.hot.dispose(dispose); import.meta.hot.accept(() => location.reload()); }
window.addEventListener('pagehide', dispose, { once: true, signal: domEvents.signal });

const isSample = new URLSearchParams(location.search).has('sample') || !('__TAURI_INTERNALS__' in window);
const defaultTaskbar = { enabled: false, providers: ['claude', 'codex', 'gemini'], window: 'session', showBars: false, offsetX: 0, style: 'transparent', theme: 'auto' };
const systemAppearance = matchMedia('(prefers-color-scheme: light)');
let settings = { theme: 'system', appearance: 'auto', colorMode: 'calm', dotCount: 20, matchPhysicalSize: false, accentEdge: 'off', taskbar: { ...defaultTaskbar }, palette: 'default', accent: null, background: null, widgetOpacity: 100, backgroundOpacity: 100, showExtraWindows: false, fitHeight: true, scale: 100, position: 'Top right' };
try { settings.showExtraWindows = localStorage.getItem('showExtraWindows') === 'true'; } catch {}
let currentSnapshot = null;
let currentNoData = false;
let desktopInfo = null;
let monitorScale = 1;

document.querySelector('#app').innerHTML = `
  <main class="widget" id="widget">
    <header class="header" data-tauri-drag-region><div class="title-block"><div class="app-title">AI QUOTA</div><div class="sync-line"><i class="beacon"></i><span id="updated">WAITING FOR DATA</span></div></div><button class="gear" id="gear" aria-label="Settings">⚙</button></header>
    <section id="provider-onboarding" hidden></section><div class="provider-list" id="providers"></div>
    <footer class="footer"><span>QUOTA MONITOR</span><span>SYSTEM</span></footer>
    <section class="settings" id="settings" hidden><header><strong>DISPLAY SETTINGS</strong><button id="close-settings" aria-label="Close">×</button></header><fieldset><legend>Providers &amp; privacy</legend><div id="provider-settings"></div></fieldset><fieldset><legend>About / Diagnostics</legend><p id="runtime-diagnostics" class="setting-note" role="status">Python diagnostics available in the desktop app.</p></fieldset><fieldset class="theme-section"><legend>Theme</legend><div class="theme-picker" id="theme-picker"></div></fieldset><fieldset class="look-section"><legend>Look</legend><label>Color mode<select id="color-mode"><option value="calm">Calm</option><option value="vivid">Vivid</option><option value="mono">Mono</option></select></label><label>Dot count<select id="dot-count"><option>10</option><option>20</option><option>30</option></select></label><label class="toggle-setting">Match physical size across monitors<input id="match-physical-size" type="checkbox"></label><label>Accent edge<select id="accent-edge"><option value="off">Off</option><option value="auto">Auto</option><option value="left">Left</option><option value="right">Right</option></select></label></fieldset><label>Appearance<select id="appearance"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Palette<select id="palette"></select></label><label>Accent color<input id="accent" type="color"></label><label>Background color<input id="background" type="color"></label><label>Widget opacity <output id="widget-out"></output><input id="widget-opacity" type="range" min="20" max="100"></label><label>Background opacity <output id="background-out"></output><input id="background-opacity" type="range" min="0" max="100"></label><label>Scale <output id="scale-out"></output><input id="scale" type="range" min="50" max="300" step="1"></label><div class="scale-presets">${[['Small',75],['Normal',100],['Large',150],['Huge',200]].map(([label,value])=>`<button data-scale="${value}">${label}</button>`).join('')}</div><label>Position<select id="position"><option>Top right</option><option>Bottom right</option><option>Top left</option><option>Bottom left</option><option>Free</option></select></label><label class="toggle-setting">Fit height to content<input id="fit-height" type="checkbox"></label><label class="toggle-setting">Show extra windows<input id="show-extra-windows" type="checkbox"></label><label class="toggle-setting">Start at login<input id="start-at-login" type="checkbox" disabled></label><p id="autostart-status" class="setting-note" role="status" hidden></p><section id="linux-settings" hidden><fieldset class="desktop-settings" id="desktop-layer" hidden><legend>Desktop layer</legend><label>Layer<select id="linux-layer"><option value="top">Above windows</option><option value="bottom">On desktop</option></select></label><label>Margin <output id="linux-margin-out"></output><input id="linux-margin" type="range" min="0" max="64" step="1"></label><label>Monitor<select id="linux-monitor"><option value="">Auto</option></select></label></fieldset><p id="desktop-layer-unavailable" class="setting-note" hidden>Desktop layer controls require layer-shell support. Use your desktop's panel integration for a fixed position.</p></section><fieldset class="taskbar-settings" id="taskbar-settings"><legend>Taskbar strip</legend><label class="toggle-setting">Enable taskbar strip<input id="taskbar-enabled" type="checkbox"></label><div class="taskbar-providers"><label class="toggle-setting">Claude<input type="checkbox" data-taskbar-provider="claude"></label><label class="toggle-setting">Codex<input type="checkbox" data-taskbar-provider="codex"></label><label class="toggle-setting">Gemini<input type="checkbox" data-taskbar-provider="gemini"></label><label class="toggle-setting">Copilot<input type="checkbox" data-taskbar-provider="copilot"></label></div><label>Style<select id="taskbar-style"><option value="transparent">Transparent</option><option value="chip">Chip</option></select></label><label>Theme<select id="taskbar-theme"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Quota window<select id="taskbar-window"><option value="session">Session</option><option value="weekly">Weekly</option><option value="both">Both</option></select></label><label class="toggle-setting">Show mini bars<input id="taskbar-bars" type="checkbox"></label></fieldset></section>
    <nav class="context-menu" id="context-menu" hidden><button id="refresh">Refresh now</button><button id="menu-settings">Settings</button></nav>
    <div class="toast" id="toast" hidden></div>
  </main>`;

const $ = (selector) => document.querySelector(selector);
// Palette files use opaque hex colors. Correct text against its actual surface.
const rgb = hex => hex.replace('#', '').match(/../g).slice(0, 3).map(n => parseInt(n, 16));
function mix(a, b, weight) { return '#' + rgb(a).map((v, i) => Math.round(v * weight + rgb(b)[i] * (1 - weight)).toString(16).padStart(2, '0')).join(''); }
function luminance(hex) { return rgb(hex).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
function readable(color, background) {
  const bg = luminance(background), target = bg > .179 ? '#000000' : '#ffffff';
  for (let i = 0; i <= 100; i++) {
    const candidate = mix(color, target, 1 - i / 100), value = luminance(candidate);
    if ((Math.max(value, bg) + .05) / (Math.min(value, bg) + .05) >= 5) return candidate;
  }
  return target;
}
function applySettings() {
  if (!theme) return;
  const selected = theme.palettes[settings.palette] || Object.values(theme.palettes)[0];
  const mode = settings.appearance === 'auto' ? (systemAppearance.matches ? 'light' : 'dark') : settings.appearance;
  const palette = { ...selected, ...(selected[mode] || {}), mode }; 
  for (const [key, value] of Object.entries(palette)) if (typeof value === 'string' && key !== 'name' && key !== 'mode') document.documentElement.style.setProperty(`--${key}`, value);
  if (settings.accent) document.documentElement.style.setProperty('--accent', settings.accent);
  if (settings.background) document.documentElement.style.setProperty('--bgWidget', settings.background);
  document.documentElement.dataset.mode = palette.mode;
  // Native system accent when supported; no platform bridge or font embedding.
  document.documentElement.style.setProperty('--systemAccent', settings.accent || (CSS.supports('color', 'AccentColor') && CSS.supports('color', 'AccentColorText') ? 'AccentColor' : palette.accent));
  document.documentElement.style.setProperty('--systemAccentText', CSS.supports('color', 'AccentColorText') ? 'AccentColorText' : palette.textPrimary);
  settings.colorMode = ['calm', 'vivid', 'mono'].includes(settings.colorMode) ? settings.colorMode : 'calm';
  settings.accentEdge = ['off', 'auto', 'left', 'right'].includes(settings.accentEdge) ? settings.accentEdge : 'off';
  document.documentElement.dataset.colorMode = settings.colorMode;
  document.documentElement.dataset.accentEdge = settings.accentEdge === 'auto'
    ? (settings.position.endsWith('left') ? 'left' : settings.position.endsWith('right') ? 'right' : 'off') : settings.accentEdge;
  const card = palette.bgCard, background = settings.background || palette.bgWidget;
  const neutral = mode === 'light' ? '#292d32' : '#e0e3e7';
  const foreground = settings.colorMode === 'calm' ? mix(palette.textPrimary, neutral, .25) : palette.textPrimary;
  const primary = readable(foreground, card);
  const calmText = color => settings.colorMode === 'calm' ? mix(color, neutral, .25) : color;
  for (const [key, value] of Object.entries({
    textPrimary: primary,
    textSecondary: readable(calmText(palette.textSecondary), card),
    textMuted: readable(calmText(palette.textMuted), card),
    chromeText: readable(foreground, background),
    chromeSecondary: readable(calmText(palette.textMuted), background),
  })) document.documentElement.style.setProperty(`--${key}`, value);
  if (settings.colorMode === 'calm') {
    document.documentElement.style.setProperty('--severityNormal', primary);
    document.documentElement.style.setProperty('--severityWarning', readable(mode === 'light' ? '#805c29' : '#c6ab7d', card));
    document.documentElement.style.setProperty('--severityDanger', readable(mode === 'light' ? '#99494b' : '#d29898', card));
  }
  if (settings.colorMode === 'mono') {
    const ink = mode === 'light' ? '#000000' : '#ffffff', paper = mode === 'light' ? '#ffffff' : '#000000';
    for (const [key,value] of Object.entries({bgWidget:paper,bgCard:paper,bgTrackOff:mode === 'light' ? '#dddddd' : '#333333',textPrimary:ink,textSecondary:mode === 'light' ? '#333333' : '#cccccc',textMuted:mode === 'light' ? '#555555' : '#aaaaaa',chromeText:ink,chromeSecondary:mode === 'light' ? '#555555' : '#aaaaaa',border:mode === 'light' ? '#888888' : '#777777',accent:ink,severityNormal:ink,severityWarning:ink,severityDanger:ink})) document.documentElement.style.setProperty(`--${key}`,value);
  }
  settings.dotCount = [10,20,30].includes(Number(settings.dotCount)) ? Number(settings.dotCount) : 20;
  document.documentElement.dataset.dotCount = settings.dotCount;
  $('#dot-count').value = settings.dotCount;
  $('#match-physical-size').checked = Boolean(settings.matchPhysicalSize);
  const effectiveScale = settings.scale / (settings.matchPhysicalSize ? monitorScale : 1);
  $('#color-mode').value = settings.colorMode;
  $('#accent-edge').value = settings.accentEdge;
  document.documentElement.style.setProperty('--widget-opacity', settings.widgetOpacity / 100);
  document.documentElement.style.setProperty('--background-opacity', settings.backgroundOpacity / 100);
  document.documentElement.style.setProperty('--ui-scale', effectiveScale / 100);
  document.documentElement.style.fontSize = `${16 * effectiveScale / 100}px`;
  document.documentElement.classList.toggle('fit-height', Boolean(settings.fitHeight)); lastFitHeight = 0;
  settings.taskbar = { ...defaultTaskbar, ...settings.taskbar, colorMode: settings.colorMode, dotCount: settings.dotCount };
  if (desktopInfo?.platform === 'linux') {
    settings.linux = { layer: 'bottom', margin: 12, monitor: null, ...settings.linux };
    $('#linux-layer').value = settings.linux.layer;
    $('#linux-margin').value = Math.max(0, Math.min(64, settings.linux.margin));
    $('#linux-margin-out').value = `${$('#linux-margin').value} px`;
    const monitor = settings.linux.monitor;
    if (monitor !== null && ![...$('#linux-monitor').options].some(option => option.value === String(monitor)))
      $('#linux-monitor').add(new Option(`${typeof monitor === 'number' ? `Monitor ${monitor + 1}` : monitor} (unavailable)`, monitor));
    $('#linux-monitor').value = monitor ?? '';
  }
  $('#appearance').value = settings.appearance;
  $('#taskbar-style').value = settings.taskbar.style;
  $('#taskbar-theme').value = settings.taskbar.theme;
  $('#taskbar-enabled').checked = settings.taskbar.enabled;
  $('#taskbar-window').value = settings.taskbar.window;
  $('#taskbar-bars').checked = settings.taskbar.showBars;
  document.querySelectorAll('[data-taskbar-provider]').forEach(input => { input.checked = settings.taskbar.providers.includes(input.dataset.taskbarProvider); });
  $('#palette').value = settings.palette;
  $('#accent').value = settings.accent || palette.accent;
  $('#background').value = settings.background || palette.bgWidget;
  $('#widget-opacity').value = settings.widgetOpacity; $('#widget-out').value = `${settings.widgetOpacity}%`;
  $('#background-opacity').value = settings.backgroundOpacity; $('#background-out').value = `${settings.backgroundOpacity}%`;
  $('#show-extra-windows').checked = Boolean(settings.showExtraWindows);
  $('#scale').value = settings.scale; $('#scale-out').value = `${settings.scale}%`;
  $('#fit-height').checked = Boolean(settings.fitHeight); $('#position').value = settings.position;
  if (currentSnapshot) draw(currentSnapshot, currentNoData);
  if (!isSample) invoke('resize_widget', { scale: Math.round(effectiveScale) }).catch(() => {});
}
let drawFrame = 0;
let lastSnapshotKey;
let lastAgeState;
function acceptSnapshot(snapshot) {
  const key = JSON.stringify(snapshot);
  const old = snapshotOld(snapshot);
  if (key === lastSnapshotKey && old === lastAgeState) return;
  lastSnapshotKey = key; lastAgeState = old;
  draw(snapshot, !snapshot);
}
function snapshotOld(snapshot) {
  const time = Date.parse(snapshot?.generated_at);
  return Number.isFinite(time) && Date.now() - time > 10 * 60 * 1000;
}
function draw(snapshot, noData = false) {
  if (disposed) return;
  currentSnapshot = snapshot;
  currentNoData = noData;
  if (drawFrame) return;
  drawFrame = requestAnimationFrame(() => {
    drawFrame = 0;
    if (disposed) return;
    const snapshot = currentSnapshot;
    const noData = currentNoData;
    const visible = snapshotOld(snapshot) ? { ...snapshot, providers: (snapshot.providers || []).map(p => ({ ...p, stale: true, state: ['OK', 'STALE'].includes(p.state) ? 'STALE' : p.state })) } : snapshot;
    renderSnapshot($('#providers'), visible, { noData, showExtraWindows: settings.showExtraWindows });
    $('#updated').textContent = snapshot?.generated_at ? `SYNC ${new Date(snapshot.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'NO DATA YET';
    requestFit();
    if (!isSample) {
      console.debug('snapshot-rendered', snapshot?.generated_at);
      invoke('snapshot_rendered', { generatedAt: snapshot?.generated_at || 'none' }).catch(() => {});
    }
  });
}
let fitObserver;
let lastFitHeight = 0;
let fitPending = false;
async function requestFit() {
  // Measure the content's natural height (the widget is height:auto in fit mode), not the window.
  if (!settings.fitHeight || isSample || fitPending) return;
  fitPending = true;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  fitPending = false;
  if (disposed) return;
  const height = Math.ceil($('#widget').getBoundingClientRect().height);
  if (Math.abs(height - lastFitHeight) < 2) return;
  lastFitHeight = height;
  invoke('fit_window_height', { heightCssPx: height }).catch(() => {});
}
function currentSample() {
  const now = Date.now();
  return { ...sample, generated_at: new Date(now).toISOString(), providers: sample.providers.map(provider => ({ ...provider, windows: (provider.windows || []).map(window => ({ ...window, resets_at: Number.isFinite(window.resets_in_minutes) ? new Date(now + window.resets_in_minutes * 60000).toISOString() : null })) })) };
}
async function persist() { if (!isSample) try { localStorage.setItem('widgetTheme', settings.theme); localStorage.setItem('widgetLook', JSON.stringify({ colorMode: settings.colorMode, accentEdge: settings.accentEdge, dotCount: settings.dotCount, matchPhysicalSize: settings.matchPhysicalSize })); } catch {} if (!isSample) try { await invoke('save_settings', { settings }); } catch (error) { showToast(String(error)); } }
let toastTimer;
function showToast(message) { clearTimeout(toastTimer); const el = $('#toast'); el.textContent = message; el.hidden = false; toastTimer = setTimeout(() => { el.hidden = true; }, 3200); }

const previews = { system: '━━━━', 'dot-matrix': '••••••', 'circular-rings': '◉ ◎', terminal: '[▓▓░░]', 'frosted-glass': '▰ ▰', brutalist: '84%', 'compact-strip': '━ ━ ━', 'retro-lcd': '▮▮▮▯▯', 'minimal-pace': '──┊──' };
for (const item of themes) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.theme = item.id; button.setAttribute('aria-pressed', 'false');
  const preview = document.createElement('span'); preview.className = 'theme-preview'; preview.textContent = previews[item.id]; preview.setAttribute('aria-hidden', 'true');
  button.append(preview, document.createTextNode(item.name.replace(/^01 /, '')));
  button.onclick = async () => { try { await activateTheme(item.id); await persist(); } catch (error) { showToast(`Unable to load theme: ${error}`); } };
  $('#theme-picker').append(button);
}
async function activateTheme(id) {
  const request = ++themeRequest;
  const loaded = await loadTheme(id);
  if (disposed || request !== themeRequest) return;
  theme = loaded.manifest; renderSnapshot = loaded.renderSnapshot;
  settings.theme = theme.id;
  themeStyle.textContent = loaded.css;
  document.documentElement.dataset.theme = theme.id;
  $('#palette').replaceChildren();
  for (const [key, value] of Object.entries(theme.palettes)) $('#palette').add(new Option(value.name, key));
  if (!theme.palettes[settings.palette]) settings.palette = Object.keys(theme.palettes)[0];
  settings.accent = null; settings.background = null;
  document.querySelectorAll('.theme-picker [data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === theme.id)));
  $('.footer span:last-child').textContent = theme.name.toUpperCase();
  applySettings();
  if (currentSnapshot) draw(currentSnapshot, currentNoData);
  requestFit();
}
function appearanceChanged() { if (settings.appearance === 'auto') applySettings(); }
systemAppearance.addEventListener('change', appearanceChanged);
for (const [id, key] of [['color-mode', 'colorMode'], ['accent-edge', 'accentEdge']]) $(`#${id}`).onchange = async event => { settings[key] = event.target.value; applySettings(); await persist(); };
$('#dot-count').onchange = async event => { settings.dotCount = Number(event.target.value); applySettings(); await persist(); };
$('#match-physical-size').onchange = async event => { settings.matchPhysicalSize = event.target.checked; applySettings(); await persist(); };
$('#appearance').onchange = async event => { settings.appearance = event.target.value; applySettings(); await persist(); };
for (const key of ['style', 'theme']) $(`#taskbar-${key}`).onchange = async event => { settings.taskbar[key] = event.target.value; await persist(); };
$('#taskbar-enabled').onchange = async event => { settings.taskbar.enabled = event.target.checked; await persist(); };
$('#taskbar-window').onchange = async event => { settings.taskbar.window = event.target.value; await persist(); };
$('#taskbar-bars').onchange = async event => { settings.taskbar.showBars = event.target.checked; await persist(); };
document.querySelectorAll('[data-taskbar-provider]').forEach(input => input.onchange = async () => { settings.taskbar.providers = [...document.querySelectorAll('[data-taskbar-provider]:checked')].map(input => input.dataset.taskbarProvider); await persist(); });
$('#start-at-login').onchange = async event => {
  const enabled = event.target.checked;
  event.target.disabled = true;
  try {
    if (!isSample) await invoke('set_autostart', { enabled });
    event.target.checked = isSample ? enabled : await invoke('get_autostart');
    $('#autostart-status').hidden = true;
  } catch (error) {
    event.target.checked = !enabled;
    $('#autostart-status').textContent = `Unable to change start at login: ${error}`;
    $('#autostart-status').hidden = false;
  } finally { event.target.disabled = false; }
};
for (const key of ['layer', 'margin', 'monitor']) $(`#linux-${key}`).onchange = async event => {
  const raw = event.target.value;
  settings.linux[key] = key === 'margin' ? Math.max(0, Math.min(64, Number(raw))) : key === 'monitor' ? (raw === '' ? null : /^\d+$/.test(raw) ? Number(raw) : raw) : raw;
  applySettings();
  await persist();
};
$('#linux-margin').oninput = event => { $('#linux-margin-out').value = `${event.target.value} px`; };
async function loadDesktopSettings() {
  try {
    desktopInfo = await invoke('get_desktop_info');
    $('#taskbar-settings').hidden = desktopInfo.platform !== 'windows';
    $('#linux-settings').hidden = desktopInfo.platform !== 'linux';
    $('#desktop-layer').hidden = !desktopInfo.layerShell;
    $('#desktop-layer-unavailable').hidden = desktopInfo.layerShell;
    for (const monitor of desktopInfo.monitors) $('#linux-monitor').add(new Option(monitor.name, monitor.name));
    if (desktopInfo.layerShell) {
      const free = [...$('#position').options].find(option => option.value === 'Free');
      free.disabled = true;
    }
    applySettings();
  } catch (error) { showToast(`Unable to read desktop capabilities: ${error}`); }
  try {
    $('#start-at-login').checked = await invoke('get_autostart');
    $('#start-at-login').disabled = false;
  } catch (error) {
    $('#autostart-status').textContent = `Start at login unavailable: ${error}`;
    $('#autostart-status').hidden = false;
  }
}
async function loadRuntimeDiagnostics() {
  if (isSample) return;
  const target = $('#runtime-diagnostics');
  target.textContent = 'Checking runtime diagnostics…';
  const [runtime, desktop] = await Promise.allSettled([
    invoke('get_runtime_diagnostics'), invoke('get_desktop_info'),
  ]);
  const runtimeText = runtime.status === 'fulfilled'
    ? `Python ${runtime.value.paths.python_version} (${runtime.value.paths.runtime_source}) — ${runtime.value.paths.python}`
    : String(runtime.reason);
  const monitorWarning = desktop.status === 'fulfilled' ? desktop.value.monitorWarning : null;
  target.textContent = [runtimeText, monitorWarning].filter(Boolean).join(' • ');
}
$('#gear').onclick = () => { $('#settings').hidden = !$('#settings').hidden; if (!$('#settings').hidden) loadRuntimeDiagnostics(); };
$('#close-settings').onclick = () => { $('#settings').hidden = true; };
$('#palette').onchange = async (event) => { settings.palette = event.target.value; settings.accent = null; settings.background = null; applySettings(); await persist(); };
$('#accent').oninput = async (event) => { settings.accent = event.target.value; applySettings(); await persist(); };
$('#background').oninput = async (event) => { settings.background = event.target.value; applySettings(); await persist(); };
$('#widget-opacity').oninput = async (event) => { settings.widgetOpacity = Number(event.target.value); applySettings(); await persist(); };
$('#background-opacity').oninput = async (event) => { settings.backgroundOpacity = Number(event.target.value); applySettings(); await persist(); };
$('#show-extra-windows').onchange = async (event) => { settings.showExtraWindows = event.target.checked; try { localStorage.setItem('showExtraWindows', String(settings.showExtraWindows)); } catch {} draw(currentSnapshot, currentNoData); await persist(); };
$('#scale').oninput = async event => { settings.scale = Number(event.target.value); applySettings(); requestFit(); await persist(); };
document.querySelectorAll('[data-scale]').forEach(button => button.onclick = async () => { settings.scale = Number(button.dataset.scale); applySettings(); requestFit(); await persist(); });
$('#fit-height').onchange = async event => { settings.fitHeight = event.target.checked; applySettings(); if (settings.fitHeight) requestFit(); await persist(); };
$('#position').onchange = async event => { settings.position = event.target.value; applySettings(); if (!isSample) try { await invoke('snap_window', { corner: settings.position }); } catch (error) { showToast(String(error)); } await persist(); };
$('#widget').addEventListener('contextmenu', event => { event.preventDefault(); $('#context-menu').hidden = false; $('#context-menu').style.left = `${event.clientX}px`; $('#context-menu').style.top = `${event.clientY}px`; }, { signal: domEvents.signal });
document.addEventListener('click', event => { if (!event.target.closest('#context-menu')) $('#context-menu').hidden = true; }, { signal: domEvents.signal });
$('#refresh').onclick = async () => { if (isSample) return draw(currentSample()); try { await invoke('refresh_now'); } catch (error) { showToast(String(error)); } };
$('#menu-settings').onclick = () => { $('#settings').hidden = false; loadRuntimeDiagnostics(); };

$('#taskbar-settings').hidden = !isSample && !/Windows/i.test(navigator.userAgent);
await activateTheme(settings.theme);
let lastTier;
const meterObserver = new ResizeObserver(() => { const tier = $('#app').clientWidth < 220 * parseFloat(getComputedStyle(document.documentElement).fontSize) / 16; if (tier !== lastTier) { lastTier = tier; if (currentSnapshot) draw(currentSnapshot,currentNoData); } });
meterObserver.observe($('#app'));
fitObserver = new ResizeObserver(requestFit); fitObserver.observe($('#widget')); window.addEventListener('keydown', async event => { if (!event.ctrlKey || event.altKey || event.metaKey) return; if (event.key === '+' || event.key === '=') settings.scale = Math.min(300, settings.scale + 10); else if (event.key === '-') settings.scale = Math.max(50, settings.scale - 10); else if (event.key === '0') settings.scale = 100; else return; event.preventDefault(); applySettings(); requestFit(); await persist(); }, { signal: domEvents.signal });
if (isSample) draw(currentSample());
else {
  try {
    settings = { ...settings, ...(await invoke('load_settings')) };
    // Older native settings structs discard unknown fields; keep the theme in
    // the webview store until the native schema includes it.
    try { settings.theme = localStorage.getItem('widgetTheme') || settings.theme; Object.assign(settings, JSON.parse(localStorage.getItem('widgetLook') || '{}')); } catch {}
    const overrides = { accent: settings.accent, background: settings.background };
    await activateTheme(settings.theme); Object.assign(settings, overrides); applySettings();
    await subscribe('monitor-scale', event => { const factor = Number(event.payload); if (factor > 0 && factor !== monitorScale) { monitorScale = factor; applySettings(); } });
    monitorScale = await invoke('get_monitor_scale');
    await loadDesktopSettings();
    async function loadProviders() {
      const config = await invoke('get_provider_config');
      const save = async providers => { await invoke('configure_providers', { providers }); };
      const saved = async () => {
        $('#provider-onboarding').hidden = true;
        await loadProviders();
        try { await invoke('refresh_now'); } catch (error) { showToast(String(error)); }
      };
      mountProviders($('#provider-settings'), config, save, saved);
      $('#provider-onboarding').hidden = config.initialized;
      $('#providers').hidden = !config.initialized;
      if (!config.initialized) mountProviders($('#provider-onboarding'), config, save, saved);
    }
    await loadProviders();
    await subscribe('snapshot', event => acceptSnapshot(event.payload.snapshot));
    const initial = await invoke('get_snapshot'); acceptSnapshot(initial.snapshot);
    pollTimer = setInterval(async () => {
      try { acceptSnapshot((await invoke('get_snapshot')).snapshot); } catch {}
    }, 60000);
    await subscribe('open-settings', () => { $('#settings').hidden = false; loadRuntimeDiagnostics(); });
    await subscribe('taskbar-settings-changed', event => { settings.taskbar = { ...defaultTaskbar, ...event.payload }; applySettings(); });
    await subscribe('refresh-error', event => showToast(event.payload));
  } catch (error) { draw(sample, true); showToast(`Unable to load quota data: ${error}`); }
}


// Documentation captures can inject synthetic data only in explicit sample mode.
if (new URLSearchParams(location.search).has('sample') && window.__QUOTA_DOCS_FIXTURE__) {
  const fixture = window.__QUOTA_DOCS_FIXTURE__;
  settings = { ...settings, ...fixture.settings };
  const overrides = { accent: settings.accent, background: settings.background };
  await activateTheme(settings.theme); Object.assign(settings, overrides); applySettings();
  draw(fixture.snapshot);
  $('#settings').hidden = !fixture.openSettings;
  if (fixture.providerConfig) {
    const config = structuredClone(fixture.providerConfig);
    const save = async ids => {
      config.initialized = true;
      for (const [id, provider] of Object.entries(config.providers)) provider.enabled = ids.includes(id);
      window.__QUOTA_DOCS_PROVIDER_SELECTION__ = ids;
    };
    mountProviders($('#provider-settings'), config, save);
    $('#provider-onboarding').hidden = config.initialized;
    $('#providers').hidden = !config.initialized;
    if (!config.initialized) mountProviders($('#provider-onboarding'), config, save, () => { $('#provider-onboarding').hidden = true; $('#providers').hidden = false; });
  }
  window.__QUOTA_DOCS_READY__ = true;
}
