import {historyDefaults, splitMachines} from './history.js';
import historySample from './sample-providers-a1.json';
import './settings.css';

import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';

import sampleSnapshot from './sample-snapshot.json';
import {applyLimits, normalizeLimitVisibility, providerPools} from './limits.js';
import {orderedProviders} from './provider-layout.js';
import {quotePrivacy} from './quote.js';
import {differingKeys, equalSettings} from './settings-compare.js';
import {layoutControls} from './settings-layout.js';
import {settingsMarkup} from './settings-markup.js';
import {settingsCategories, mountNavigation, decorateRows, decorateGroups} from './settings-navigation.js';
import {effectiveWidget, splitWidget, widgetChangeCount} from './settings-widgets.js';
import {mountWidgetPicker} from './settings-widget-picker.js';
import {version} from '../package.json';
import {
  effectiveSizeMode,
  fittedGeometry,
  normalizeSize,
  selectedWorkArea,
  shapes,
  widgetHeight,
  widgetProviders,
  widgetWidth,
  workAreaMonitor
} from './sizing.js';
import {contrast, luminance, rgba} from './text-contrast.js';
import {hiddenStates, pctOf, providerNames, shortWindowLabel} from './themes/dot-matrix/render.js';
import {allThemes} from './themes/registry.js';
import {paletteChoices, selectedPalette, userPalettes, appearancePalette} from './user-palettes.js';
import {paletteEditor} from './palette-editor.js';
const themes = await allThemes();
import {
  providerColors,
  providerColorWarnings,
  providerIds
} from './themes/shared/identity.js';
import {mountProviders} from './themes/shared/providers.js';

const sample = new URLSearchParams(location.search).has('sample') ||
               !window.__TAURI_INTERNALS__;
const $ = selector => document.querySelector(selector);
function normalizePlacement(value) {
  const result = {
    ...value,
    xRatio : value.x_ratio ?? value.xRatio ?? 1,
    yRatio : value.y_ratio ?? value.yRatio ?? 0
  };
  delete result.x_ratio;
  delete result.y_ratio;
  return result;
}
export const defaults = {
  ...historyDefaults,
  sizeMode : "fixed",
  fitFraction : 1,
  fitFineTune : 100,
  reservedTop : null,
  reservedBottom : null,
  featuredProvider : 'first',
  featuredPosition : 'bottom',
  reactorMotion : false,
  quoteEnabled : false,
  quoteMode : 'qotd',
  quotePosition : 'bottom',
  quoteNavigation : true,
  theme : 'system',
  shape : 'portrait',
  appearance : 'auto',
  colorMode : 'calm',
  dotCount : 20,
  matchPhysicalSize : false,
  accentEdge : 'off',
  palette : 'default',
  userPalettes : [],
  accent : null,
  background : null,
  widgetOpacity : 100,
  backgroundOpacity : 100,
  scale : 100,
  fitHeight : true,
  position : 'Top right',
  placementEditing : false,
  lockPosition : true,
  showExtraWindows : false,
  limitVisibility : {},
  separatePools : false,
  taskbar : {
    colorMode : 'calm', dotCount : 20, offsetX : 0,
    enabled : false,
    providers : [ 'claude', 'codex', 'gemini' ],
    window : 'session',
    showBars : false,
    style : 'transparent',
    theme : 'auto'
  },
  linux : {layer : 'bottom', margin : 12, monitor : null},
  placement : {
    monitor : null,
    xRatio : 1,
    yRatio : 0,
    snap : 'off',
    disconnected : 'primary',
    fallbackMonitor : null
  }
};
let rootDraft, selectedWidget = 'main';
let draft = structuredClone(defaults), saved, providers, savedProviders,
    autostart = false, savedAutostart = false, closing = false, saving = false,
    positionBefore = null;
const abort = new AbortController(), stops = [];
let disposed = false, previewRunning = false, previewPending = new Map();
function errorText(value) {
  return value instanceof Error      ? value.message
         : typeof value === 'object' ? JSON.stringify(value)
                                     : String(value);
}
let saveMessage = '', saveFailure = '';
function error(message) {
  saveFailure = message ? errorText(message) : '';
  mark();
}
async function settingsInvoke(command, args) {
  try {
    return await invoke(command, args);
  } catch (cause) {
    const failure =
        new Error(`Settings command ${command} failed: ${errorText(cause)}`);
    error(failure);
    throw failure;
  }
}

let previewWork = Promise.resolve();
function preview(widgetId = selectedWidget, settings = draft) {
  // One worker drains the latest value; closing/reverting waits for the drain.
  previewPending.set(widgetId, {
    settings: {...structuredClone(settings), providerPreview: structuredClone(providers ?? [])},
    widgetId, rootSettings: structuredClone(rootDraft)
  });
  if (previewRunning)
    return previewWork;
  previewRunning = true;
  previewWork = (async () => {
    try {
      while (previewPending.size && !disposed) {
        const [id, value] = previewPending.entries().next().value;
        previewPending.delete(id);
        if (!sample)
          await settingsInvoke('preview_settings', value);
      }
    } catch (e) {
      error(e);
      throw e;
    } finally {
      previewRunning = false;
    }
  })();
  return previewWork;
}

function changed() {
  return !!saved && (!equalSettings(rootDraft, saved) ||
                     !equalSettings(providers, savedProviders) ||
                     autostart !== savedAutostart || historyChanges() > 0);
}
function mark() {
  const count = saved ? widgetChangeCount(rootDraft, saved) +
      Number(!equalSettings(providers, savedProviders)) +
      Number(autostart !== savedAutostart) + historyChanges() : 0;
  const dirty = count > 0;
  if (dirty)
    saveMessage = '';
  $('#revert').disabled = saving || !dirty;
  $('#save').disabled = saving || !dirty;
  const status = $('#status');
  status.textContent =
      saving
          ? 'Saving…'
          : saveFailure ||
                (dirty ? `${count} unsaved changes`
                       : saveMessage || 'Changes preview live on the widget');
  status.dataset.state = saving        ? 'saving'
                         : saveFailure ? 'failure'
                         : dirty       ? 'dirty'
                         : saveMessage ? 'success'
                                       : 'clean';
  document.title = `AI Usage · Settings${dirty ? ' · Unsaved changes' : ''}`;
  if (!sample)
    getCurrentWindow().setTitle(document.title).catch(() => {});
}
function normalizeDraft(value) {
  const normalized = normalizeSize(value);
  normalized.limitVisibility = normalizeLimitVisibility(normalized.limitVisibility);
  normalized.separatePools = normalized.separatePools === true;
  if (selectedWidget === 'main') normalized.taskbar = {...normalized.taskbar, colorMode:normalized.colorMode, dotCount:normalized.dotCount};
  return normalized;
}
function update() {
  draft = normalizeDraft(draft);
  rootDraft = splitWidget(rootDraft, selectedWidget, draft);
  draft = effectiveWidget(rootDraft, selectedWidget);
  renderControls();
  mark();
  preview().catch(() => {});
}
const groups = settingsCategories;
document.querySelector('#app')
    .innerHTML = `<div class="settings-shell"><nav role="tablist" aria-orientation="vertical" aria-label="Settings categories">${
    groups
        .map(([ id, label, icon ]) => `<button id="tab-${id}" role="tab" type="button" data-category="${id}" aria-controls="category-${id}" aria-selected="false" tabindex="-1"><span aria-hidden="true">${icon}</span>${label}</button>`)
        .join('')}</nav><main class="settings-content">${
    settingsMarkup}</main><div id="close-prompt" hidden role="alert"><strong>Save changes?</strong><button id="close-save">Save</button><button id="close-discard">Discard</button><button id="close-cancel">Cancel</button></div><footer class="settings-actions"><span id="status" role="status"></span><button id="revert">Revert</button><button class="primary" id="save">Save</button></footer></div>`;
const panel = $('#settings');
panel.inert = true;
$('#save').disabled = true;
$('#revert').disabled = true;
panel.hidden = false;
panel.querySelector('header').remove();
const sections = Object.fromEntries(groups.map(([ id, label ]) => {
  const section = document.createElement('section');
  section.id = `category-${id}`;
  section.hidden = true;
  section.setAttribute('role', 'tabpanel');
  section.setAttribute('aria-labelledby', `tab-${id}`);
  const h = document.createElement('h1');
  h.textContent = label;
  section.append(h);
  panel.append(section);
  return [ id, section ];
}));
// Temporary containers let the existing controls keep their construction order.
for (const id of ['layout', 'position', 'quote-content', 'desktop']) {
  sections[id] = document.createElement('section');
  if (id === 'layout') sections[id].append(document.createElement('h1'));
  panel.append(sections[id]);
}
const move = (id, category) => {
  const el = $(`#${id}`);
  if (el)
    sections[category].append(el.closest('label') || el);
};
sections.providers.append($('#provider-settings').closest('fieldset'));
sections.about.append($('#runtime-diagnostics').closest('fieldset'));
sections.theme.append($('.theme-section'), $('.look-section'));
for (const id of ['appearance', 'palette', 'accent', 'background',
                  'widget-opacity', 'background-opacity'])
  move(id, 'colors');
for (const id of ['scale', 'position', 'fit-height', 'show-extra-windows'])
  move(id, 'layout');
sections.layout.append($('.scale-presets'));
sections.layout.insertAdjacentHTML(
    'beforeend',
    `<label>Size mode<select id="size-mode">
<option value="fixed">Fixed size</option>
<option value="screen">Fit to screen</option>
</select>
</label>
<p class="setting-note">Portrait Fit enlarges content within the screen budget. The chosen share is a maximum; the widget ends where its content ends.</p><label>Screen fraction<select id="fit-fraction">
<option value="1">Full</option>
<option value="0.75">3/4</option>
<option value="0.5">1/2</option>
<option value="${
        1 /
        3}">1/3</option></select></label><label>Screen fine-tune <output id="fit-fine-tune-out"></output><input id="fit-fine-tune" type="range" min="50" max="150" step="1"></label><label>Reserved top (px)<input id="reserved-top" type="number" min="0" max="1000" placeholder="Auto"></label><label>Reserved bottom (px)<input id="reserved-bottom" type="number" min="0" max="1000" placeholder="Auto"></label><p id="detected-area" class="setting-note"></p>`);

sections['quote-content'].innerHTML += `<label class="toggle-setting">Show daily quote<input id="quote-enabled" type="checkbox"></label><p class="setting-note">A short quote or 'on this day' note shown on the widget.</p><label>Mode<select id="quote-mode"><option value="qotd">Quote of the day</option><option value="born">Born on this day</option><option value="died">Died on this day</option><option value="on-this-day">On this day</option><option value="mixed">Mixed</option></select></label><label>Position<select id="quote-position"><option value="bottom">Bottom</option><option value="top">Top</option></select></label><label class="toggle-setting">Show quote navigation<input id="quote-navigation" type="checkbox"></label><p class="setting-note">${quotePrivacy}</p>`;
const shapePicker = document.createElement('fieldset');
shapePicker.className = 'shape-picker';
shapePicker.innerHTML =
    '<legend>Shape</legend>' +
    shapes
        .map(shape => `<button data-shape="${
                 shape}" aria-pressed="false"><i class="shape-silhouette ${
                 shape}" aria-hidden="true"></i>${
                 shape[0].toUpperCase() + shape.slice(1)}</button>`)
        .join('');
sections['shape-size'].append(shapePicker);
shapePicker.querySelectorAll('button').forEach(
    button => button.onclick = () => {
      draft.shape = button.dataset.shape;
      update();
    });
const widgetChoices = document.createElement('fieldset');
widgetChoices.id = 'widget-provider-choices';
shapePicker.after(widgetChoices);
move('start-at-login', 'about');
move('autostart-status', 'about');
sections.display.append($('#linux-settings'));
$('#linux-settings').hidden = false;
sections.taskbar.append($('#taskbar-settings'));
for (const el of [...panel.children])
  if (el.tagName !== 'SECTION')
    el.remove();
const oldPalette = $('#palette');
oldPalette.closest('label').hidden = true;
const paletteGrid = document.createElement('div');
paletteGrid.id = 'palette-grid';
paletteGrid.setAttribute('aria-label', 'Palette');
sections.colors.append(paletteGrid);
for (const key of ['accent', 'background']) {
  const reset = document.createElement('button');
  reset.textContent = 'Reset to palette';
  reset.onclick = () => {
    draft[key] = null;
    update();
  };
  $(`#${key}`).after(reset);
}
sections.layout.insertAdjacentHTML(
    'beforeend',
    `<label class="toggle-setting">Lock position<input id="lock-position" type="checkbox">
</label>
<button id="place">Place widget</button>
<p class="setting-note">Drag the widget on the map, then accept the position. Changes preview live; Save keeps them. Ratios use the available work area.</p>
<label>Monitor<select id="placement-monitor">
</select>
</label>
<label>Snap<select id="snap">
<option value="off">Off</option>
<option value="edges">Edges &amp; center</option>
<option value="grid">Grid (8 px)</option>
</select>
</label>
<div id="monitor-map" aria-label="Monitor work area">
<button id="map-widget" aria-label="Widget position. Use arrow keys to move.">Widget</button>
</div>
<p id="size-fit-warning" class="setting-note" role="status" hidden>
</p>
<div id="placement-presets">
</div>
<div id="placement-actions" hidden>
<button id="save-position">Use position</button>
<button id="cancel-position">Cancel</button>
</div>
<label>When monitor is disconnected<select id="disconnected">
<option value="primary">Move to primary monitor</option>
<option value="monitor">Move to monitor</option>
<option value="hide">Hide until it returns</option>
</select>
</label>
<label>Fallback monitor<select id="fallback-monitor">
</select>
</label>`);
for (const [label, x, y] of [[ 'Top left', 0, 0 ], [ 'Top center', .5, 0 ],
                             [ 'Top right', 1, 0 ], [ 'Bottom left', 0, 1 ],
                             [ 'Bottom center', .5, 1 ],
                             [ 'Bottom right', 1, 1 ], [ 'Center', .5, .5 ]]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.onclick = () => {
    draft.position =
        [ 'Top left', 'Top right', 'Bottom left', 'Bottom right' ].includes(
            label)
            ? label
            : 'Free';
    Object.assign(draft.placement, {xRatio : x, yRatio : y});
    update();
  };
  $('#placement-presets').append(button);
}
// Arrange each page from frequent choices to contextual detail.
function sectionBlock(parent, title, elements) {
  const block = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  block.append(legend, ...elements.filter(Boolean));
  parent.append(block);
  return block;
}
const control = id => {
  const element = $(`#${id}`);
  if (!element) throw Error(`Missing settings control: ${id}`);
  return element.closest('label');
};
const sizes = $('.scale-presets');
for (const button of sizes.querySelectorAll('button'))
  button.insertAdjacentHTML('beforeend', '<span class="size-hint"></span>');
sizes.insertAdjacentHTML(
    'beforeend',
    '<button id="fit-screen" aria-pressed="false">Fit screen<small></small></button>');
$('#fit-screen').onclick = () => {
  draft.sizeMode = 'screen';
  update();
};
$('#size-mode').closest('label').hidden = true;
sections['shape-size'].append(sizes);
sizes.after($('#size-fit-warning'));
const sizeChoices = sectionBlock(sections['shape-size'], 'Size', [sizes, $('#size-fit-warning')]);
const placementNote = [...sections.layout.querySelectorAll('p')].find(p => p.textContent.startsWith('Drag the widget'));
if (placementNote) sections.position.append(placementNote);
control('position').hidden = true;
sections.position.append(
    $('#monitor-map'), $('#placement-presets'), $('#placement-actions'),
    $('#place'), control('lock-position'), control('placement-monitor'),
    control('snap'), control('disconnected'), control('fallback-monitor'));
if (placementNote) $('#placement-presets').after(placementNote);
const advanced = document.createElement('details');
advanced.innerHTML = '<summary>Advanced</summary>';
advanced.append(control('reserved-top'), control('reserved-bottom'),
                $('#detected-area'));
sections.position.append(advanced, control('position'));
sections.about.insertBefore(control('start-at-login'),
                            sections.about.children[1]);
sections.about.insertBefore(control('show-extra-windows'),
                            sections.about.children[2]);
sizeChoices.append(control('scale'), control('fit-height'),
                       control('match-physical-size'), control('fit-fraction'),
                       control('fit-fine-tune'));
const fineReset = document.createElement('button');
fineReset.id = 'reset-fine-tune';
fineReset.textContent = 'Reset fine-tune';
fineReset.onclick = () => {
  draft[effectiveSizeMode(draft) === 'screen' ? 'fitFineTune' : 'fineTune'] = 100;
  update();
};
sections.layout.append(fineReset);
const fractions = document.createElement('div');
fractions.className = 'segmented';
for (const [label, value] of [[ 'Largest', 1 ], [ '3/4', .75 ], [ '1/2', .5 ],
                              [ '1/3', 1 / 3 ]]) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.fraction = value;
  button.onclick = () => {
    draft.fitFraction = value;
    update();
  };
  fractions.append(button);
}
control('fit-fraction').firstChild.textContent = 'Screen share';
$('#fit-fraction').hidden = true;
control('fit-fraction').append(fractions);
const themeSymbols = {
  reactor : '◎ ◉ ◎',
  system : '━━━━',
  'dot-matrix' : '••••••',
  'circular-rings' : '◉ ◎',
  terminal : '[▓▓░░]',
  'frosted-glass' : '▰ ▰',
  brutalist : '84%',
  'compact-strip' : '━ ━ ━',
  'retro-lcd' : '▮▮▮▯▯',
  'minimal-pace' : '──┊──',
  aurora:'▰▰▱', crisp:'▥ 72%', glyph:'⠿ 72', layer:'▱ ▰',
  'liquid-glass':'◉ ◌', pastel:'● ▬', pebble:'72%'
};
for (const theme of themes) {
  const button = document.createElement('button');
  button.dataset.theme = theme.id;
  button.innerHTML =
      '<span class="theme-preview" aria-hidden="true"></span><span></span>';
  button.firstChild.textContent = themeSymbols[theme.id];
  button.lastChild.textContent = theme.name;
  button.onclick = () => {
    draft.theme = theme.id;
    if (!userPalettes(draft).some(p => p.id === draft.palette)) draft.palette = Object.keys(theme.palettes)[0];
    draft.accent = null;
    draft.background = null;
    update();
  };
  $('#theme-picker').append(button);
}
const colorControls = document.createElement('fieldset');
colorControls.id = 'provider-colors';
colorControls.innerHTML =
    '<legend>Provider colors</legend><p class="setting-note">Colors identify providers in every shape. Mono uses patterns.</p>';
for (const id of providerIds) {
  const label = document.createElement('label');
  label.textContent = providerNames[id] || id;
  const input = document.createElement('input');
  input.type = 'color';
  input.dataset.providerColor = id;
  input.setAttribute('aria-label', (providerNames[id] || id) + ' color');
  input.oninput = () => {
    draft.providerColors = {...draft.providerColors, [id] : input.value};
    update();
  };
  const reset = document.createElement('button');
  reset.textContent = 'Reset to default';
  reset.onclick = () => {
    delete (draft.providerColors || {})[id];
    update();
  };
  label.append(input, reset);
  colorControls.append(label);
}
const colorWarning = document.createElement('p');
colorWarning.id = 'provider-color-warning';
colorWarning.className = 'setting-note';
colorWarning.setAttribute('role', 'status');
colorControls.append(colorWarning);
const mode = matchMedia('(prefers-color-scheme:light)');
function themePalette(t = themes.find(t => t.id === draft.theme) || themes[0],
                      key = draft.palette) {
  const p = selectedPalette(t, {...draft, palette:key});
  const appearance = draft.appearance === 'auto'
                         ? (mode.matches ? 'light' : 'dark')
                         : draft.appearance;
  return appearancePalette(p, appearance, key.startsWith('user-'));
}
// Palette samples retain their hue while keeping their glyphs readable.
function previewInk(ink, paper) {
  const foreground = rgba(ink), background = rgba(paper),
        target = luminance(background) > .179 ? 0 : 255;
  for (let step = 0; step <= 100; step++) {
    const value = foreground.slice(0, 3).map(
        v => Math.round(v + (target - v) * step / 100));
    if (contrast(value, background) >= 4.7)
      return `rgb(${value.join(',')})`;
  }
  return ink;
}
const renderLayout = layoutControls(sections.providers, () => draft,
                                    () => providers || [], update,
                                    () => snapshotProviders || []);
const limitsControls = document.createElement('fieldset');
limitsControls.id = 'limits-and-pools';
limitsControls.innerHTML =
    `<legend>Limits and pools</legend>
<p class="setting-note">Choose Automatic, Show or Hide for any quota pool. Stored choices for absent pools are kept.</p>
<div id="limit-pool-list"></div>
<div class="palette-actions" style="padding-block:12px">
  <button id="limits-show-all" type="button">Show everything</button>
  <button id="limits-reset-auto" type="button">Reset to automatic</button>
</div>
<label class="toggle-setting">Separate box for each pool<input id="separate-pools" type="checkbox"></label>`;
sections.providers.append(limitsControls);
$('#limits-show-all').onclick = () => {
  const next = {...normalizeLimitVisibility(draft.limitVisibility)};
  for (const [key, value] of Object.entries(next)) {
    if (value === false) delete next[key];
  }
  draft.limitVisibility = next;
  draft.showExtraWindows = true;
  update();
};
$('#limits-reset-auto').onclick = () => {
  draft.limitVisibility = {};
  draft.showExtraWindows = false;
  update();
};
const paletteTools = paletteEditor(() => draft, () => themes.find(t => t.id === draft.theme), update);
sectionBlock(sections.colors, 'Appearance', [ control('appearance') ]);
control('appearance').firstChild.textContent = 'Appearance';
sectionBlock(sections.colors, 'Palette', [ paletteGrid, paletteTools.element ]);
sectionBlock(sections.colors, 'Color mode', [ control('color-mode') ]);
sectionBlock(sections.colors, 'Colors', [
  control('accent'), control('background'), control('widget-opacity'),
  control('background-opacity'), control('accent-edge')
]);
sections.providers.append(colorControls);
sectionBlock(sections.theme, 'Theme details', [control('dot-count'), control('reactor-motion')]);
$('.look-section').remove();
$('.theme-section legend').classList.remove('sr-only');
$('.theme-section legend').textContent = 'Theme';
sectionBlock(sections.general, 'Startup', [control('start-at-login'), $('#autostart-status')]);
sectionBlock(sections.general, 'Widget content', [control('show-extra-windows')]);
sections.quote.append(...sections['quote-content'].children);
sections.layout.querySelector('h1').remove();
sections['shape-size'].append(...sections.layout.children);
sections.display.querySelector('h1').after(...sections.position.children);
sections.display.append(...sections.desktop.children);
for (const id of ['layout', 'position', 'quote-content', 'desktop']) {
  sections[id].remove();
  delete sections[id];
}
const historyControls = sectionBlock(sections.history, 'Usage history', []);
historyControls.insertAdjacentHTML('beforeend', `
<p class="setting-note" id="history-explanation">Usage history shows daily token usage from Claude Code local logs and Codex account data. History data stays on this computer. Enable Read Claude Code logs to let AI Usage read this computer's Claude Code session logs and count tokens. Read Antigravity CLI logs does the same for Antigravity CLI conversation logs; that log format is unofficial and may break.</p>
<label class="toggle-setting">Show usage history<input id="history-enabled" type="checkbox"></label>
<label class="toggle-setting">Read Claude Code logs<input id="local-history" type="checkbox"></label>
<label class="toggle-setting">Read Antigravity CLI logs<input id="local-history-gemini" type="checkbox"></label>
<label>Show history<select id="history-mode"><option value="under">Under each card</option><option value="card">Click a card</option><option value="panel">Side panel</option></select></label>
<label>Panel layout<select id="history-panel-layout"><option value="stacked">Stacked</option><option value="single">One at a time</option></select></label>
<figure id="history-preview" aria-label="Usage history preview"></figure>`);
const historyExtras = sectionBlock(sections.history, 'Extras', []);
historyExtras.insertAdjacentHTML('beforeend', `
<label class="toggle-setting">API price equivalent<input id="history-cost" type="checkbox"></label>
<label class="toggle-setting">Model breakdown<input id="history-models" type="checkbox"></label>
<label class="toggle-setting">Activity heatmap<input id="history-heatmap" type="checkbox"></label>
<label class="toggle-setting">Split by computer<input id="history-machines" type="checkbox" aria-describedby="history-machines-note"></label>
<p id="history-machines-note" class="setting-note">Shown only when 2+ computers are found</p>`);
// Log-reading permissions are saved through their own native command, one per provider.
const historyProviders = {claude : 'local-history', gemini : 'local-history-gemini'};
let localHistory = {claude : false, gemini : false}, savedLocalHistory = {...localHistory};
const localHistoryUnknown = new Set();
const historyChanges = () => Object.keys(historyProviders).filter(id => localHistory[id] !== savedLocalHistory[id]).length;
for (const [id, element] of Object.entries(historyProviders))
  $(`#${element}`).onchange = () => {localHistory[id]=$(`#${element}`).checked; mark();};
const aboutInfo = sectionBlock(sections.about, 'AI Usage', []);
sections.about.querySelector('h1').after(aboutInfo);
aboutInfo.insertAdjacentHTML('beforeend', `<p class="setting-note">Version <span id="app-version"></span></p><p class="setting-note" id="data-folder"></p>`);
$('#app-version').textContent = version;
const navigation = mountNavigation(sections);

function renderHistoryPreview() {
  const mode=draft.historyMode, stacked=draft.historyPanelLayout !== 'single';
  const chart='<div class="history-preview-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
  const card=label=>`<div class="history-preview-card"><b>${label}</b><small>Today 12K · 7d 84K</small>${chart}</div>`;
  const preview=$('#history-preview');
  preview.dataset.mode=mode;
  preview.dataset.layout=draft.historyPanelLayout || 'stacked';
  preview.innerHTML=`<figcaption>Example preview · fictional data${draft.historyEnabled ? '' : ' · history hidden'}</figcaption><div class="history-preview-scene">${mode === 'panel' ? `<div class="history-preview-widget"><b>AI Usage　‹ ⚙</b><p>Claude Code</p><p>OpenAI Codex</p></div><div class="history-preview-panel"><small>Today / 7 / 30 days</small>${stacked ? ['All tools','Claude Code','OpenAI Codex'].map(card).join('') : '<small>All tools ▾</small>'+card('All tools')}</div>` : mode === 'under' ? ['Claude Code','OpenAI Codex'].map(card).join('') : `<div class="history-preview-widget"><b>Click a card to expand</b>${card('Claude Code ▴')}<p>OpenAI Codex ▾</p></div>`}</div>`;
}

function renderLimitPools() {
  const list = $('#limit-pool-list');
  list.replaceChildren();
  const enabledIds = providers || [];
  const visibility = normalizeLimitVisibility(draft.limitVisibility);
  let count = 0;
  for (const provider of snapshotProviders || []) {
    if (!enabledIds.includes(provider.id)) continue;
    const pools = providerPools(provider);
    const provName = providerNames[provider.id] || provider.label || provider.id;
    for (const pool of pools) {
      count++;
      const row = document.createElement('label');
      row.className = 'setting-row';
      const copy = document.createElement('span');
      copy.className = 'setting-copy';
      const title = document.createElement('strong');
      const poolTitle = pool.id === 'main' ? `${provName} · Main` : `${provName} · ${pool.label}`;
      title.textContent = poolTitle;
      const summary = document.createElement('small');
      const percents = pool.windows
          .filter(w => pctOf(w) !== null)
          .map(w => `${shortWindowLabel(w, true)} ${Math.round(pctOf(w))}%`);
      summary.textContent = percents.length ? percents.join(' · ') : 'Usage unknown';
      copy.append(title, summary);
      const select = document.createElement('select');
      select.dataset.limitPool = pool.key;
      select.setAttribute('aria-label', `${poolTitle} visibility`);
      for (const [val, text] of [['auto', 'Automatic'], ['show', 'Show'], ['hide', 'Hide']]) {
        select.add(new Option(text, val));
      }
      const current = visibility[pool.key];
      select.value = current === true ? 'show' : current === false ? 'hide' : 'auto';
      select.onchange = () => {
        const next = {...normalizeLimitVisibility(draft.limitVisibility)};
        if (select.value === 'show') next[pool.key] = true;
        else if (select.value === 'hide') next[pool.key] = false;
        else delete next[pool.key];
        draft.limitVisibility = next;
        update();
      };
      row.append(copy, select);
      list.append(row);
    }
  }
  if (!count) {
    const empty = document.createElement('p');
    empty.className = 'setting-note';
    empty.textContent = 'Quota pools appear here once enabled providers report usage windows.';
    list.append(empty);
  }
}

function renderControls() {
  renderHistoryPreview();
  $('#history-panel-layout').disabled = draft.historyMode !== 'panel';
  for (const [id, element] of Object.entries(historyProviders))
    $(`#${element}`).checked = localHistory[id];
  $('#history-machines').disabled = !snapshotProviders.some(p => splitMachines(p.history,true));
  $('#history-machines-note').hidden = !$('#history-machines').disabled;
  renderLayout();
  renderLimitPools();
  control(effectiveSizeMode(draft)==='screen'?'fit-fine-tune':'scale').after(fineReset);
  document.querySelectorAll('[data-shape]')
      .forEach(b => b.setAttribute('aria-pressed',
                                   String(b.dataset.shape === draft.shape)));
  widgetChoices.hidden = !['circle', 'pill'].includes(draft.shape);
  widgetChoices.replaceChildren();
  const legend = document.createElement('legend');
  legend.textContent = 'Providers on this widget';
  widgetChoices.append(legend);
  const note = document.createElement('p');
  note.className = 'setting-note';
  note.textContent =
      'Choose up to 3. By default the first 3 enabled providers are shown.';
  widgetChoices.append(note);
  const activeSnap = (snapshotProviders || []).filter(p => (providers || []).includes(p.id) && !hiddenStates.has(String(p.state).toUpperCase()));
  const derivedChoices = draft.separatePools
      ? orderedProviders(applyLimits(activeSnap, draft), draft).map(p => [p.id, providerNames[p.id] || p.label || p.id])
      : [];
  const roundChoices = derivedChoices.length
      ? [...derivedChoices, ...(providers || []).filter(id => !derivedChoices.some(([cid]) => cid === id || cid.startsWith(`${id}~`))).map(id => [id, providerNames[id] || id])]
      : (providers || []).map(id => [id, providerNames[id] || id]);
  const choiceIds = roundChoices.map(([id]) => id);
  const selected = Array.isArray(draft.widgetProviders) ? draft.widgetProviders
                                                        : choiceIds.slice(0, 3);
  for (const [id, choiceLabel] of roundChoices) {
    const label = document.createElement('label'),
          input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.widgetProvider = id;
    input.checked = selected.includes(id);
    input.disabled = !input.checked && selected.filter(k => choiceIds.includes(k)).length >= 3;
    label.textContent = choiceLabel;
    label.append(input);
    widgetChoices.append(label);
    input.onchange = () => {
      draft.widgetProviders =
          choiceIds
              .filter(key =>
                          key === id ? input.checked : selected.includes(key))
              .slice(0, 3);
      update();
    };
  }
  $('#match-physical-size').disabled = effectiveSizeMode(draft) === 'screen';
  $('#fit-height').disabled =
      draft.shape !== 'portrait' || effectiveSizeMode(draft) === 'screen';
  for (const id of ['scale', 'fit-height'])
    $(`#${id}`).closest('label').hidden = effectiveSizeMode(draft) === 'screen';
  $('.scale-presets').hidden = false;
  $('#fit-screen').disabled = !['portrait','strip'].includes(draft.shape);
  $('#fit-screen').title = $('#fit-screen').disabled ? 'Portrait and Strip only' : '';
  $('#fit-screen')
      .setAttribute('aria-pressed', String(effectiveSizeMode(draft) === 'screen'));
  document.querySelectorAll('[data-fraction]')
      .forEach(button => button.setAttribute(
                   'aria-pressed', String(Number(button.dataset.fraction) ===
                                          draft.fitFraction)));
  $('#match-physical-size').closest('label').hidden =
      effectiveSizeMode(draft) === 'screen';
  $('#fit-height').closest('label').hidden =
      draft.shape !== 'portrait' || effectiveSizeMode(draft) === 'screen';
  $('#dot-count').closest('label').hidden =
      draft.theme === 'system' ||
      draft.shape === 'circle';
  $('#reactor-motion').closest('label').hidden =
      draft.theme !== 'reactor' || draft.shape !== 'circle';
  for (const id of ['fit-fraction', 'fit-fine-tune'])
    $(`#${id}`).closest('label').hidden = effectiveSizeMode(draft) !== 'screen';
  for (const [id, key] of Object.entries(bindings)) {
    const el = $(`#${id}`);
    const value = get(key);
    if (el.type === 'checkbox')
      el.checked = !!value;
    else
      el.value = value ?? '';
    const output = $(`#${id.replace('-opacity', '')}-out`) || $(`#${id}-out`);
    if (output)
      output.value = `${value}${id === 'linux-margin' ? ' px' : id === 'dot-count' ? '' : '%'}`;
  }
  document.querySelectorAll('[data-size]').forEach(button => {
    const candidate = normalizeSize(
        {...draft, sizeMode : 'fixed', sizePreset : button.dataset.size});
    const monitor = selectedMonitor();
    const fit = monitor ? fittedGeometry(candidate, visibleProviderCount(), monitor, desktopPlatform) : null;
    button.setAttribute('aria-pressed',
                        String(effectiveSizeMode(draft) !== 'screen' &&
                               button.dataset.size === draft.sizePreset));
    button.disabled = !!fit && !fit.fits;
    button.title = fit && !fit.fits ? 'Too big for this screen' : '';
    button.querySelector('small').textContent = fit
        ? `${Math.round(fit.width)} × ${Math.round(fit.height)} px` : 'Monitor not connected';
    button.querySelector('.size-hint').textContent =
        fit && !fit.fits ? 'Too big for this screen' : '';
  });
  const screenFit = selectedMonitor() ? fittedGeometry(
      {...draft, sizeMode : 'screen'}, visibleProviderCount(),
      selectedMonitor(), desktopPlatform) : null;
  $('#fit-screen small').textContent =
      $('#fit-screen').disabled ? 'Portrait and Strip only' : screenFit ? `${Math.round(screenFit.width)} × ${Math.round(screenFit.height)} px` : 'Monitor not connected';

  const p = themePalette();
  const paper = draft.background || p.bgWidget;
  const colors = providerColors(draft, paper);
  document.querySelectorAll('[data-provider-color]')
      .forEach((el, i) => el.value = colors[i]);
  colorWarning.textContent = providerColorWarnings(draft, paper).join('. ');
  $('#accent').value = draft.accent || p.accent;
  $('#background').value = draft.background || p.bgWidget;
  document.querySelectorAll('[data-theme]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.theme === draft.theme));
    const colors = themePalette(themes.find(t => t.id === b.dataset.theme));
    b.querySelector('.theme-preview').style.cssText =
        `background-color:${colors.bgWidget};color:${
            previewInk(colors.accent,
                       colors.bgWidget)};border-color:${colors.border}`;
  });
  paletteGrid.replaceChildren();
  const t = themes.find(t => t.id === draft.theme) || themes[0];
  for (const [key, value] of Object.entries(paletteChoices(t, draft))) {
    const button = document.createElement('button');
    button.className = 'palette-option';
    button.setAttribute('aria-pressed', String(key === draft.palette));
    const name = document.createElement('span');
    name.textContent = value.name;
    button.append(name);
    const colors = themePalette(t, key);
    for (const color of ['accent', 'bgWidget', 'bgCard', 'textPrimary',
                         'severityWarning']) {
      const swatch = document.createElement('i');
      swatch.style.background = colors[color];
      swatch.title = `${color}: ${colors[color]}`;
      button.append(swatch);
    }
    button.onclick = () => {
      draft.palette = key;
      draft.accent = null;
      draft.background = null;
      update();
    };
    button.hidden = !paletteTools.expanded && paletteGrid.children.length >= 6 && key !== draft.palette;
    paletteGrid.append(button);
  }
  paletteTools.render();
  document.querySelectorAll('[data-taskbar-provider]')
      .forEach(el => el.checked = draft.taskbar.providers.includes(
                   el.dataset.taskbarProvider));
  $('#placement-actions').hidden = !positionBefore;
  $('#place').disabled = !!positionBefore;
  $('#map-widget').disabled = !positionBefore;
  renderMap();
  decorateRows(panel);
  decorateGroups(panel);
  widgetPicker.render(geometry.monitors);
}
export const bindings = {
  'history-enabled':'historyEnabled', 'history-mode':'historyMode', 'history-panel-layout':'historyPanelLayout',
  'history-cost':'historyCost', 'history-models':'historyModels',
  'history-heatmap':'historyHeatmap', 'history-machines':'historyMachines',
  'size-mode' : 'sizeMode',
  'fit-fraction' : 'fitFraction',
  'fit-fine-tune' : 'fitFineTune',
  'reserved-top' : 'reservedTop',
  'reserved-bottom' : 'reservedBottom',
  'quote-enabled' : 'quoteEnabled',
  'quote-mode' : 'quoteMode',
  'quote-position' : 'quotePosition',
  'quote-navigation' : 'quoteNavigation',
  'color-mode' : 'colorMode',
  'dot-count' : 'dotCount',
  'match-physical-size' : 'matchPhysicalSize',
  'accent-edge' : 'accentEdge',
  appearance : 'appearance',
  accent : 'accent',
  background : 'background',
  'widget-opacity' : 'widgetOpacity',
  'background-opacity' : 'backgroundOpacity',
  scale : 'fineTune',
  position : 'position',
  'fit-height' : 'fitHeight',
  'show-extra-windows' : 'showExtraWindows',
  'separate-pools' : 'separatePools',
  'taskbar-enabled' : 'taskbar.enabled',
  'taskbar-style' : 'taskbar.style',
  'taskbar-theme' : 'taskbar.theme',
  'taskbar-window' : 'taskbar.window',
  'taskbar-bars' : 'taskbar.showBars',
  'linux-layer' : 'linux.layer',
  'linux-margin' : 'linux.margin',
  'linux-monitor' : 'linux.monitor',
  'lock-position' : 'lockPosition',
  'placement-monitor' : 'placement.monitor',
  snap : 'placement.snap',
  disconnected : 'placement.disconnected',
  'fallback-monitor' : 'placement.fallbackMonitor'
};
const get = path => path.split('.').reduce((v, k) => v?.[k], draft);
function set(path, value) {
  const keys = path.split('.');
  const key = keys.pop();
  let obj = draft;
  for (const k of keys)
    obj = obj[k] ??= {};
  obj[key] = value;
}
for (const [id, key] of Object.entries(bindings)) {
  const el = $(`#${id}`);
  el.addEventListener(
      el.type === 'range' || el.type === 'color' ? 'input' : 'change', () => {
        let value =
            el.type === 'checkbox' ? el.checked
            : el.type === 'number'
                ? (el.value === '' ? null
                                   : Math.round(Math.max(
                                         0, Math.min(1000, Number(el.value)))))
            : el.type === 'range' ||
                    [ 'dot-count', 'fit-fraction' ].includes(id)
                ? Number(el.value)
                : el.value;
        if (id === 'placement-monitor' && value === '')
          value = null;
        if (id === 'linux-monitor' && value === '')
          value = null;
        set(key, value);
        update();
      }, {signal : abort.signal});
}
document.querySelectorAll('[data-taskbar-provider]')
    .forEach(el => el.onchange = () => {
      draft.taskbar.providers = [
        ...document.querySelectorAll('[data-taskbar-provider]:checked')
      ].map(el => el.dataset.taskbarProvider);
      update();
    });
document.querySelectorAll('[data-size]').forEach(b => b.onclick = () => {
  draft.sizeMode = 'fixed';
  draft.sizePreset = b.dataset.size;
  update();
});
$('#start-at-login').onchange = event => {
  autostart = event.target.checked;
  mark();
};
function renderProviders() {
  if (!providerConfig)
    return;
  const config = structuredClone(providerConfig);
  for (const [id, p] of Object.entries(config.providers))
    p.enabled = providers.includes(id);
  config.initialized = true;
  mountProviders($('#provider-settings'), config, async () => {});
  $('#provider-settings .provider-consent-actions').hidden = true;
  for (const row of $('#provider-settings').querySelectorAll('.provider-choice')) {
    const input = row.querySelector('input');
    input.setAttribute('role', 'switch');
    row.append(input);
  }
  $('#provider-settings').onchange = () => {
    providers = [...$('#provider-settings').querySelectorAll('input') ].flatMap(
        (el, i) => el.checked
                       ? [ Object.keys(config.providers)
                               .filter(id => id in config.disclosures)[i] ]
                       : []);
    update();
  };
}
let snapshotProviders = sample ? sampleSnapshot.providers : null;
let providerConfig;
let autostartAvailable = true;
let desktopPlatform = sample && new URLSearchParams(location.search).get('platform') === 'windows' ? 'windows' : 'linux';
let geometry = {
  monitors : [ {
    name : 'Demo display',
    width : 1920,
    height : 1080,
    primary : true,
    scale : 1
  } ],
  widgetWidth : 340,
  widgetHeight : 600
};
function visibleProviderCount() {
  const available = snapshotProviders ?? (providers || []).map(id => ({id}));
  const active = available.filter(p => (providers || []).includes(p.id) &&
                                       !hiddenStates.has(String(p.state).toUpperCase()));
  const visible = orderedProviders(applyLimits(active, draft), draft);
  const selected = [ 'circle', 'pill' ].includes(draft.shape)
                       ? widgetProviders(visible, draft.widgetProviders)
                       : visible;
  return Math.max(1, draft.shape === 'square' ? Math.min(4, selected.length)
                                              : selected.length);
}
function selectedMonitor() {
  return selectedWorkArea(geometry.monitors, draft);
}
function renderMap() {
  const detected = selectedMonitor();
  const monitor = detected && workAreaMonitor(detected, draft, desktopPlatform);
  $('#monitor-map').hidden = !monitor;
  $('#size-fit-warning').hidden = true;
  if (!monitor) {
    $('#detected-area').textContent = 'Monitor not connected';
    return;
  }
  const fit =
      fittedGeometry(draft, visibleProviderCount(), detected, desktopPlatform);
  geometry.widgetWidth = fit.width;
  geometry.widgetHeight = fit.height;
  const warning = $('#size-fit-warning');
  warning.hidden = !fit.limited;
  $('#detected-area').textContent =
      `Detected work area ${detected.width} × ${detected.height} · top ${
          detected.detectedTop ||
          0}, bottom ${detected.detectedBottom || 0} px (${
          detected.workAreaSource ||
          'system'}). Effective ${monitor.width} × ${monitor.height}.`;
  warning.textContent =
      'Size is limited to keep the widget within this screen’s space budget.';
  const map = $('#monitor-map');
  map.style.aspectRatio = `${monitor.width}/${monitor.height}`;
  map.style.maxWidth = `${260 * monitor.width / monitor.height}px`;
  const width = geometry.widgetWidth / monitor.width,
        height = geometry.widgetHeight / monitor.height;
  const xr = draft.position === 'Free'
                 ? draft.placement.xRatio
                 : (draft.position.endsWith('left') ? 0 : 1);
  const yr = draft.position === 'Free'
                 ? draft.placement.yRatio
                 : (draft.position.startsWith('Top') ? 0 : 1);
  const offset = (r, extent, size) => {
    const spare = Math.max(0, extent - size),
          inset = Math.min(fit.margin, spare / 2);
    return Math.max(inset, Math.min(spare - inset, r * spare)) / extent * 100;
  };
  $('#map-widget').style.cssText =
      `width:${width * 100}%;height:${height * 100}%;left:${
          offset(xr, monitor.width, geometry.widgetWidth)}%;top:${
          offset(yr, monitor.height, geometry.widgetHeight)}%`;
  $('#map-widget').textContent = fit.fits ? 'Widget' : 'Size exceeds work area';
  $('#map-widget').title =
      fit.fits ? 'Widget fits the work area' : warning.textContent;
  $('#map-widget').dataset.overflow = String(!fit.fits);
}
function beginPlacement() {
  if (!positionBefore) {
    positionBefore = structuredClone({
      placement : draft.placement,
      position : draft.position,
      lockPosition : draft.lockPosition
    });
    if (draft.position !== 'Free') {
      draft.placement.xRatio = draft.position.endsWith('left') ? 0 : 1;
      draft.placement.yRatio = draft.position.startsWith('Top') ? 0 : 1;
    }
    draft.placementEditing = true;
    draft.lockPosition = false;
  }
  if (!draft.placement.monitor)
    draft.placement.monitor = selectedMonitor()?.name ?? null;
}
$('#place').onclick = () => {
  beginPlacement();
  update();
};
function cancelPlacement() {
  if (positionBefore)
    Object.assign(draft, structuredClone(positionBefore));
  positionBefore = null;
  draft.placementEditing = false;
  update();
}
function savePosition() {
  draft.lockPosition = true;
  draft.placementEditing = false;
  positionBefore = null;
  update();
}
$('#save-position').onclick = savePosition;
$('#cancel-position').onclick = cancelPlacement;
let drag = null;
$('#map-widget').addEventListener('pointerdown', event => {
  if (!positionBefore)
    return;
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  drag = {x : event.clientX - rect.left, y : event.clientY - rect.top};
  event.currentTarget.setPointerCapture(event.pointerId);
}, {signal : abort.signal});
function snap(value, available) {
  value = Math.max(0, Math.min(available, value));
  if (draft.placement.snap === 'grid')
    return Math.max(0, Math.min(available, Math.round(value / 8) * 8));
  if (draft.placement.snap === 'edges')
    for (const edge of [0, available / 2, available])
      if (Math.abs(value - edge) <= 12)
        return edge;
  return value;
}
$('#map-widget').addEventListener('pointermove', event => {
  if (!drag)
    return;
  const rect = $('#monitor-map').getBoundingClientRect(),
        monitor = selectedMonitor();
  const aw = Math.max(0, monitor.width - geometry.widgetWidth),
        ah = Math.max(0, monitor.height - geometry.widgetHeight);
  draft.position = 'Free';
  draft.placement.xRatio = aw ? snap((event.clientX - rect.left - drag.x) /
                                         rect.width * monitor.width,
                                     aw) /
                                    aw
                              : 0;
  draft.placement.yRatio = ah ? snap((event.clientY - rect.top - drag.y) /
                                         rect.height * monitor.height,
                                     ah) /
                                    ah
                              : 0;
  mark();
  renderMap();
}, {signal : abort.signal});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('#map-widget').addEventListener(type, () => drag = null, {
    signal : abort.signal
  });
$('#map-widget').onkeydown = event => {
  if (!positionBefore ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    return;
  event.preventDefault();
  const m = selectedMonitor();
  const key =
      [ 'ArrowLeft', 'ArrowRight' ].includes(event.key) ? 'xRatio' : 'yRatio';
  const available = key === 'xRatio' ? m.width - geometry.widgetWidth
                                     : m.height - geometry.widgetHeight;
  const delta = [ 'ArrowLeft', 'ArrowUp' ].includes(event.key) ? -8 : 8;
  draft.position = 'Free';
  draft.placement[key] = Math.max(
      0, Math.min(1, draft.placement[key] + delta / Math.max(1, available)));
  update();
};
async function refreshMonitors() {
  if (!sample)
    geometry = await settingsInvoke('get_placement_monitors', {widgetId: saved?.widgets?.some(w => w.id === selectedWidget) ? selectedWidget : 'main'});
  populateMonitors();
  renderControls();
}
function populateMonitors() {
  for (const id of ['placement-monitor', 'fallback-monitor', 'linux-monitor']) {
    const el = $(`#${id}`), value = get(bindings[id]);
    el.replaceChildren(new Option('Primary / Auto', ''));
    for (const m of geometry.monitors)
      el.add(new Option(m.name, m.name));
    if (value && !geometry.monitors.some(m => m.name === value))
      el.add(new Option(`${value} (disconnected)`, value));
    el.value = value ?? '';
  }
}
async function save() {
  if (saving || !changed())
    return false;
  if (positionBefore) {
    error('Save or cancel placement first.');
    return false;
  }
  saving = true;
  panel.inert = true;
  document.querySelector('.widget-picker').inert = true;
  saveFailure = '';
  mark();
  const value = structuredClone(rootDraft), chosen = structuredClone(providers),
        login = autostart, readLogs = {...localHistory};
  // Providers whose permission command already ran, so a later failure can re-read the real state.
  const appliedHistory = [];
  try {
    await preview();
    if (!sample) {
      if (JSON.stringify(chosen) !== JSON.stringify(savedProviders)) {
        await settingsInvoke('configure_providers', {providers : chosen});
        settingsInvoke('refresh_now').catch(error);
      }
      const pendingHistory = Object.keys(historyProviders).filter(
          id => readLogs[id] !== savedLocalHistory[id] || localHistoryUnknown.has(id));
      if (pendingHistory.length) {
        for (const id of pendingHistory) {
          await settingsInvoke('set_local_history', {enabled:readLogs[id], provider:id});
          appliedHistory.push(id);
        }
        const config = await settingsInvoke('get_provider_config');
        for (const id of pendingHistory) {
          const actual = config.providers?.[id]?.local_history;
          if (typeof actual !== 'boolean') throw new Error('Local history permission status was not returned');
          savedLocalHistory[id] = actual;
          localHistoryUnknown.delete(id);
          if (actual !== readLogs[id]) throw new Error('Local history permission was not saved');
        }
        settingsInvoke('refresh_now').catch(error);
      }
      if (login !== savedAutostart) {
        await settingsInvoke('set_autostart', {enabled : login});
      }
      await settingsInvoke('save_settings', {settings : value});
      const loaded = await settingsInvoke('load_settings');
      const differences = differingKeys(value, loaded);
      if (differences.length)
        throw new Error('Saved settings differ: ' + differences.join(', '));
    }
    await preview();
    saved = value;
    savedProviders = chosen;
    savedAutostart = login;
    savedLocalHistory = {...readLogs};
    $('#close-prompt').hidden = true;
    saveFailure = '';
    saveMessage =
        '✓ Saved at ' + new Date().toLocaleTimeString(
                            [], {hour : '2-digit', minute : '2-digit'});
    return true;
  } catch (e) {
    let message = `Unable to save: ${e}`;
    if (appliedHistory.length) {
      try {
        const config = await settingsInvoke('get_provider_config');
        for (const id of appliedHistory) {
          const actual = config.providers?.[id]?.local_history;
          if (typeof actual !== 'boolean') throw new Error('Local history permission status was not returned');
          savedLocalHistory[id] = actual;
          localHistoryUnknown.delete(id);
        }
        message = `History permission saved; other settings failed: ${e}`;
      } catch (readError) {
        for (const id of appliedHistory) {
          localHistoryUnknown.add(id);
          $(`#${historyProviders[id]}`).indeterminate = true;
        }
        message = `History permission status could not be verified; other settings failed: ${e}; ${readError}`;
      }
    }
    error(message);
    mark();
    return false;
  } finally {
    saving = false;
    panel.inert = false;
    document.querySelector('.widget-picker').inert = false;
    mark();
  }
}

$('#save').onclick = save;
$('#revert').onclick = async () => {
  saveFailure = '';
  if (localHistoryUnknown.size) {
    try {
      const config = await settingsInvoke('get_provider_config');
      for (const id of [...localHistoryUnknown]) {
        const actual = config.providers?.[id]?.local_history;
        if (typeof actual !== 'boolean') throw new Error('Local history permission status was not returned');
        savedLocalHistory[id] = actual;
        localHistoryUnknown.delete(id);
      }
    } catch (e) {
      error(`History permission status could not be verified: ${e}`);
      return;
    }
  }
  rootDraft = structuredClone(saved);
  if (selectedWidget !== 'main' && !rootDraft.widgets?.some(w => w.id === selectedWidget)) selectedWidget = 'main';
  draft = effectiveWidget(rootDraft, selectedWidget);
  providers = structuredClone(savedProviders);
  autostart = savedAutostart;
  localHistory = {...savedLocalHistory};
  for (const element of Object.values(historyProviders))
    $(`#${element}`).indeterminate = false;
  $('#start-at-login').checked = autostart;
  positionBefore = null;
  renderProviders();
  populateMonitors();
  renderControls();
  mark();
  restorePreviews().catch(error);
};
async function close() {
  if (closing)
    return;
  closing = true;
  try {
    await previewWork;
    if (!sample) {
      // Linux may destroy this webview before the IPC reply.
      await settingsInvoke('finish_settings');
    } else
      window.close();
  } catch (e) {
    error(e);
  } finally {
    closing = false;
  }
}
$('#close-save').onclick = async () => {
  if (await save())
    await close();
};
$('#close-discard').onclick = async () => {
  try {
    rootDraft = structuredClone(saved);
    providers = structuredClone(savedProviders);
    await restorePreviews();
    await close();
  } catch (e) {
    error(e);
  }
};
$('#close-cancel').onclick = () => $('#close-prompt').hidden = true;
window.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    save();
  }
  if (event.key === 'Escape')
    $('#close-prompt').hidden = true;
}, {signal : abort.signal});
mode.addEventListener('change', renderControls, {signal : abort.signal});
window.addEventListener('pagehide', () => {
  disposed = true;
  abort.abort();
  stops.splice(0).forEach(stop => stop());
}, {once : true});
async function subscription(promise) {
  const stop = await promise;
  if (disposed)
    stop();
  else
    stops.push(stop);
}
async function loadSession() {
  panel.inert = true;
  $('#save').disabled = true;
  $('#revert').disabled = true;
  $('#close-prompt').hidden = true;
  positionBefore = null;
  drag = null;
  saveMessage = '';
  error('');
  draft = {
    ...defaults,
    ...(sample ? {} : normalizeSize(await settingsInvoke('load_settings'), true))
  };
  const paletteLoadError = draft.paletteLoadError;
  delete draft.paletteLoadError;
  draft.providerPreview = null;
  draft.placement = normalizePlacement(draft.placement || {});
  for (const key of ['taskbar', 'linux', 'placement'])
    draft[key] = {...defaults[key], ...draft[key]};
  if (!themes.some(t => t.id === draft.theme))
    draft.theme = 'system';
  const manifest = themes.find(t => t.id === draft.theme);
  if (!paletteChoices(manifest, draft)[draft.palette])
    draft.palette = Object.keys(manifest.palettes)[0];
  selectedWidget = 'main';
  draft = normalizeDraft(draft);
  for (const widget of draft.widgets || []) {
    widget.placement = {...defaults.placement, ...normalizePlacement(widget.placement)};
    if (widget.overrides && 'limitVisibility' in widget.overrides) widget.overrides.limitVisibility = normalizeLimitVisibility(widget.overrides.limitVisibility);
    if (widget.overrides && 'separatePools' in widget.overrides) widget.overrides.separatePools = widget.overrides.separatePools === true;
  }
  rootDraft = structuredClone(draft);
  saved = structuredClone(rootDraft);
  if (paletteLoadError) error(paletteLoadError);
  if (!sample) {
    snapshotProviders =
        (await settingsInvoke('get_snapshot')).snapshot?.providers ?? [];
    try {
      providerConfig = await settingsInvoke('get_provider_config');
    } catch (e) {
      providerConfig =
          {initialized : true, providers : {}, disclosures : {}, detected : {}};
      error(`Provider settings unavailable: ${e}`);
    }
    try {
      autostart = await settingsInvoke('get_autostart');
    } catch (e) {
      autostartAvailable = false;
      $('#autostart-status').hidden = false;
      $('#autostart-status').textContent = String(e);
    }
    try {
      const desktop = await settingsInvoke('get_desktop_info');
      desktopPlatform = desktop.platform;
      $('#desktop-layer').hidden = !desktop.layerShell;
      $('#desktop-layer-unavailable').hidden = desktop.layerShell;
      sections.display.querySelector('#linux-settings').hidden =
          desktop.platform !== 'linux';
      sections.taskbar.querySelector('#taskbar-settings').hidden =
          desktop.platform !== 'windows';
    } catch (e) {
      error(e);
    }
  } else
    providerConfig = {
      initialized : true,
      providers : {
        claude : {enabled : true},
        codex : {enabled : true},
        gemini : {enabled : false}
      },
      disclosures : {
        claude : 'Read local quota metadata.',
        codex : 'Read local quota metadata.',
        gemini : 'Read local quota metadata.'
      },
      detected : {}
    };
  providers = Object.entries(providerConfig.providers)
                  .filter(([, p ]) => p.enabled && providerConfig.initialized)
                  .map(([ id ]) => id);
  for (const id of Object.keys(historyProviders))
    localHistory[id] = providerConfig.providers?.[id]?.local_history === true;
  savedLocalHistory = {...localHistory};
  if (sample) snapshotProviders = historySample.providers;
  savedProviders = structuredClone(providers);
  savedAutostart = autostart;
  $('#start-at-login').checked = autostart;
  $('#start-at-login').disabled = !autostartAvailable;
  if(sample){ $('#desktop-layer').hidden=false; $('#desktop-layer-unavailable').hidden=true; }
  $('#linux-settings').hidden = desktopPlatform !== 'linux';
  navigation.platform(desktopPlatform);
  $('#data-folder').textContent = 'Data folder: ' + (desktopPlatform === 'windows'
      ? '%LOCALAPPDATA%\\quotacore' : '$XDG_STATE_HOME/quotacore (default ~/.local/state/quotacore)') +
      '. QUOTACORE_HOME overrides this location.';
  renderProviders();
  try {
    await refreshMonitors();
  } catch (e) {
    geometry.monitors = [];
    error(e);
  }
  renderControls();
  mark();
  panel.inert = false;
  mark();
}
function selectWidget(id) {
  if (saving) return;
  if (positionBefore) cancelPlacement();
  selectedWidget = id;
  positionBefore = null;
  drag = null;
  draft = effectiveWidget(rootDraft, id);
  populateMonitors();
  renderControls();
  mark();
}
const widgetPicker = mountWidgetPicker({sections, bindings,
  root: () => rootDraft, selected: () => selectedWidget, select: selectWidget,
  refresh: refreshMonitors,
  mutate: work => {
    work(rootDraft);
    draft = effectiveWidget(rootDraft, selectedWidget);
    populateMonitors();
    renderControls();
    mark();
    preview().catch(error);
  }
});
async function restorePreviews() {
  const root = structuredClone(rootDraft);
  const work = ['main', ...(root.widgets || []).map(w => w.id)].map(id =>
    preview(id, effectiveWidget(root, id)));
  await Promise.all(work);
}
try {
  await loadSession();
  if (!sample) {
    await subscription(getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      if (closing || panel.inert)
        return;
      if (changed()) {
        $('#close-prompt').hidden = false;
        $('#close-save').focus();
      } else
        close();
    }));
    await subscription(listen('snapshot', event => {
      snapshotProviders = event.payload.snapshot?.providers ?? [];
      renderControls();
    }));
    await subscription(
        listen('settings-reopened', () => loadSession().catch(error)));
    await subscription(
        listen('monitors-changed', () => refreshMonitors().catch(error)));
    await subscription(
        listen('placement-action', event => event.payload === 'save'
                                                ? savePosition()
                                                : cancelPlacement()));
    settingsInvoke('get_runtime_diagnostics')
        .then(value => {
          $('#runtime-diagnostics').textContent = `Python ${
              value.paths.python_version} (${value.paths.runtime_source})`;
        })
        .catch(error);
  }
} catch (e) {
  error(e);
}
window.__SETTINGS_READY__ = true;
