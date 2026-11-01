import './themes/dot-matrix/theme.css';
import { renderSnapshot } from './themes/dot-matrix/render.js';
import sample from './sample-snapshot.json';
import theme from './themes/dot-matrix/theme.json';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const isSample = new URLSearchParams(location.search).has('sample') || !('__TAURI_INTERNALS__' in window);
let settings = { palette: 'signal-orange', accent: null, background: null, widgetOpacity: 100, backgroundOpacity: 94, showExtraWindows: false, fitHeight: true, scale: 100, position: 'Top right' };
try { settings.showExtraWindows = localStorage.getItem('showExtraWindows') === 'true'; } catch {}
let currentSnapshot = null;

document.querySelector('#app').innerHTML = `
  <main class="widget" id="widget">
    <header class="header" data-tauri-drag-region><div class="title-block"><div class="app-title">AI QUOTA</div><div class="sync-line"><i class="beacon"></i><span id="updated">WAITING FOR DATA</span></div></div><button class="gear" id="gear" aria-label="Settings">⚙</button></header>
    <div class="provider-list" id="providers"></div>
    <footer class="footer"><span>QUOTA MONITOR</span><span>MATRIX//01</span></footer>
    <section class="settings" id="settings" hidden><header><strong>DISPLAY SETTINGS</strong><button id="close-settings" aria-label="Close">×</button></header><label>Palette<select id="palette"></select></label><label>Accent color<input id="accent" type="color"></label><label>Background color<input id="background" type="color"></label><label>Widget opacity <output id="widget-out"></output><input id="widget-opacity" type="range" min="20" max="100"></label><label>Background opacity <output id="background-out"></output><input id="background-opacity" type="range" min="0" max="100"></label><label>Scale <output id="scale-out"></output><input id="scale" type="range" min="50" max="300" step="1"></label><div class="scale-presets">${[['Small',75],['Normal',100],['Large',150],['Huge',200]].map(([label,value])=>`<button data-scale="${value}">${label}</button>`).join('')}</div><label>Position<select id="position"><option>Top right</option><option>Bottom right</option><option>Top left</option><option>Bottom left</option><option>Free</option></select></label><label class="toggle-setting">Fit height to content<input id="fit-height" type="checkbox"></label><label class="toggle-setting">Show extra windows<input id="show-extra-windows" type="checkbox"></label></section>
    <nav class="context-menu" id="context-menu" hidden><button id="refresh">Refresh now</button><button id="menu-settings">Settings</button></nav>
    <div class="toast" id="toast" hidden></div>
  </main>`;

const $ = (selector) => document.querySelector(selector);
function applySettings() {
  const palette = theme.palettes[settings.palette] || theme.palettes['signal-orange'];
  for (const [key, value] of Object.entries(palette)) if (key !== 'name' && key !== 'mode') document.documentElement.style.setProperty(`--${key}`, value);
  if (settings.accent) document.documentElement.style.setProperty('--accent', settings.accent);
  if (settings.background) document.documentElement.style.setProperty('--bg-widget', settings.background);
  document.documentElement.dataset.mode = palette.mode;
  document.documentElement.style.setProperty('--widget-opacity', settings.widgetOpacity / 100);
  document.documentElement.style.setProperty('--background-opacity', settings.backgroundOpacity / 100);
  document.documentElement.style.setProperty('--ui-scale', settings.scale / 100);
  document.querySelector('#app').style.zoom = String(settings.scale / 100);
  document.documentElement.classList.toggle('fit-height', Boolean(settings.fitHeight)); lastFitHeight = 0;
  $('#palette').value = settings.palette;
  $('#accent').value = settings.accent || palette.accent;
  $('#background').value = settings.background || palette.bgWidget;
  $('#widget-opacity').value = settings.widgetOpacity; $('#widget-out').value = `${settings.widgetOpacity}%`;
  $('#background-opacity').value = settings.backgroundOpacity; $('#background-out').value = `${settings.backgroundOpacity}%`;
  $('#show-extra-windows').checked = Boolean(settings.showExtraWindows);
  $('#scale').value = settings.scale; $('#scale-out').value = `${settings.scale}%`;
  $('#fit-height').checked = Boolean(settings.fitHeight); $('#position').value = settings.position;
  if (!isSample) invoke('resize_widget', { scale: settings.scale }).catch(() => {});
}
function draw(snapshot, noData = false) {
  currentSnapshot = snapshot;
  renderSnapshot($('#providers'), snapshot, { noData, showExtraWindows: settings.showExtraWindows });
  $('#updated').textContent = snapshot?.generated_at ? `SYNC ${new Date(snapshot.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'NO DATA YET';
  requestFit();
}
let fitObserver;
let lastFitHeight = 0;
async function requestFit() {
  // Measure the content's natural height (the widget is height:auto in fit mode), not the window.
  if (!settings.fitHeight || isSample) return;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const height = Math.ceil($('#widget').getBoundingClientRect().height);
  if (Math.abs(height - lastFitHeight) < 2) return;
  lastFitHeight = height;
  invoke('fit_window_height', { heightCssPx: height }).catch(() => {});
}
function currentSample() {
  const now = Date.now();
  return { ...sample, generated_at: new Date(now).toISOString(), providers: sample.providers.map(provider => ({ ...provider, windows: (provider.windows || []).map(window => ({ ...window, resets_at: Number.isFinite(window.resets_in_minutes) ? new Date(now + window.resets_in_minutes * 60000).toISOString() : null })) })) };
}
async function persist() { if (!isSample) try { await invoke('save_settings', { settings }); } catch (error) { showToast(String(error)); } }
function showToast(message) { const el = $('#toast'); el.textContent = message; el.hidden = false; setTimeout(() => { el.hidden = true; }, 3200); }

for (const [id, item] of Object.entries(theme.palettes)) $('#palette').add(new Option(item.name, id));
$('#gear').onclick = () => { $('#settings').hidden = !$('#settings').hidden; };
$('#close-settings').onclick = () => { $('#settings').hidden = true; };
$('#palette').onchange = async (event) => { settings.palette = event.target.value; settings.accent = null; settings.background = null; applySettings(); await persist(); };
$('#accent').oninput = async (event) => { settings.accent = event.target.value; applySettings(); await persist(); };
$('#background').oninput = async (event) => { settings.background = event.target.value; applySettings(); await persist(); };
$('#widget-opacity').oninput = async (event) => { settings.widgetOpacity = Number(event.target.value); applySettings(); await persist(); };
$('#background-opacity').oninput = async (event) => { settings.backgroundOpacity = Number(event.target.value); applySettings(); await persist(); };
$('#show-extra-windows').onchange = async (event) => { settings.showExtraWindows = event.target.checked; try { localStorage.setItem('showExtraWindows', String(settings.showExtraWindows)); } catch {} draw(currentSnapshot); await persist(); };
$('#scale').oninput = async event => { settings.scale = Number(event.target.value); applySettings(); requestFit(); await persist(); };
document.querySelectorAll('[data-scale]').forEach(button => button.onclick = async () => { settings.scale = Number(button.dataset.scale); applySettings(); requestFit(); await persist(); });
$('#fit-height').onchange = async event => { settings.fitHeight = event.target.checked; if (settings.fitHeight) requestFit(); await persist(); };
$('#position').onchange = async event => { settings.position = event.target.value; if (!isSample) try { await invoke('snap_window', { corner: settings.position }); } catch (error) { showToast(String(error)); } await persist(); };
$('#widget').addEventListener('contextmenu', event => { event.preventDefault(); $('#context-menu').hidden = false; $('#context-menu').style.left = `${event.clientX}px`; $('#context-menu').style.top = `${event.clientY}px`; });
document.addEventListener('click', event => { if (!event.target.closest('#context-menu')) $('#context-menu').hidden = true; });
$('#refresh').onclick = async () => { if (isSample) return draw(currentSample()); try { await invoke('refresh_now'); } catch (error) { showToast(String(error)); } };
$('#menu-settings').onclick = () => { $('#settings').hidden = false; };

applySettings();
fitObserver = new ResizeObserver(requestFit); fitObserver.observe($('#widget')); window.addEventListener('keydown', async event => { if (!event.ctrlKey || event.altKey || event.metaKey) return; if (event.key === '+' || event.key === '=') settings.scale = Math.min(300, settings.scale + 10); else if (event.key === '-') settings.scale = Math.max(50, settings.scale - 10); else if (event.key === '0') settings.scale = 100; else return; event.preventDefault(); applySettings(); requestFit(); await persist(); });
if (isSample) draw(currentSample());
else {
  try {
    settings = { ...settings, ...(await invoke('load_settings')) }; applySettings();
    const initial = await invoke('get_snapshot'); draw(initial.snapshot, !initial.snapshot);
    await listen('snapshot', event => draw(event.payload.snapshot, !event.payload.snapshot));
    await listen('refresh-error', event => showToast(event.payload));
  } catch (error) { draw(sample, true); showToast(`Unable to load quota data: ${error}`); }
}

