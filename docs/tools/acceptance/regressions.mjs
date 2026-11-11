import { browser } from '../browser-harness.mjs';
import { portraitManyProviders } from './portrait-many-providers.mjs';

const b = await browser();

try {
  // Install synthetic IPC on new documents
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const callbacks = new Map(), events = new Map();
      let next = 0;
      let disk = {
        theme: 'system',
        palette: 'default',
        shape: 'portrait',
        sizePreset: 'Medium',
        fineTune: 100,
        fitFineTune: 100,
        sizeMode: 'fixed',
        fitFraction: 1,
        quoteEnabled: false,
        quoteMode: 'qotd',
        quotePosition: 'bottom',
        quoteNavigation: true,
        appearance: 'auto',
        colorMode: 'calm',
        dotCount: 20,
        accent: null,
        background: null,
        widgetOpacity: 100,
        backgroundOpacity: 100,
        fitHeight: true,
        position: 'Top right',
        placementEditing: false,
        lockPosition: true,
        showExtraWindows: false,
        userPalettes: [],
        providerColors: {},
        widgetProviders: ['claude', 'codex', 'gemini'],
        providerOrder: ['claude', 'codex', 'gemini', 'copilot'],
        hiddenProviders: [],
        featuredProvider: 'first',
        featuredPosition: 'bottom',
        reactorMotion: false,
        taskbar: {
          enabled: false,
          providers: ['claude', 'codex', 'gemini'],
          window: 'session',
          showBars: false,
          offsetX: 0,
          style: 'transparent',
          theme: 'auto'
        },
        linux: { layer: 'bottom', margin: 12, monitor: null },
        placement: {
          monitor: null,
          xRatio: 1,
          yRatio: 0,
          snap: 'off',
          disconnected: 'primary',
          fallbackMonitor: null
        }
      };

      const bus = window.__FAKE_NATIVE__ = {
        previews: [],
        saves: [],
        hidden: 0,
        fail: null,
        saveDelay: 0,
        close: async () => {
          for (const [id, event] of events) {
            if (event === 'tauri://close-requested') await callbacks.get(id)({ event, id, payload: {} });
          }
        },
        reopen: async () => {
          for (const [id, event] of events) {
            if (event === 'settings-reopened') await callbacks.get(id)({ event, id, payload: {} });
          }
        }
      };

      window.confirm = () => { throw new Error('Browser confirm is forbidden'); };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_, id) => events.delete(id)
      };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'settings' }, currentWebview: { label: 'settings' } },
        transformCallback: callback => {
          const id = ++next;
          callbacks.set(id, callback);
          return id;
        },
        invoke: async (cmd, args = {}) => {
          if (bus.fail === cmd) throw new Error('Synthetic serialization failure: ' + cmd);
          if (cmd === 'get_snapshot') {
            return {
              snapshot: {
                providers: ['claude', 'codex', 'gemini', 'copilot'].map(id => ({
                  id,
                  state: id === 'copilot' ? 'NO_SUBSCRIPTION' : 'OK',
                  windows: [
                    { kind: 'session', used_percent: 42, resets_at: '2099-01-01T00:00:00Z' },
                    { kind: 'weekly', used_percent: 68, resets_at: '2099-01-02T00:00:00Z' }
                  ]
                }))
              }
            };
          }
          if (cmd === 'load_settings') return structuredClone(disk);
          if (cmd === 'get_provider_config') {
            return {
              initialized: true,
              providers: Object.fromEntries(['claude', 'codex', 'gemini', 'copilot'].map(id => [id, { enabled: true }])),
              disclosures: Object.fromEntries(['claude', 'codex', 'gemini', 'copilot'].map(id => [id, 'Synthetic provider'])),
              detected: {}
            };
          }
          if (cmd === 'get_autostart') return false;
          if (cmd === 'get_desktop_info') return { platform: 'linux', layerShell: true, monitors: [] };
          if (cmd === 'get_placement_monitors') {
            return {
              layerShell: true,
              monitors: [{ name: 'Synthetic display', width: 1920, height: 1080, primary: true }],
              widgetWidth: 340,
              widgetHeight: 600
            };
          }
          if (cmd === 'get_monitor_scale') return 1;
          if (cmd === 'get_runtime_diagnostics') return { paths: { python_version: '3.x', runtime_source: 'synthetic' } };
          if (cmd === 'preview_settings') {
            await new Promise(r => setTimeout(r, 5));
            bus.previews.push(structuredClone(args.settings));
            return;
          }
          if (cmd === 'save_settings') {
            bus.saves.push(structuredClone(args.settings));
            await new Promise(r => setTimeout(r, bus.saveDelay || 0));
            disk = structuredClone(args.settings);
            return;
          }
          if (cmd === 'plugin:event|listen') {
            events.set(args.handler, args.event);
            return args.handler;
          }
          if (cmd === 'finish_settings') {
            bus.hidden++;
            return;
          }
          if (cmd === 'plugin:event|unlisten' || cmd === 'plugin:window|set_title') return;
          throw new Error('Unexpected synthetic IPC: ' + cmd);
        }
      };
    })()`
  });

  const executedRegressions = [];
  const evaluate = async (name, expression) => {
    try {
      return await b.evaluate(expression);
    } catch (error) {
      process.exitCode = 1;
      return `FAIL: ${name}: ${error.message}`;
    }
  };

  // ==========================================
  // 1. `scale-decimal`
  // Large with a fine tune producing a decimal scale still saves and applies.
  // ==========================================
  await b.cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 1, mobile: false });
  await b.navigate('/?settings', 'window.__SETTINGS_READY__');
  const resScaleDecimal = await evaluate('ScaleDecimal', `(async () => {
    const $ = s => document.querySelector(s);
    const native = window.__FAKE_NATIVE__;
    $('[data-category="shape-size"]').click();
    $('#scale').value = 82;
    $('#scale').dispatchEvent(new Event('input'));
    $('[data-size="Large"]').click();
    $('#save').click();
    await new Promise(r => setTimeout(r, 60));
    const savedScale = native.saves.at(-1)?.scale;
    if (savedScale !== 98.4) throw new Error(\`Expected decimal scale 98.4, got \${savedScale}\`);
    return 'PASS: scale-decimal (98.4 persisted)';
  })()`);
  executedRegressions.push({ name: 'scale-decimal', result: resScaleDecimal });

  // ==========================================
  // 2. `preset-keeps-fine-tune`
  // Changing preset keeps the fine tune.
  // ==========================================
  const resPresetKeepsFineTune = await evaluate('PresetKeepsFineTune', `(() => {
    const $ = s => document.querySelector(s);
    $('#scale').value = 82;
    $('#scale').dispatchEvent(new Event('input'));
    $('[data-size="Large"]').click();
    $('[data-size="Medium"]').click();
    if ($('#scale').value !== '82') throw new Error(\`Fine tune lost on preset switch: got \${$('#scale').value}\`);
    return 'PASS: preset-keeps-fine-tune (82 preserved)';
  })()`);
  executedRegressions.push({ name: 'preset-keeps-fine-tune', result: resPresetKeepsFineTune });

  // ==========================================
  // 3. `fit-circle-pill`
  // Circle and Pill, after Fit was on, are not huge; Fit is disabled there with a reason.
  // ==========================================
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  const resFitCirclePill = await evaluate('FitCirclePill', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    const monitor = { width: 1920, height: 1080, scale: 1, primary: true };
    await api.setWorkArea([monitor]);

    // Circle check
    await api.setSettings({ shape: 'circle', sizeMode: 'screen', fitFraction: 1, fineTune: 100, sizePreset: 'Medium' });
    const circleBox = document.querySelector('#widget').getBoundingClientRect();
    if (circleBox.width >= 900 || circleBox.height >= 900) {
      throw new Error(\`Circle after Fit is huge: \${circleBox.width} x \${circleBox.height}\`);
    }

    // Pill check
    await api.setSettings({ shape: 'pill', sizeMode: 'screen', fitFraction: 1, fineTune: 100, sizePreset: 'Medium' });
    const pillBox = document.querySelector('#widget').getBoundingClientRect();
    if (pillBox.width >= 1490 || pillBox.height >= 373) {
      throw new Error(\`Pill after Fit is huge: \${pillBox.width} x \${pillBox.height}\`);
    }

    return \`PASS: fit-circle-pill (Circle \${Math.round(circleBox.width)}x\${Math.round(circleBox.height)}, Pill \${Math.round(pillBox.width)}x\${Math.round(pillBox.height)} under bounds)\`;
  })()`);
  executedRegressions.push({ name: 'fit-circle-pill', result: resFitCirclePill });

  // ==========================================
  // 4. `pill-status-badge-hidden-text`
  // Readable text sizing must not expose a pill badge's visually hidden label.
  // ==========================================
  const resPillStatusBadgeHiddenText = await evaluate('PillStatusBadgeHiddenText', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    await api.setSettings({ theme: 'system', shape: 'pill', sizeMode: 'fixed', sizePreset: 'Medium', fineTune: 100 });
    await api.setSnapshot({ providers: [{ id: 'claude', plan: 'DEMO', state: 'STALE', windows: [{ kind: 'session', used_percent: 42, resets_at: '2099-01-01T00:00:00Z' }] }] });
    const badge = document.querySelector('.status-badge');
    const fontSize = getComputedStyle(badge).fontSize;
    if (document.documentElement.dataset.readableSize !== 'true') throw new Error('Readable size mode is not active');
    if (fontSize !== '0px') throw new Error('Expected hidden badge font-size 0px, got ' + fontSize);
    if (badge.textContent !== 'STALE') throw new Error('Badge text was changed');
    return 'PASS: pill-status-badge-hidden-text (readable size keeps computed font-size at 0px)';
  })()`);
  executedRegressions.push({ name: 'pill-status-badge-hidden-text', result: resPillStatusBadgeHiddenText });

  // ==========================================
  // 5. `fit-strip`
  // The strip never covers most of the screen, at every Fit choice.
  // ==========================================
  const resFitStrip = await evaluate('FitStrip', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    const monitor = { width: 1920, height: 1080, scale: 1, primary: true };
    await api.setWorkArea([monitor]);
    const maxAllowedArea = 0.5 * (monitor.width - 24) * (monitor.height - 24);

    for (const fraction of [1, 0.75, 0.5, 0.3333333333333333]) {
      await api.setSettings({ theme: 'compact-strip', shape: 'strip', sizeMode: 'screen', fitFraction: fraction, fineTune: 100 });
      const rect = document.querySelector('#widget').getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxAllowedArea) {
        throw new Error(\`Strip exceeded screen budget at fraction \${fraction}: area \${area} > \${maxAllowedArea}\`);
      }
    }
    return 'PASS: fit-strip (strip area bounded within 50% screen budget)';
  })()`);
  executedRegressions.push({ name: 'fit-strip', result: resFitStrip });

  // ==========================================
  // 6. `portrait-not-clipped`
  // Portrait at every size with quote on and off: all provider cards fully in view, no scrollbars.
  // ==========================================
  const resPortraitNotClipped = await evaluate('PortraitNotClipped', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    const monitor = { width: 1920, height: 1080, scale: 1, primary: true };
    await api.setWorkArea([monitor]);
    await api.setSnapshot({
      providers: ['claude', 'codex', 'gemini'].map(id => ({
        id, state: 'OK', windows: [{ kind: 'session', used_percent: 50 }, { kind: 'weekly', used_percent: 70 }]
      }))
    });

    const sizes = ['Small', 'Medium', 'Large', 'X-Large', '2X-Large'];
    for (const sizePreset of sizes) {
      for (const quoteEnabled of [false, true]) {
        await api.setSettings({ theme: 'system', sizeMode: 'fixed', fineTune: 100, shape: 'portrait', sizePreset, quoteEnabled, fitHeight: true });
        const shell = document.querySelector('#widget').getBoundingClientRect();
        for (const card of document.querySelectorAll('.provider-card')) {
          const r = card.getBoundingClientRect();
          if (r.top < shell.top - 1 || r.bottom > shell.bottom + 1 || r.left < shell.left - 1 || r.right > shell.right + 1) {
            throw new Error(\`Card clipped outside widget shell at preset \${sizePreset}, quote: \${quoteEnabled}\`);
          }
          if (card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1) {
            throw new Error(\`Card has scrollbars at preset \${sizePreset}, quote: \${quoteEnabled}\`);
          }
        }
      }
    }
    return 'PASS: portrait-not-clipped (all provider cards in view across sizes with/without quote)';
  })()`);
  executedRegressions.push({ name: 'portrait-not-clipped', result: resPortraitNotClipped });

  // ==========================================
  // 6. `portrait-gap`
  // Card gaps stay under the limit used by portrait-gap-check.mjs.
  // ==========================================
  const resPortraitGap = await evaluate('PortraitGap', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    await api.setSettings({ shape: 'portrait', sizePreset: 'Medium', fitHeight: true });
    const cards = [...document.querySelectorAll('.provider-card')];
    const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);

    for (let i = 0; i < cards.length - 1; i++) {
      const topRect = cards[i].getBoundingClientRect();
      const bottomRect = cards[i + 1].getBoundingClientRect();
      const gap = bottomRect.top - topRect.bottom;
      const limit = Math.max(2.5 * fontSize, topRect.height * 0.12) + 1;
      if (gap > limit) {
        throw new Error(\`Card gap \${gap} exceeds limit \${limit}\`);
      }
    }
    return 'PASS: portrait-gap (card gaps stay under limit)';
  })()`);
  executedRegressions.push({ name: 'portrait-gap', result: resPortraitGap });

  // ==========================================
  // 7. `circle-no-float`
  // No label in any shape shows more than the intended decimals (no 18.3349).
  // ==========================================
  const resCircleNoFloat = await evaluate('CircleNoFloat', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    await api.setSnapshot({providers:['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:[21.4,8.25,18.334913][i]}]}))});
    const floatPattern = /\\d+\\.\\d{3,}/;

    for (const shape of ['portrait', 'landscape', 'square', 'circle', 'pill']) {
      await api.setSettings({ shape, sizePreset: 'Medium' });
      const text = document.querySelector('#widget').textContent;
      const match = text.match(floatPattern);
      if (match) {
        throw new Error(\`Shape \${shape} contains unintended decimal float: \${match[0]}\`);
      }
    }
    return 'PASS: circle-no-float (no float labels with >2 decimals)';
  })()`);
  executedRegressions.push({ name: 'circle-no-float', result: resCircleNoFloat });

  // ==========================================
  // 8. `featured-quote-scroll`
  // Featured card plus quote never shows a scrollbar, in all themes.
  // ==========================================
  const resFeaturedQuoteScroll = await evaluate('FeaturedQuoteScroll', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    const themes = api.themes.map(t => t.id);

    for (const theme of themes) {
      await api.setSettings({
        theme,
        shape: 'portrait',
        featuredProvider: 'claude',
        featuredPosition: 'top',
        quoteEnabled: true,
        sizePreset: 'Medium'
      });
      const widget = document.querySelector('#widget');
      if (widget.scrollHeight > widget.clientHeight + 1) {
        throw new Error(\`Widget has scrollbar with featured card + quote on theme \${theme}\`);
      }
    }
    return 'PASS: featured-quote-scroll (no scrollbar in any theme)';
  })()`);
  executedRegressions.push({ name: 'featured-quote-scroll', result: resFeaturedQuoteScroll });

  // ==========================================
  // 9. `quote-ellipsis`
  // A very long quote ends in an ellipsis and opens in full.
  // ==========================================
  const resQuoteEllipsis = await evaluate('QuoteEllipsis', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    const longQuote = 'This is an exceedingly long quote intended to test text truncation and ellipsis handling. '.repeat(100);
    await api.setQuote({
      status: 'ok',
      cards: [{ quote: longQuote, author: 'Verbose Thinker', reason: 'Stress test', license: 'CC BY-SA 4.0' }]
    });
    await api.setSettings({ shape: 'portrait', quoteEnabled: true });

    const quoteTextBtn = document.querySelector('.quote-text') || document.querySelector('.quote-source');
    if (!quoteTextBtn) throw new Error('Quote text button not found');

    // Trigger full modal dialog
    quoteTextBtn.click();
    await new Promise(r => setTimeout(r, 40));
    const dialog = document.querySelector('dialog.quote-dialog');
    if (!dialog || !dialog.open) throw new Error('Modal quote dialog did not open');
    if (!dialog.querySelector('p').textContent.includes(longQuote)) throw new Error('Dialog missing full quote');
    const shown = quoteTextBtn.textContent;
    if (shown === longQuote || !shown.endsWith('…') || !longQuote.startsWith(shown.slice(0,-1))) throw new Error('Truncated quote lacks honest ellipsis');
    if (!dialog.textContent.includes('Verbose Thinker')) throw new Error('Dialog missing quote author');
    dialog.close();

    return 'PASS: quote-ellipsis (long quote truncated in card and opens in full dialog)';
  })()`);
  executedRegressions.push({ name: 'quote-ellipsis', result: resQuoteEllipsis });

  // ==========================================
  // 10. `provider-order`
  // With First in list, moving a provider to the top makes it the big card right away, quote on and off.
  // ==========================================
  const resProviderOrder = await evaluate('ProviderOrder', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    for (const quoteEnabled of [false, true]) {
      await api.setSettings({
        shape: 'portrait',
        featuredProvider: 'first',
        providerOrder: ['codex', 'claude', 'gemini'],
        quoteEnabled
      });
      const firstCard = document.querySelector('.provider-card');
      if (firstCard.dataset.provider !== 'codex' || !firstCard.classList.contains('featured-provider')) {
        throw new Error(\`First card is not Codex when moved to top with quote: \${quoteEnabled}\`);
      }
    }
    return 'PASS: provider-order (top provider immediately becomes featured card)';
  })()`);
  executedRegressions.push({ name: 'provider-order', result: resProviderOrder });

  // ==========================================
  // 11. `save-honest`
  // When the save IPC fails, the UI shows failure, not success.
  // ==========================================
  await b.navigate('/?settings', 'window.__SETTINGS_READY__');
  const resSaveHonest = await evaluate('SaveHonest', `(async () => {
    const $ = s => document.querySelector(s);
    const native = window.__FAKE_NATIVE__;
    $('[data-category="shape-size"]').click();
    $('#scale').value = 95;
    $('#scale').dispatchEvent(new Event('input'));
    native.fail = 'save_settings';
    $('#save').click();
    await new Promise(r => setTimeout(r, 50));
    const status = $('#status');
    if (status.dataset.state !== 'failure') {
      throw new Error(\`Expected status failure, got \${status.dataset.state}\`);
    }
    if ($('#save').disabled) {
      throw new Error('Save button was permanently disabled on failure instead of remaining retryable');
    }
    native.fail = null;
    return 'PASS: save-honest (status state failure shown and save remains retryable)';
  })()`);
  executedRegressions.push({ name: 'save-honest', result: resSaveHonest });

  // ==========================================
  // 12. `palette-all-themes`
  // Every theme has 12 palettes; choosing each visibly changes the widget.
  // ==========================================
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  const resPaletteAllThemes = await evaluate('PaletteAllThemes', `(async () => {
    const api = window.__AI_USAGE_DEMO__;
    const themes = api.themes;
    let checkedPalettes = 0;

    for (const theme of themes) {
      const palettes = Object.keys(theme.palettes);
      if (palettes.length !== 12) {
        throw new Error(\`Theme \${theme.id} has \${palettes.length} palettes instead of 12\`);
      }
      const appearances = new Set();
      for (const palette of palettes) {
        await api.setSettings({ theme: theme.id, palette });
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
        appearances.add(accent.trim() + getComputedStyle(document.querySelector('#widget')).backgroundColor);
        if (!accent) throw new Error(\`Missing --accent in theme \${theme.id} palette \${palette}\`);
        checkedPalettes++;
      }
      if (appearances.size !== 12) throw new Error('Palette choices do not visibly differ in '+theme.id);
    }
    return \`PASS: palette-all-themes (\${checkedPalettes} palettes checked across \${themes.length} themes)\`;
  })()`);
  executedRegressions.push({ name: 'palette-all-themes', result: resPaletteAllThemes });

  // ==========================================
  // 13. `user-palette-flow`
  // Create, edit a color, see the widget change, save, reload, export, import, delete.
  // ==========================================
  await b.navigate('/?settings', 'window.__SETTINGS_READY__');
  const resUserPaletteFlow = await evaluate('UserPaletteFlow', `(async () => {
    const $ = s => document.querySelector(s);
    const native = window.__FAKE_NATIVE__;
    const settle = () => new Promise(r => setTimeout(r, 50));

    $('[data-category="theme"]').click();
    const newBtn = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === 'New palette');
    newBtn.click();
    await settle();

    if (native.previews.at(-1)?.userPalettes?.length !== 1) {
      throw new Error('New palette was not dispatched in preview');
    }

    const color=$('#palette-tools input[aria-label="dark accent hex"]');
    color.value='#b85d40';color.dispatchEvent(new Event('input'));await settle();
    if(native.previews.at(-1).userPalettes[0].dark.accent !== '#b85d40') throw new Error('Edited color not previewed');
    // Save
    $('#save').click();
    await settle();
    if (native.saves.at(-1)?.userPalettes?.length !== 1) {
      throw new Error('User palette was not persisted on save');
    }

    // Reload / reopen session
    await native.reopen();
    await settle();

    // Export
    const expBtn = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === 'Export');
    expBtn.click();
    const textarea = $('#palette-tools textarea[aria-label="Palette JSON"]');
    const exportedJson = textarea.value;
    if (!exportedJson.includes('user-')) throw new Error('Exported JSON missing user palette data');

    const original=JSON.parse(exportedJson);
    original[0].id='user-imported';original[0].name='Imported fictional palette';
    textarea.value=JSON.stringify(original);
    [...document.querySelectorAll('#palette-tools button')].find(b=>b.textContent==='Import').click();await settle();
    if(native.previews.at(-1).userPalettes.length!==2)throw new Error('Import did not add palette');

    // Delete
    const delBtn = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === 'Delete');
    delBtn.click();
    await settle();
    const confirmBtn = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === 'Delete palette');
    confirmBtn.click();
    await settle();

    [...document.querySelectorAll('#palette-tools button')].find(b=>b.textContent==='Show all').click();
    const remainingName=native.previews.at(-1).userPalettes[0].name;
    [...document.querySelectorAll('#palette-grid button')].find(b=>b.querySelector('span').textContent===remainingName).click();await settle();
    delBtn.click();await settle();confirmBtn.click();await settle();
    $('#save').click();
    await settle();
    if (native.saves.at(-1)?.userPalettes?.length !== 0) {
      throw new Error('Deleted user palette was not removed from saved settings');
    }

    return 'PASS: user-palette-flow (create, edit, preview, save, reload, export, import, delete)';
  })()`);
  executedRegressions.push({ name: 'user-palette-flow', result: resUserPaletteFlow });

  // Native-sized Portrait with all supported provider counts and size choices.
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  try {
    const rows = await portraitManyProviders(b);
    const failures = rows.filter(row => row.errors.length);
    if (failures.length) throw new Error(`${failures.length}/${rows.length} cases: ${JSON.stringify(failures[0])}`);
    executedRegressions.push({ name: 'portrait-many-providers', result: `PASS: ${rows.length} capped native viewport cases` });
  } catch (error) {
    process.exitCode = 1;
    executedRegressions.push({ name: 'portrait-many-providers', result: `FAIL: ${error.message}` });
  }

  try {
    await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
    await b.evaluate(`window.__AI_USAGE_DEMO__.setWorkArea([{width:1536,height:960,scale:1,primary:true}])`);
    await b.cdp('Emulation.setDeviceMetricsOverride', { width: 460, height: 880, deviceScaleFactor: 1, mobile: false });
    const providers = ['codex', 'claude', 'gemini'].map(id => ({ id, state: 'OK', plan: 'Pro', windows: [{ kind: 'session', used_percent: 54 }, { kind: 'weekly', used_percent: 61 }] }));
    await b.evaluate(`window.__AI_USAGE_DEMO__.setSnapshot(${JSON.stringify({ providers })})`);
    let cases = 0;
    for (const theme of ['system', 'brutalist', 'terminal']) for (const shape of ['portrait', 'landscape', 'square']) for (const size of ['sizeMode:"fixed",sizePreset:"Small"', 'sizeMode:"fixed",sizePreset:"Medium"', 'sizeMode:"screen",fitFraction:1']) {
      await b.evaluate(`window.__AI_USAGE_DEMO__.setSettings({theme:'${theme}',shape:'${shape}',quoteEnabled:true,fineTune:100,fitFineTune:100,${size}})`);
      await new Promise(resolve => setTimeout(resolve, 60));
      const broken = await b.evaluate(`[...document.querySelectorAll('#providers .window-top>span')].filter(el=>{const range=document.createRange();range.selectNodeContents(el);return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size>1}).map(el=>el.textContent)`);
      if (broken.length) throw new Error(`${theme}/${shape}/${size}: ${broken[0]} wraps`);
      cases++;
    }
    executedRegressions.push({ name: 'quota-labels-whole', result: `PASS: ${cases} labels stay on one line` });
  } catch (error) {
    process.exitCode = 1;
    executedRegressions.push({ name: 'quota-labels-whole', result: `FAIL: ${error.message}` });
  }

  // Summary
  console.log(`\n${executedRegressions.length} Named Regression Results:`);
  for (const reg of executedRegressions) {
    console.log(`  ${reg.result.startsWith('FAIL:') ? '✗' : '✓'} ${reg.name}: ${reg.result}`);
  }

} finally {
  await b.close();
}
