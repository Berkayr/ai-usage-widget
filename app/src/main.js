import {historyDefaults, mountHistory, historyGeometry} from './history.js';
import './history.css';
import { paletteChoices } from './user-palettes.js';
import { observeUsageFit } from './usage-fit.js';
import { applyAppearance } from './appearance.js';
import { orderedProviders, arrangeCards } from './provider-layout.js';
import { loadQuote, renderQuote, sampleQuote } from './quote.js';
import './quote.css';
import { providerIndex } from './themes/shared/identity.js';
import { createRenderer } from './themes/shared/render.js';
import { renderRound } from './themes/shared/round.js';
import { effectiveSizeMode, normalizeSize, widgetWidth, widgetHeight, widgetProviders, fittedGeometry, selectedWorkArea, monitorFit, workAreaMonitor, historyHeight } from './sizing.js';
import { hiddenStates } from './themes/dot-matrix/render.js';
import { repairTextContrast } from './text-contrast.js';
import { startupFailure } from './live-startup.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { mountProviders } from './themes/shared/providers.js';
import './themes/shared/chrome.css';
import { loadTheme, allThemes } from './themes/registry.js';
import defaultSample from './sample-snapshot.json';
import providerSample from './sample-providers-a1.json';
const widgetId = new URLSearchParams(location.search).get('widget') || 'main';
const storageKey = key => widgetId === 'main' ? key : `${key}:${widgetId}`;
const sample = new URLSearchParams(location.search).get('sample') === 'a1' ? providerSample : defaultSample;
let quoteData = null;
let quoteKey = null;
let quoteBusy = false;
async function updateQuote() {
  if (settings.quoteEnabled !== true) { quoteData = null; quoteKey = null; return; }
  const key = new Date().toLocaleDateString() + settings.quoteMode;
  if (quoteKey === key || quoteBusy) return;
  quoteBusy = true;
  try { quoteData = isSample ? sampleQuote : await loadQuote(settings, invoke); quoteKey = key; }
  catch { quoteData = {status:"offline",cards:[]}; }
  finally { quoteBusy = false; draw(currentSnapshot,currentNoData); }
}
let theme;
let renderSnapshot;
let themeRequest = 0;
const themeStyle = document.createElement('style');
themeStyle.id = 'active-theme';
document.head.append(themeStyle);
// Wayland does not expose layer-bottom occlusion. Avoid continuous animation
// even if the compositor keeps the document's visibility state as visible.
const motionStyle = document.createElement('style');
motionStyle.textContent = ':root:not([data-reactor-motion=true]) *::before,:root:not([data-reactor-motion=true]) *::after,:root:not([data-reactor-motion=true]) *{animation:none!important} @media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}';
document.head.append(motionStyle);
import { invoke } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';
const unlisteners = [];
let meterObserver;
let disposed = false;
const domEvents = new AbortController();
async function subscribe(name, handler) {
  const options = ['settings-preview', 'monitor-scale'].includes(name)
    ? { target: { kind: 'Window', label: getCurrentWindow().label } } : undefined;
  const unlisten = await listen(name, handler, options);
  if (disposed) unlisten(); else unlisteners.push(unlisten);
}
let pollTimer;
function dispose() {
  usageFit.disconnect();
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
const historyState = {};
let settings = { ...historyDefaults, quoteEnabled:false, quoteMode:'qotd', quotePosition:'bottom', quoteNavigation:true, theme: 'system', appearance: 'auto', colorMode: 'calm', dotCount: 20, matchPhysicalSize: false, accentEdge: 'off', taskbar: { ...defaultTaskbar }, palette: 'default', accent: null, background: null, widgetOpacity: 100, backgroundOpacity: 100, showExtraWindows: false, fitHeight: true, scale: 100, position: 'Top right' };
try { settings.showExtraWindows = localStorage.getItem(storageKey('showExtraWindows')) === 'true'; } catch {}
let shapePage = 0;
let currentSnapshot = null;
let currentNoData = false;
let desktopInfo = null;
let monitorScale = 1;
let placementMonitors = [];
let layoutScale = 100;
function renderSettings() { return $('#provider-onboarding').hidden ? settings : {...settings, shape:'portrait', quoteEnabled:false, sizeMode:'fixed', fitHeight:true}; }
function layoutMonitor() {
  return selectedWorkArea(placementMonitors,renderSettings()) || {width:window.screen.availWidth,height:window.screen.availHeight,scale:1};
}
function availableLayout() {
  const platform=desktopInfo?.platform || 'linux';
  const monitor=layoutMonitor();
  const fit=monitorFit(renderSettings(),1,workAreaMonitor(monitor,renderSettings(),platform),platform);
  const unit=platform==='windows' ? monitor.scale || 1 : 1;
  return {width:fit.availableWidth/unit,height:fit.availableHeight/unit};
}
function inlineHistoryExtra() {
  if (!settings.historyEnabled || !document.querySelector('.usage-history')) return 0;
  return settings.historyMode==='under' ? 160 : 200;
}
function updateLayoutScale(count) {
  if (!$('#provider-onboarding').hidden) count=3;
  const monitor=layoutMonitor();
  const unit=desktopInfo?.platform==='windows' ? monitor.scale || 1 : 1;
  const extra=inlineHistoryExtra();
  const geometry = placementMonitors.length ? fittedGeometry(renderSettings(),count,{...monitor,height:Math.max(1,monitor.height-extra*unit)},desktopInfo?.platform || 'linux') : null;
  layoutScale=geometry ? geometry.scale : settings.scale;
  const effective=layoutScale/(settings.matchPhysicalSize && effectiveSizeMode(renderSettings())!=='screen' ? monitorScale : 1);
  document.documentElement.style.setProperty('--ui-scale',effective/100);
  const baseHeight = widgetHeight(renderSettings(),count)*effective/100;
  const fitted=historyHeight(baseHeight,extra,availableLayout().height);
  const heightLimit=document.querySelector('.history-panel') ? historyHeight(baseHeight,Math.max(0,560-baseHeight),availableLayout().height).height : fitted.height;
  $('#widget').style.setProperty('--history-extra-height', `${fitted.history}px`);
  $('#widget').classList.toggle('has-inline-history',extra>0);
  const cards=[...$('#providers').querySelectorAll('.provider-card')];
  $('#widget').style.setProperty('--history-rows',cards.map(card=>`minmax(0,${card.querySelector('.usage-history') ? (settings.historyMode==='under'?1.35:2) : 1}fr)`).join(' '));
  document.documentElement.style.setProperty('--portrait-height-limit', `${heightLimit}px`);
  document.documentElement.style.setProperty('--widget-height', `${heightLimit}px`);
  document.documentElement.style.fontSize=`${16*effective/100}px`;
  document.documentElement.dataset.microShape=String(effective<65);
  document.documentElement.dataset.readableSize=String(effective>=84.99);
  document.documentElement.dataset.portraitFit=String(effectiveSizeMode(renderSettings()) === 'screen');
  document.documentElement.style.setProperty('--shape-min-font',effective>=84.99?'11px':'9px');
  updateNarrowViewport();
}
async function refreshWorkArea() {
  const geometry=await invoke('get_placement_monitors', { widgetId });
  placementMonitors=geometry.monitors;
  applySettings();
}

document.querySelector('#app').innerHTML = `
  <main class="widget" id="widget">
    <header class="header"><div class="title-block"><div class="app-title">AI USAGE</div><div class="sync-line"><i class="beacon"></i><span id="updated">WAITING FOR DATA</span></div></div><button class="gear" id="gear" aria-label="Settings">⚙</button></header>
    <section id="provider-onboarding" hidden></section><div class="provider-list" id="providers"></div><p id="runtime-error" role="alert" hidden style="color:var(--textPrimary);font-size:var(--size-font-small);overflow-wrap:anywhere"></p>
    <nav class="shape-pages" aria-label="Provider pages" hidden></nav>
    <section class="quote-section" id="quote" hidden aria-label="Daily quote"></section>
    <footer class="footer"><span>AI USAGE</span><span>SYSTEM</span></footer>
    <nav class="context-menu" id="context-menu" hidden><button id="refresh">Refresh now</button><button id="menu-settings">Settings</button></nav>
    <div class="toast" id="toast" hidden></div>
  </main>`;

const $ = selector => document.querySelector(selector);
function updateNarrowViewport() {
  // Container font-relative queries can retain a previous scale during resize.
  const unit = parseFloat(getComputedStyle(document.documentElement).fontSize);
  document.documentElement.dataset.narrowViewport = String($('#app').clientWidth < 18 * unit);
}
function applySettings() {
  if (!theme) return;
  settings = normalizeSize(settings);
  document.documentElement.dataset.shape = $('#provider-onboarding').hidden ? settings.shape : 'portrait';
  document.documentElement.dataset.smallSize = String(settings.sizePreset === 'Small');
  document.documentElement.dataset.reactorMotion = String(settings.reactorMotion === true && !document.hidden);
  document.documentElement.dataset.largeShape = String(settings.scale >= 120);
  document.documentElement.style.setProperty('--shape-min-font', '11px');
  applyAppearance(settings, theme, systemAppearance.matches);
  settings.dotCount = [10,20,30].includes(Number(settings.dotCount)) ? Number(settings.dotCount) : 20;
  document.documentElement.dataset.dotCount = settings.dotCount;
  updateLayoutScale(Math.max(1,$('#providers').querySelectorAll('.provider-card').length));
  const effectiveScale = layoutScale / (settings.matchPhysicalSize && effectiveSizeMode(renderSettings())!=='screen' ? monitorScale : 1);
  document.documentElement.dataset.microShape = String(effectiveScale < 65);
  document.documentElement.style.setProperty('--widget-opacity', settings.widgetOpacity / 100);
  document.documentElement.style.setProperty('--background-opacity', settings.backgroundOpacity / 100);
  document.documentElement.style.setProperty('--ui-scale', effectiveScale / 100);
  document.documentElement.style.fontSize = `${16 * effectiveScale / 100}px`;
  updateNarrowViewport();
  document.documentElement.classList.toggle('fit-height', Boolean((settings.fitHeight || effectiveSizeMode(settings) === 'screen') && settings.shape === 'portrait')); lastFitHeight = 0;
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
  $('#runtime-error').hidden = true;
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
    const allProviders = orderedProviders((visible?.providers || []).filter(p => !hiddenStates.has(String(p.state).toUpperCase())), settings);
    const pages = settings.shape === 'square' ? Math.ceil(allProviders.length / 4) : 1;
    shapePage = Math.min(shapePage, Math.max(0, pages - 1));
    const round = ['circle','pill'].includes(settings.shape);
    const selectedProviders = round ? widgetProviders(allProviders, settings.widgetProviders) : allProviders;
    const paged = round ? {...visible,providers:selectedProviders} : pages > 1 ? {...visible, providers:allProviders.slice(shapePage*4, shapePage*4+4)} : {...visible,providers:allProviders};
    const pageNav = $('.shape-pages'); pageNav.hidden = pages <= 1; pageNav.replaceChildren();
    for (let page=0;page<pages && pages>1;page++) { const button=document.createElement('button'); button.textContent=`${page+1}`; button.setAttribute('aria-label', `Provider page ${page+1} of ${pages}`); button.setAttribute('aria-current', String(page===shapePage)); button.onclick=()=>{shapePage=page;draw(currentSnapshot,currentNoData);}; pageNav.append(button); }
    (settings.shape === 'square' ? createRenderer(settings.theme) : round ? (root,snapshot)=>renderRound(root,snapshot,settings) : renderSnapshot)($('#providers'), paged, { noData, showExtraWindows: settings.showExtraWindows });
    $('#providers').querySelectorAll('.provider-card').forEach((card,i) => {
      const index=providerIndex(paged.providers[i],i);
      card.style.setProperty('--provider-identity',`var(--provider-${index})`);
      card.dataset.identity=index;
    });
    const historyOpen = mountHistory($('#widget'), $('#providers'), paged.providers || [], settings, historyState, () => draw(currentSnapshot,currentNoData), open => { settings.historyPanelOpen=open; persist(); draw(currentSnapshot,currentNoData); });
    document.documentElement.dataset.historyOpen = String(historyOpen);
    arrangeCards($('#providers'), paged.providers || [], settings);
    $('#updated').textContent = snapshot?.generated_at ? `SYNC ${new Date(snapshot.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'NO DATA YET';
    const count = round ? selectedProviders.length : $('#providers').querySelectorAll('.provider-card').length;
    $('#widget').style.setProperty('--provider-count', Math.max(1,count));
    document.documentElement.dataset.denseShape = String(settings.shape !== 'portrait' && (settings.shape === 'square' ? count > 1 : count > 3));
    $('#widget').style.setProperty('--shape-columns', settings.shape === 'square' ? (count > 1 ? 2 : 1) : Math.min(3, Math.max(1,count)));
    $('#widget').style.setProperty('--shape-rows', settings.shape === 'square' ? (count > 2 ? 2 : 1) : (count > 3 ? 2 : 1));
    updateLayoutScale(count);
    const baseWidth = widgetWidth(renderSettings(),count) * layoutScale / 100 / (settings.matchPhysicalSize && effectiveSizeMode(renderSettings())!=='screen' ? monitorScale : 1);
    const availableWidth = availableLayout().width;
    const geometry = historyOpen ? historyGeometry(baseWidth,availableWidth,layoutScale) : {panel:0,width:baseWidth};
    const panelWidth = geometry.panel;
    const width = geometry.width;
    $('#widget').style.setProperty('--history-panel-width', `${panelWidth}px`);
    if (isSample && (historyOpen || placementMonitors.length)) $('#app').style.width = `${width}px`; else $('#app').style.removeProperty('width');
    const maxHeight = parseFloat(document.documentElement.style.getPropertyValue('--portrait-height-limit'));
    if (!isSample) invoke('resize_widget', {scale:layoutScale,widthCssPx:width,maxHeightCssPx:maxHeight,onboarding:!$('#provider-onboarding').hidden || historyOpen,cornerRadiusCssPx:(() => {
      const widget = $('#widget');
      const {width,height} = widget.getBoundingClientRect();
      const radii = getComputedStyle(widget).borderTopLeftRadius.trim().split(/\s+/);
      const pixels = [radii[0],radii[1] ?? radii[0]].map((value,index) =>
        value.endsWith('%') ? parseFloat(value) / 100 * (index ? height : width) : parseFloat(value));
      return Math.max(0,Math.min(width / 2,height / 2,...pixels.map(value => Number.isFinite(value) ? value : 0)));
    })()}).catch(error=>showToast(String(error)));
    renderQuote($('#quote'),renderSettings(),quoteData,()=>draw(currentSnapshot,currentNoData),repairTextContrast);
    updateQuote();
    repairTextContrast($('#widget'));
    usageFit.refresh();
    requestFit();
    if (!isSample) {
      console.debug('snapshot-rendered', snapshot?.generated_at);
      invoke('snapshot_rendered', { generatedAt: snapshot?.generated_at || 'none' }).catch(() => {});
    }
  });
}
const usageFit = observeUsageFit($('#providers'));
let fitObserver;
let lastFitHeight = 0;
let fitPending = false;
async function requestFit() {
  // Every native window uses the same theme-independent geometry as its shell.
  if (fitPending || document.hidden) return;
  fitPending = true;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  fitPending = false;
  if (disposed) return;
  const count = $('#providers').querySelectorAll('.provider-card').length;
  const contentHeight = widgetHeight(renderSettings(),$('#provider-onboarding').hidden ? count : 3) * layoutScale / 100 / (settings.matchPhysicalSize && effectiveSizeMode(renderSettings())!=='screen' ? monitorScale : 1);
  const extra=inlineHistoryExtra();
  const height = historyHeight(contentHeight,document.querySelector('.history-panel') ? Math.max(0,560-contentHeight) : extra,availableLayout().height).height;
  document.documentElement.style.setProperty('--widget-height', `${height}px`);
  document.documentElement.style.setProperty('--portrait-height-limit', `${height}px`);
  $('#widget').style.maxHeight=`${availableLayout().height}px`;
  if (isSample) return;
  if (Math.abs(height - lastFitHeight) < 2) return;
  lastFitHeight = height;
  invoke('fit_window_height', { heightCssPx: height }).catch(() => {});
}
function currentSample() {
  const now = Date.now();
  return { ...sample, generated_at: new Date(now).toISOString(), providers: sample.providers.map(provider => ({ ...provider, windows: (provider.windows || []).map(window => ({ ...window, resets_at: Number.isFinite(window.resets_in_minutes) ? new Date(now + window.resets_in_minutes * 60000).toISOString() : null })) })) };
}
async function persist() { if (!isSample) try { localStorage.setItem(storageKey('widgetTheme'), settings.theme); localStorage.setItem(storageKey('widgetLook'), JSON.stringify({ colorMode: settings.colorMode, accentEdge: settings.accentEdge, dotCount: settings.dotCount, matchPhysicalSize: settings.matchPhysicalSize })); } catch {} if (!isSample) try { await invoke('save_settings', { settings, widgetId }); } catch (error) { showToast(String(error)); } }
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
  if (!paletteChoices(theme, settings)[settings.palette]) settings.palette = Object.keys(theme.palettes)[0];
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

let initialSettingsError = null;
if (!isSample) {
  try { settings = {...settings, ...normalizeSize(await invoke('load_settings', { widgetId }), true)}; }
  catch (error) { initialSettingsError = error; }
}
const initialOverrides = {accent:settings.accent, background:settings.background};
await activateTheme(settings.theme);
Object.assign(settings, initialOverrides); applySettings();
$('#widget').addEventListener('pointerdown', event => { if (event.button === 0 && settings.lockPosition === false && (['circle','pill'].includes(settings.shape) || event.target.closest('.header')) && !event.target.closest('button') && !isSample) getCurrentWindow().startDragging().catch(() => showToast('Use the monitor map to place this widget.')); }, { signal: domEvents.signal });
let lastTier;
meterObserver = new ResizeObserver(() => { updateNarrowViewport(); const tier = $('#app').clientWidth < 220 * parseFloat(getComputedStyle(document.documentElement).fontSize) / 16; if (tier !== lastTier) { lastTier = tier; if (currentSnapshot || currentNoData) draw(currentSnapshot,currentNoData); } });
meterObserver.observe($('#app'));
fitObserver = new ResizeObserver(requestFit); fitObserver.observe($('#widget')); window.addEventListener('keydown', async event => { if (!event.ctrlKey || event.altKey || event.metaKey) return; if (event.key === ',') {event.preventDefault();openSettings();return;} const key=effectiveSizeMode(settings)==='screen'?'fitFineTune':'fineTune',value=Number(settings[key] ?? 100); if (event.key === '+' || event.key === '=') settings[key] = Math.min(150, value + 5); else if (event.key === '-') settings[key] = Math.max(50, value - 5); else if (event.key === '0') settings[key] = 100; else return; event.preventDefault(); applySettings(); requestFit(); await persist(); }, { signal: domEvents.signal });
if (isSample) draw(currentSample());
else {
  try {
    if (initialSettingsError) throw initialSettingsError;
    await subscribe('monitor-scale', event => { const factor = Number(event.payload); if (factor > 0 && factor !== monitorScale) { monitorScale = factor; refreshWorkArea().catch(error=>showToast(String(error))); } });
    monitorScale = await invoke('get_monitor_scale');
    desktopInfo = await invoke('get_desktop_info');
    await refreshWorkArea();
    await subscribe('monitors-changed',()=>refreshWorkArea().catch(error=>showToast(String(error))));
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
      applySettings();
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
      document.documentElement.dataset.reactorMotion = String(settings.reactorMotion === true && !document.hidden);
      clearInterval(pollTimer);
      if (document.hidden) {
        cancelAnimationFrame(drawFrame); drawFrame = 0;
        clearTimeout(toastTimer); $('#toast').hidden = true;
      } else {
        draw(currentSnapshot, currentNoData);
        recoverSnapshot(); updateQuote();
        pollTimer = setInterval(()=>{recoverSnapshot();updateQuote();}, 300000);
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
  } catch (error) {
    const failure = startupFailure(error, currentSnapshot);
    $('#runtime-error').textContent = failure.message;
    $('#runtime-error').hidden = false;
    draw(failure.snapshot, failure.noData);
    showToast(failure.message);
  }
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
      applySettings();
    if (!config.initialized) mountProviders($('#provider-onboarding'), config, save, () => { $('#provider-onboarding').hidden = true; $('#providers').hidden = false; applySettings(); });
  }
  window.__QUOTA_DOCS_READY__ = true;
}

if (isSample) window.__AI_USAGE_DEMO__ = { async setWorkArea(monitors,platform='linux') { desktopInfo={...desktopInfo,platform}; placementMonitors=monitors; applySettings(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }, async setSnapshot(snapshot, noData = false) { draw(snapshot, noData); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }, async setSettings(next) { if ('scale' in next && !('sizePreset' in next) && !('fineTune' in next)) next = normalizeSize(next); settings = {...settings,...next}; const overrides={accent:settings.accent,background:settings.background}; await activateTheme(settings.theme); Object.assign(settings,overrides); applySettings(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }, async setQuote(data) { quoteData=data; draw(currentSnapshot,currentNoData); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }, themes: await allThemes(), getSettings:()=>structuredClone(settings) };
