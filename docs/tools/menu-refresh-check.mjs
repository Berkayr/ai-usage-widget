import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browser } from './browser-harness.mjs';
import { fittedGeometry, normalizeSize, shapes, sizePresets } from '../../app/src/sizing.js';

const monitor = { name: 'Synthetic display', width: 1920, height: 1080, scale: 1, primary: true };
const snapshot = {
  generated_at: new Date().toISOString(),
  providers: ['claude', 'codex', 'gemini'].map(id => ({ id, state: 'OK', windows: [{ kind: 'session', used_percent: 25 }] }))
};
const longError = 'Collector timed out after reading a synthetic provider response: ' + 'abcdefghijklmnopqrstuvwxyz'.repeat(5);
const shotDir = process.env.SHOT_DIR;
if (shotDir) await mkdir(shotDir, { recursive: true });
const b = await browser();
const evaluate = (fn, arg) => b.evaluate(`(${fn})(${JSON.stringify(arg)})`);
const resize = (width, height) => b.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function screenshot(name) {
  if (shotDir) {
    const png = await b.cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(shotDir, name + '.png'), Buffer.from(png.data, 'base64'));
  }
}

function installMock({ monitor, snapshot }) {
  const callbacks = new Map();
  const listeners = new Map();
  const ipc = window.refreshTest = {
    calls: [], actions: [],
    open(x = 35, y = 25) {
      document.querySelector('#widget').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: x, clientY: y, button: 2 }));
    },
    activate(id = 'refresh') {
      this.open();
      document.getElementById(id).click();
    },
    async dispatch(event, payload) {
      await Promise.all([...listeners.values()].filter(item => item.event === event).map(item => item.callback({ event, payload })));
    },
    toast() {
      return document.querySelector('#toast').hidden ? '' : document.querySelector('#toast-message').textContent;
    }
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_, id) => listeners.delete(id) };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' } },
    transformCallback(callback) {
      const id = callbacks.size + 1;
      callbacks.set(id, callback);
      return id;
    },
    async invoke(cmd, args = {}) {
      ipc.calls.push(cmd);
      if (cmd === 'plugin:event|listen') {
        listeners.set(args.handler, { event: args.event, callback: callbacks.get(args.handler) });
        if (args.event === 'refresh-error') ipc.ready = true;
        return args.handler;
      }
      if (cmd === 'load_settings') return { theme: 'system', appearance: 'dark', quoteEnabled: false, historyEnabled: false };
      if (cmd === 'get_monitor_scale') return 1;
      if (cmd === 'get_desktop_info') return { platform: 'linux' };
      if (cmd === 'get_placement_monitors') return { monitors: [monitor] };
      if (cmd === 'get_provider_config') return { initialized: true };
      if (cmd === 'get_snapshot') return { snapshot };
      if (['refresh_now', 'open_settings'].includes(cmd)) {
        ipc.actions.push([cmd, document.querySelector('#context-menu').hidden]);
        if (cmd === 'open_settings') throw new Error('Synthetic settings error');
        // A real write stamps freshly measured providers with captured_at.
        const measured = value => value && Array.isArray(value.providers)
          ? { ...value, providers: value.providers.map(p => ({ captured_at: new Date().toISOString(), ...p })) } : value;
        return new Promise((resolve, reject) => { ipc.pending = { resolve: value => resolve(measured(value)), reject }; });
      }
      if (cmd === 'set_linux_focus') { ipc.menuFocus = args; return; }
      if (['snapshot_rendered', 'fit_window_height', 'resize_widget', 'plugin:event|unlisten'].includes(cmd)) return;
      throw new Error('Unexpected synthetic IPC: ' + cmd);
    }
  };
}

try {
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${installMock})(${JSON.stringify({ monitor, snapshot })})`
  });
  await resize(340, 450);
  await b.navigate('/', 'window.refreshTest?.ready && document.querySelector(".provider-card")');
  await evaluate(() => {
    const ipc = window.refreshTest;
    const menu = document.querySelector('#context-menu');
    const widget = document.querySelector('#widget');
    const check = (condition, reason) => { if (!condition) throw new Error(reason); };
    for (const button of [0, 1, 2]) {
      ipc.open();
      menu.querySelector('button').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }));
      check(!menu.hidden, 'Pointer press inside closed the menu');
      widget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }));
      check(menu.hidden, 'Pointer press outside must close for button ' + button);
    }
    ipc.open(30, 30);
    const previous = menu.style.left;
    widget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 }));
    ipc.open(95, 70);
    check(!menu.hidden && menu.style.left !== previous, 'Right click did not reopen at the new position');
    check(document.activeElement.id === 'refresh' && ipc.menuFocus?.open && ipc.menuFocus?.focus, 'Opening the menu must allow keyboard interaction');
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    check(menu.hidden && ipc.menuFocus?.open === false, 'Escape must close the menu and release keyboard focus');
    ipc.open();
    window.dispatchEvent(new Event('blur'));
    check(menu.hidden, 'Window blur must close the menu');
    ipc.open();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    check(menu.hidden, 'Hiding the document must close the menu');
    ipc.open();
  });
  await evaluate(() => {
    const menu = document.querySelector('#context-menu');
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    window.refreshTest.open();
    if (menu.hidden) throw new Error('Fresh contextmenu did not cancel the pending leave close');
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    document.documentElement.dispatchEvent(new MouseEvent('mouseenter'));
  });
  await pause(650);
  assert.equal(await b.evaluate('document.querySelector("#context-menu").hidden'), false, 'Re-entering within the delay must keep the menu open');
  await evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')));
  await pause(650);
  assert.equal(await b.evaluate('document.querySelector("#context-menu").hidden'), true, 'Leaving the document must close the menu after the delay');
  await b.evaluate('refreshTest.open(); document.querySelector("#menu-settings").focus()');
  assert.equal(await b.evaluate('document.activeElement.id'), 'menu-settings');
  await b.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await b.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  assert.deepEqual(await b.evaluate('refreshTest.actions'), [['open_settings', true]], 'Keyboard activation must close before invoking Settings');
  assert.match(await b.evaluate('refreshTest.toast()'), /Synthetic settings error/);
  assert.equal(await b.evaluate('document.querySelector("#context-menu").hidden'), true);

  await b.evaluate('refreshTest.open()');
  const { x, y } = await evaluate(() => {
    const box = document.querySelector('#refresh').getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await b.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await b.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  assert.deepEqual(await b.evaluate('refreshTest.actions'), [['open_settings', true], ['refresh_now', true]]);
  await b.evaluate('refreshTest.activate()');
  assert.equal(await b.evaluate('refreshTest.calls.filter(cmd => cmd === "refresh_now").length'), 1);
  assert.equal(await b.evaluate('document.querySelector("#context-menu").hidden'), true);
  assert.equal(await b.evaluate('refreshTest.toast()'), 'Refreshing…');
  assert.equal(await b.evaluate('document.querySelector("#toast").closest(\'[role="status"][aria-live="polite"]\') !== null'), true);
  assert.equal(await b.evaluate('!document.querySelector(".toast-spinner").hidden && getComputedStyle(document.querySelector(".toast-spinner")).animationName'), 'toast-spin');
  await b.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".toast-spinner")).animationName'), 'none');
  await b.cdp('Emulation.setEmulatedMedia', { features: [] });
  await pause(3300);
  assert.equal(await b.evaluate('refreshTest.toast()'), 'Refreshing…', 'Progress expired before refresh finished');
  await b.evaluate('refreshTest.dispatch("refresh-error", "Synthetic background toast")');
  assert.equal(await b.evaluate('refreshTest.toast()'), 'Synthetic background toast');
  await pause(3300);
  assert.equal(await b.evaluate('refreshTest.toast()'), 'Refreshing…', 'Progress must return after another toast expires');
  await evaluate(data => { window.refreshTest.pending.resolve(data); }, {
    ...snapshot, providers: [{ id: 'claude', state: 'AUTH_REQUIRED' }, ...snapshot.providers.slice(1)]
  });
  assert.match(await b.evaluate('refreshTest.toast()'), /^Updated \d\d:\d\d · Claude: sign-in needed$/);

  function checkCase({ settings, snapshot, longError }) {
    return (async () => {
      const ipc = window.refreshTest;
      await ipc.dispatch('settings-preview', settings);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const shell = document.querySelector('#widget');
      const toast = document.querySelector('#toast');
      const region = toast.parentElement;
      const message = document.querySelector('#toast-message');
      const oldBox = JSON.stringify(shell.getBoundingClientRect());
      const issues = [];
      function check(stage, expected) {
        const r = toast.getBoundingClientRect();
        const area = region.getBoundingClientRect();
        const text = message.getBoundingClientRect();
        const style = getComputedStyle(message);
        const background = getComputedStyle(toast).backgroundColor;
        if (!expected.test(ipc.toast()) || toast.title !== ipc.toast()) issues.push(stage + ': unexpected message or title: ' + ipc.toast());
        if (JSON.stringify(shell.getBoundingClientRect()) !== oldBox) issues.push(stage + ': changed widget geometry');
        if (r.left < 0 || r.top < 0 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5 ||
          r.left < area.left - .5 || r.top < area.top - .5 || r.right > area.right + .5 || r.bottom > area.bottom + .5) {
          issues.push(stage + ': outside visible area ' + [r.left, r.top, r.right, r.bottom].join(','));
        }
        if (parseFloat(style.fontSize) < parseFloat(style.getPropertyValue('--shape-min-font'))) issues.push(stage + ': font too small');
        // Clamped text also counts its hidden lines, whose width varies by font.
        const slack = message.scrollHeight > message.clientHeight ? parseFloat(style.fontSize) / 2 : 1;
        if (message.scrollWidth > message.clientWidth + slack || text.height + .1 < parseFloat(style.lineHeight) ||
          text.right > r.right || text.bottom > r.bottom) issues.push(stage + ': text overflow ' + [message.scrollWidth, message.clientWidth, text.height, text.right - r.right, text.bottom - r.bottom].join(','));
        if (stage === 'failure' && innerWidth === 160 && (message.scrollHeight <= message.clientHeight || Number(style.webkitLineClamp) < 1)) {
          issues.push(stage + ': long message did not clamp in the smallest viewport');
        }
        if (background.startsWith('rgba')) issues.push(stage + ': translucent background');
        for (const [x, y] of [[r.left + 6, r.top + 2], [r.right - 6, r.top + 2], [r.left + 6, r.bottom - 2], [r.right - 6, r.bottom - 2]]) {
          if (!toast.contains(document.elementFromPoint(x, y))) issues.push(stage + ': clipped or covered corner');
        }
      }
      ipc.open();
      for (const item of document.querySelectorAll('#context-menu button')) {
        const r = item.getBoundingClientRect();
        if (!item.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))) issues.push('Menu item is covered: ' + item.id);
      }
      document.querySelector('#refresh').click();
      check('progress', /^Refreshing…$/);
      ipc.pending.resolve(snapshot);
      await new Promise(resolve => setTimeout(resolve, 0));
      check('success', /^Updated \d\d:\d\d$/);
      ipc.activate();
      ipc.pending.reject('Synthetic\n' + longError);
      await new Promise(resolve => setTimeout(resolve, 0));
      check('failure', /^Refresh failed · Synthetic Collector timed out.*…$/);
      return [...new Set(issues)];
    })();
  }

  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  const themeIds = await b.evaluate('__AI_USAGE_DEMO__.themes.map(theme => theme.id)');
  await evaluate(monitor => window.__AI_USAGE_DEMO__.setWorkArea([monitor]), monitor);
  await b.evaluate('refreshTest.activate()');
  assert.equal(await b.evaluate('refreshTest.toast()'), 'Refreshing…');
  await pause(400);
  assert.match(await b.evaluate('refreshTest.toast()'), /^Updated \d\d:\d\d · Codex: showing older data · Gemini: rate limited · \+2 more$/);
  assert.deepEqual(await b.evaluate('refreshTest.calls'), [], 'Sample refresh must not call native IPC');

  await b.navigate('/', 'window.refreshTest?.ready && document.querySelector(".provider-card")');
  const failures = [];
  let checked = 0;
  async function runCase(theme, shape, sizePreset, appearance, viewport) {
    const settings = { theme, shape, sizePreset, appearance, sizeMode: 'fixed', fineTune: 100 };
    const box = viewport || fittedGeometry(normalizeSize(settings), snapshot.providers.length, monitor);
    await resize(Math.round(box.width), Math.ceil(box.height));
    const issues = await evaluate(checkCase, { settings, snapshot, longError });
    if (issues.length) failures.push({ settings, viewport, issues });
    checked++;
  }
  const widgetShapes = shapes.filter(shape => shape !== 'strip');
  for (const theme of themeIds) for (const shape of widgetShapes) for (const sizePreset of Object.keys(sizePresets)) for (const appearance of ['light', 'dark']) {
    await runCase(theme, shape, sizePreset, appearance);
  }
  for (const viewport of [{ width: 160, height: 90 }, { width: 200, height: 120 }]) for (const shape of widgetShapes) {
    await runCase('system', shape, '2X-Large', 'light', viewport);
    await runCase('frosted-glass', shape, 'Small', 'dark', viewport);
  }
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 12), null, 2));

  if (shotDir) {
    await runCase('system', 'portrait', 'Small', 'light');
    await b.evaluate('refreshTest.activate()');
    await screenshot('portrait-light-progress');
    await evaluate(data => { window.refreshTest.pending.resolve(data); }, snapshot);
    await runCase('terminal', 'landscape', 'Small', 'dark');
    await b.evaluate('refreshTest.activate()');
    await evaluate(data => { window.refreshTest.pending.resolve(data); }, snapshot);
    await screenshot('landscape-dark-success');
    await runCase('frosted-glass', 'circle', 'Small', 'dark');
    await screenshot('circle-dark-failure');
    await runCase('system', 'pill', 'Small', 'light');
    await screenshot('pill-light-failure');
    await runCase('system', 'portrait', 'Small', 'light', { width: 160, height: 90 });
    await screenshot('small-light-failure');
  }
  console.log(`PASS: menu interactions and toast geometry in ${checked} cases`);
} finally {
  await b.close();
}
