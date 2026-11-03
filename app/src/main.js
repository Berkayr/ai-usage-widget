import { providerIndex } from './themes/shared/identity.js';
import { renderRound } from './themes/shared/round.js';
import { normalizeSize, widgetWidth, widgetHeight, widgetProviders } from './sizing.js';
import { hiddenStates } from './themes/dot-matrix/render.js';
import { repairTextContrast } from './text-contrast.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
// Wayland does not expose layer-bottom occlusion. Avoid continuous animation
// even if the compositor keeps the document's visibility state as visible.
const motionStyle = document.createElement('style');
motionStyle.textContent = '*::before,*::after,*{animation:none!important} @media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}';
document.head.append(motionStyle);
import { invoke } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';
const unlisteners = [];
let meterObserver;
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
  fitObserver?.disconnect(); meterObserver?.disconnect(); themeStyle.remove(); motionStyle.remove();
  systemAppearance.removeEventListener('change', appearanceChanged);
}
if (import.meta.hot) { import.meta.hot.dispose(dispose); import.meta.hot.accept(() => location.reload()); }
window.addEventListener('pagehide', dispose, { once: true, signal: domEvents.signal });

const isSample = new URLSearchParams(location.search).has('sample') || !('__TAURI_INTERNALS__' in window);
const defaultTaskbar = { enabled: false, providers: ['claude', 'codex', 'gemini'], window: 'session', showBars: false, offsetX: 0, style: 'transparent', theme: 'auto' };
const systemAppearance = matchMedia('(prefers-color-scheme: light)');
let settings = { theme: 'system', appearance: 'auto', colorMode: 'calm', dotCount: 20, matchPhysicalSize: false, accentEdge: 'off', taskbar: { ...defaultTaskbar }, palette: 'default', accent: null, background: null, widgetOpacity: 100, backgroundOpacity: 100, showExtraWindows: false, fitHeight: true, scale: 100, position: 'Top right' };
try { settings.showExtraWindows = localStorage.getItem('showExtraWindows') === 'true'; } catch {}
let shapePage = 0;
let currentSnapshot = null;
let currentNoData = false;
let desktopInfo = null;
let monitorScale = 1;

document.querySelector('#app').innerHTML = `
  <main class="widget" id="widget">
    <header class="header"><div class="title-block"><div class="app-title">AI USAGE</div><div class="sync-line"><i class="beacon"></i><span id="updated">WAITING FOR DATA</span></div></div><button class="gear" id="gear" aria-label="Settings">⚙</button></header>
    <section id="provider-onboarding" hidden></section><div class="provider-list" id="providers"></div>
    <nav class="shape-pages" aria-label="Provider pages" hidden></nav>
    <footer class="footer"><span>AI USAGE</span><span>SYSTEM</span></footer>
    <nav class="context-menu" id="context-menu" hidden><button id="refresh">Refresh now</button><button id="menu-settings">Settings</button></nav>
    <div class="toast" id="toast" hidden></div>
  </main>`;

const $ = selector => document.querySelector(selector);
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
function updateNarrowViewport() {
  // Container font-relative queries can retain a previous scale during resize.
  const unit = parseFloat(getComputedStyle(document.documentElement).fontSize);
  document.documentElement.dataset.narrowViewport = String($('#app').clientWidth < 18 * unit);
}
function applySettings() {
  if (!theme) return;
  settings = normalizeSize(settings);
  document.documentElement.dataset.shape = settings.shape;
  document.documentElement.dataset.largeShape = String(settings.scale >= 150);
  document.documentElement.style.setProperty('--shape-min-font', '9px');
  const selected = theme.palettes[settings.palette] || Object.values(theme.palettes)[0];
  const mode = settings.appearance === 'auto' ? (systemAppearance.matches ? 'light' : 'dark') : settings.appearance;
  const palette = { ...selected, ...(selected[mode] || {}), mode }; 
  for (const [key, value] of Object.entries(palette)) if (typeof value === 'string' && key !== 'name' && key !== 'mode') document.documentElement.style.setProperty(`--${key}`, value);
  (palette.providerColors || [palette.accent, '#56b4e9', '#cc79a7']).forEach((color,i) => document.documentElement.style.setProperty(`--provider-${i}`,color));
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
  const effectiveScale = settings.scale / (settings.matchPhysicalSize ? monitorScale : 1);
  document.documentElement.dataset.microShape = String(effectiveScale < 65);
  document.documentElement.style.setProperty('--widget-opacity', settings.widgetOpacity / 100);
  document.documentElement.style.setProperty('--background-opacity', settings.backgroundOpacity / 100);
  document.documentElement.style.setProperty('--ui-scale', effectiveScale / 100);
  document.documentElement.style.fontSize = `${16 * effectiveScale / 100}px`;
  updateNarrowViewport();
  document.documentElement.classList.toggle('fit-height', Boolean(settings.fitHeight && settings.shape === 'portrait')); lastFitHeight = 0;
  settings.taskbar = { ...defaultTaskbar, ...settings.taskbar, colorMode: settings.colorMode, dotCount: settings.dotCount };
  document.documentElement.dataset.translucent = String(settings.widgetOpacity * settings.backgroundOpacity < 7000);
  $('#widget').classList.toggle('placing', !!settings.placementEditing);
  document.querySelector('.placement-bar')?.remove();
  if (settings.placementEditing) {
    const bar = document.createElement('div'); bar.className='placement-bar'; bar.append(document.createTextNode('Drag to place · '));
    for (const [label,action] of [['Save position','save'],['Cancel','cancel']]) { const b=document.createElement('button'); b.textContent=label; b.onclick=()=>emitTo('settings','placement-action',action); bar.append(b); }
    $('#widget').prepend(bar);
  }
  const header = $('.header'); header.removeAttribute('data-tauri-drag-region');
  header.style.cursor = settings.lockPosition === false ? 'grab' : 'default';
  if (currentSnapshot || currentNoData) draw(currentSnapshot, currentNoData);

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
  if (drawFrame || document.hidden) return;
  drawFrame = requestAnimationFrame(() => {
    drawFrame = 0;
    if (disposed) return;
    const snapshot = currentSnapshot;
    const noData = currentNoData;
    const filtered = settings.providerPreview && snapshot ? {...snapshot,providers:(snapshot.providers||[]).filter(p=>settings.providerPreview.includes(p.id))}:snapshot;
    const visible = snapshotOld(snapshot) ? { ...snapshot, providers: (snapshot.providers || []).map(p => ({ ...p, stale: true, state: ['OK', 'STALE'].includes(p.state) ? 'STALE' : p.state })) } : filtered;
    if (settings.providerPreview && visible?.providers) visible.providers=visible.providers.filter(p=>settings.providerPreview.includes(p.id));
    const allProviders = (visible?.providers || []).filter(p => !hiddenStates.has(String(p.state).toUpperCase()));
    const pages = settings.shape === 'square' ? Math.ceil(allProviders.length / 4) : 1;
    shapePage = Math.min(shapePage, Math.max(0, pages - 1));
    const round = ['circle','pill'].includes(settings.shape);
    const selectedProviders = round ? widgetProviders(allProviders, settings.widgetProviders) : allProviders;
    const paged = round ? {...visible,providers:selectedProviders} : pages > 1 ? {...visible, providers:allProviders.slice(shapePage*4, shapePage*4+4)} : visible;
    const pageNav = $('.shape-pages'); pageNav.hidden = pages <= 1; pageNav.replaceChildren();
    for (let page=0;page<pages && pages>1;page++) { const button=document.createElement('button'); button.textContent=`${page+1}`; button.setAttribute('aria-label', `Provider page ${page+1} of ${pages}`); button.setAttribute('aria-current', String(page===shapePage)); button.onclick=()=>{shapePage=page;draw(currentSnapshot,currentNoData);}; pageNav.append(button); }
    (round ? (root,snapshot)=>renderRound(root,snapshot,settings) : renderSnapshot)($('#providers'), paged, { noData, showExtraWindows: settings.showExtraWindows });
    $('#providers').querySelectorAll('.provider-card').forEach((card,i) => {
      const index=providerIndex(paged.providers[i],i);
      card.style.setProperty('--provider-identity',`var(--provider-${index})`);
      card.dataset.identity=index;
    });
    $('#updated').textContent = snapshot?.generated_at ? `SYNC ${new Date(snapshot.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'NO DATA YET';
    const count = round ? selectedProviders.length : $('#providers').querySelectorAll('.provider-card').length;
    $('#widget').style.setProperty('--provider-count', Math.max(1,count));
    document.documentElement.dataset.denseShape = String(settings.shape !== 'portrait' && (settings.shape === 'square' ? count > 1 : count > 3));
    $('#widget').style.setProperty('--shape-columns', settings.shape === 'square' ? (count > 1 ? 2 : 1) : Math.min(3, Math.max(1,count)));
    $('#widget').style.setProperty('--shape-rows', settings.shape === 'square' ? (count > 2 ? 2 : 1) : (count > 3 ? 2 : 1));
    const width = widgetWidth(settings,count) * settings.scale / 100 / (settings.matchPhysicalSize ? monitorScale : 1);
    if (!isSample) invoke('resize_widget', {scale:Math.round(settings.scale),widthCssPx:width}).catch(()=>{});
    repairTextContrast($('#widget'));
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
  // The contract is independent of theme content; native code caps it to the monitor.
  if ((!settings.fitHeight && settings.shape === 'portrait') || isSample || fitPending || document.hidden) return;
  fitPending = true;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  fitPending = false;
  if (disposed) return;
  const count = $('#providers').querySelectorAll('.provider-card').length;
  const height = widgetHeight(settings,count) * settings.scale / 100 / (settings.matchPhysicalSize ? monitorScale : 1);
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

async function activateTheme(id) {
  const request = ++themeRequest;
  const loaded = await loadTheme(id);
  if (disposed || request !== themeRequest) return;
  theme = loaded.manifest; renderSnapshot = loaded.renderSnapshot;
  settings.theme = theme.id;
  themeStyle.textContent = loaded.css;
  document.documentElement.dataset.theme = theme.id;
  if (!theme.palettes[settings.palette]) settings.palette = Object.keys(theme.palettes)[0];
  settings.accent = null; settings.background = null;
  $('.footer span:last-child').textContent = theme.name.toUpperCase();
  applySettings();
  if (currentSnapshot || currentNoData) draw(currentSnapshot, currentNoData);
  requestFit();
}
function appearanceChanged() { if (settings.appearance === 'auto') applySettings(); }
systemAppearance.addEventListener('change', appearanceChanged);
const openSettings = () => isSample ? window.open('/?settings&sample', 'settings', 'width=900,height=680') : invoke('open_settings').catch(error => showToast(String(error)));
$('#gear').onclick = openSettings;
$('#widget').addEventListener('contextmenu', event => { event.preventDefault(); $('#context-menu').hidden = false; const menu=$('#context-menu'),r=$('#widget').getBoundingClientRect();const round=['circle','pill'].includes(settings.shape);menu.style.left=`${round?r.left+r.width/2-menu.offsetWidth/2:Math.min(event.clientX,r.right-menu.offsetWidth)}px`;menu.style.top=`${round?r.top+r.height/2-menu.offsetHeight/2:Math.min(event.clientY,r.bottom-menu.offsetHeight)}px`; }, { signal: domEvents.signal });
document.addEventListener('click', event => { if (!event.target.closest('#context-menu')) $('#context-menu').hidden = true; }, { signal: domEvents.signal });
$('#refresh').onclick = async () => { if (isSample) return draw(currentSample()); try { await invoke('refresh_now'); } catch (error) { showToast(String(error)); } };
$('#menu-settings').onclick = openSettings;

await activateTheme(settings.theme);
$('#widget').addEventListener('pointerdown', event => { if (event.button === 0 && settings.lockPosition === false && (['circle','pill'].includes(settings.shape) || event.target.closest('.header')) && !event.target.closest('button') && !isSample) getCurrentWindow().startDragging().catch(() => showToast('Use the monitor map to place this widget.')); }, { signal: domEvents.signal });
let lastTier;
meterObserver = new ResizeObserver(() => { updateNarrowViewport(); const tier = $('#app').clientWidth < 220 * parseFloat(getComputedStyle(document.documentElement).fontSize) / 16; if (tier !== lastTier) { lastTier = tier; if (currentSnapshot || currentNoData) draw(currentSnapshot,currentNoData); } });
meterObserver.observe($('#app'));
fitObserver = new ResizeObserver(requestFit); fitObserver.observe($('#widget')); window.addEventListener('keydown', async event => { if (!event.ctrlKey || event.altKey || event.metaKey) return; if (event.key === ',') {event.preventDefault();openSettings();return;} if (event.key === '+' || event.key === '=') settings.fineTune = Math.min(150, settings.fineTune + 5); else if (event.key === '-') settings.fineTune = Math.max(50, settings.fineTune - 5); else if (event.key === '0') settings.fineTune = 100; else return; event.preventDefault(); applySettings(); requestFit(); await persist(); }, { signal: domEvents.signal });
if (isSample) draw(currentSample());
else {
  try {
    settings = { ...settings, ...(await invoke('load_settings')) };
    // Older native settings structs discard unknown fields; keep the theme in
    // the webview store until the native schema includes it.

    const overrides = { accent: settings.accent, background: settings.background };
    await activateTheme(settings.theme); Object.assign(settings, overrides); applySettings();
    await subscribe('monitor-scale', event => { const factor = Number(event.payload); if (factor > 0 && factor !== monitorScale) { monitorScale = factor; applySettings(); } });
    monitorScale = await invoke('get_monitor_scale');
    desktopInfo = await invoke('get_desktop_info');
    async function loadProviders() {
      const config = await invoke('get_provider_config');
      const save = async providers => { await invoke('configure_providers', { providers }); };
      const saved = async () => {
        $('#provider-onboarding').hidden = true;
        await loadProviders();
        try { await invoke('refresh_now'); } catch (error) { showToast(String(error)); }
      };
      $('#provider-onboarding').hidden = config.initialized;
      $('#providers').hidden = !config.initialized;
      if (!config.initialized) mountProviders($('#provider-onboarding'), config, save, saved);
    }
    await loadProviders();
    await subscribe('provider-config-changed', loadProviders);
    await subscribe('snapshot', event => acceptSnapshot(event.payload.snapshot));
    const initial = await invoke('get_snapshot'); acceptSnapshot(initial.snapshot);
    // Events deliver writes immediately; poll only as recovery and age check.
    const recoverSnapshot = async () => {
      try { acceptSnapshot((await invoke('get_snapshot')).snapshot); } catch {}
    };
    const updateVisibility = () => {
      clearInterval(pollTimer);
      if (document.hidden) {
        cancelAnimationFrame(drawFrame); drawFrame = 0;
        clearTimeout(toastTimer); $('#toast').hidden = true;
      } else {
        draw(currentSnapshot, currentNoData);
        recoverSnapshot();
        pollTimer = setInterval(recoverSnapshot, 300000);
      }
    };
    document.addEventListener('visibilitychange', updateVisibility, { signal: domEvents.signal });
    updateVisibility();
    await subscribe('open-settings', openSettings);
    await subscribe('settings-preview', async event => {
      const next = event.payload; const overrides = { accent: next.accent, background: next.background };
      settings = { ...settings, ...next }; await activateTheme(settings.theme); Object.assign(settings, overrides); applySettings();
    });
    await subscribe('taskbar-settings-changed', event => { settings.taskbar = { ...defaultTaskbar, ...event.payload }; applySettings(); });
    await subscribe('refresh-error', event => showToast(event.payload));
  } catch (error) { draw(sample, true); showToast(`Unable to load quota data: ${error}`); }
}


// Documentation captures can inject synthetic data only in explicit sample mode.
if (new URLSearchParams(location.search).has('sample') && window.__QUOTA_DOCS_FIXTURE__) {
  const fixture = window.__QUOTA_DOCS_FIXTURE__;
  settings = { ...settings, ...normalizeSize(fixture.settings) };
  const overrides = { accent: settings.accent, background: settings.background };
  await activateTheme(settings.theme); Object.assign(settings, overrides); applySettings();
  draw(fixture.snapshot);
  if (fixture.providerConfig) {
    const config = structuredClone(fixture.providerConfig);
    const save = async ids => {
      config.initialized = true;
      for (const [id, provider] of Object.entries(config.providers)) provider.enabled = ids.includes(id);
      window.__QUOTA_DOCS_PROVIDER_SELECTION__ = ids;
    };
    $('#provider-onboarding').hidden = config.initialized;
    $('#providers').hidden = !config.initialized;
    if (!config.initialized) mountProviders($('#provider-onboarding'), config, save, () => { $('#provider-onboarding').hidden = true; $('#providers').hidden = false; });
  }
  window.__QUOTA_DOCS_READY__ = true;
}

if (isSample) window.__AI_USAGE_DEMO__ = { async setSnapshot(snapshot, noData = false) { draw(snapshot, noData); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }, async setSettings(next) { if ('scale' in next && !('sizePreset' in next) && !('fineTune' in next)) next = normalizeSize(next); settings = {...settings,...next}; const overrides={accent:settings.accent,background:settings.background}; await activateTheme(settings.theme); Object.assign(settings,overrides); applySettings(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }, themes, getSettings:()=>structuredClone(settings) };
