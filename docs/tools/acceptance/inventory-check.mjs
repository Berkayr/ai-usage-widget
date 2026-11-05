import { readFile } from 'node:fs/promises';
import { browser } from '../browser-harness.mjs';

const controlsPath = new URL('./controls.json', import.meta.url);
const controls = JSON.parse(await readFile(controlsPath, 'utf8'));

const domEntries = controls.filter(c => c.where !== 'shortcut');
const shortcutEntries = controls.filter(c => c.where === 'shortcut');

const b = await browser();

try {
  await b.cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 1, mobile: false });

  const matchedEntries = new Set();
  const unmappedLiveControls = [];
  let totalLiveElementsScanned = 0;

  // Evaluation helper to scan all interactive controls currently attached to document
  const scanScope = async (scopeName) => {
    const results = await b.evaluate(`(() => {
      const selectors = ${JSON.stringify(domEntries.map(e => ({ id: e.id, selector: e.selector, pattern: !!e.pattern })))};
      const all = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')];
      const matched = [];
      const unmapped = [];

      for (const el of all) {
        let found = null;
        for (const entry of selectors) {
          if (!entry.selector) continue;
          try {
            if (el.matches(entry.selector)) {
              found = entry.id;
              break;
            }
          } catch {}
        }
        if (found) {
          matched.push({ id: found, tag: el.tagName.toLowerCase(), elementId: el.id, className: el.className });
        } else {
          unmapped.push({
            tag: el.tagName.toLowerCase(),
            elementId: el.id,
            className: el.className,
            text: el.textContent?.trim()?.slice(0, 40) || '',
            name: el.name || '',
            outer: el.outerHTML?.slice(0, 120) || ''
          });
        }
      }
      return { total: all.length, matched, unmapped };
    })()`);

    totalLiveElementsScanned += results.total;
    for (const m of results.matched) {
      matchedEntries.add(m.id);
    }
    for (const u of results.unmapped) {
      unmappedLiveControls.push({ scope: scopeName, ...u });
    }
  };

  // 1. Walk Linux settings window across all categories
  await b.navigate('/?settings&sample&platform=linux', 'window.__SETTINGS_READY__');

  // Shell controls before navigating categories
  await scanScope('settings-shell');

  const linuxCategories = ['providers', 'appearance', 'layout', 'position', 'quote', 'desktop', 'about'];
  for (const cat of linuxCategories) {
    await b.evaluate(`document.querySelector('[data-category="${cat}"]')?.click()`);
    await new Promise(r => setTimeout(r, 40));

    if (cat === 'appearance') {
      // Expand palette swatches
      await b.evaluate(`(() => {
        const show = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent.includes('Show'));
        if (show && show.textContent === 'Show all') show.click();
      })()`);
      await scanScope('settings:appearance-swatches');

      // Click 'New palette' to open user palette editor
      await b.evaluate(`(() => {
        const create = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === 'New palette');
        create?.click();
      })()`);
      await new Promise(r => setTimeout(r, 40));
      await scanScope('settings:appearance-editor');

      // Click 'Delete' to reveal confirm & cancel buttons
      await b.evaluate(`(() => {
        const del = [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === 'Delete');
        del?.click();
      })()`);
      await new Promise(r => setTimeout(r, 40));
      await scanScope('settings:appearance-delete-confirm');
    } else if (cat === 'layout') {
      // Test different shapes to reveal shape-specific controls
      for (const shape of ['circle', 'pill', 'portrait', 'square', 'landscape']) {
        await b.evaluate(`document.querySelector('[data-shape="${shape}"]')?.click()`);
        await new Promise(r => setTimeout(r, 30));
        await scanScope(`settings:layout-${shape}`);
      }
      // Click fit-screen to reveal fit-fraction and fit-fine-tune
      await b.evaluate(`document.querySelector('[data-shape="portrait"]')?.click(); document.querySelector('#fit-screen')?.click();`);
      await new Promise(r => setTimeout(r, 30));
      await scanScope('settings:layout-screen');
      // Revert to fixed
      await b.evaluate(`document.querySelector('[data-size="Medium"]')?.click()`);
    } else if (cat === 'position') {
      // Open advanced details
      await b.evaluate(`(() => {
        const det = document.querySelector('#category-position details');
        if (det) det.open = true;
      })()`);
      await scanScope('settings:position-advanced');

      // Click 'Place widget' to enter placement mode and reveal placement actions
      await b.evaluate(`document.querySelector('#place')?.click()`);
      await new Promise(r => setTimeout(r, 30));
      await scanScope('settings:position-placing');

      // Cancel placement mode
      await b.evaluate(`document.querySelector('#cancel-position')?.click()`);
    } else {
      await scanScope(`settings:${cat}`);
    }
  }

  // 2. Walk Windows settings window (to scan Taskbar strip controls)
  await b.navigate('/?settings&sample&platform=windows', 'window.__SETTINGS_READY__');
  await b.evaluate(`document.querySelector('[data-category="taskbar"]')?.click()`);
  await new Promise(r => setTimeout(r, 40));
  await scanScope('settings:taskbar');

  // 3. Walk Widget DOM across states
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');

  // Baseline widget
  await scanScope('widget:baseline');

  // Widget context menu
  await b.evaluate(`(() => {
    document.querySelector('#widget')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
  })()`);
  await scanScope('widget:context-menu');
  await b.evaluate(`document.querySelector('#context-menu').hidden = true`);

  // Widget with quote enabled (revealing quote navigation, toggle, text, source)
  await b.evaluate(`(async () => {
    const api = window.__AI_USAGE_DEMO__;
    await api.setSettings({ quoteEnabled: true, quoteNavigation: true, shape: 'square' });
    await api.setQuote({
      status: 'ok',
      cards: [
        { quote: 'First quote test', author: 'Author 1', reason: 'Pick 1', source_url: 'https://en.wikiquote.org/wiki/Example' },
        { quote: 'Second quote test', author: 'Author 2', reason: 'Pick 2', source_url: 'https://en.wikiquote.org/wiki/Example' }
      ]
    });
  })()`);
  await new Promise(r => setTimeout(r, 50));
  await scanScope('widget:quote');

  // Open modal quote dialog
  await b.evaluate(`(() => {
    const src = document.querySelector('.quote-source') || document.querySelector('.quote-text');
    src?.click();
  })()`);
  await new Promise(r => setTimeout(r, 50));
  await scanScope('widget:quote-dialog');
  await b.evaluate(`document.querySelector('dialog.quote-dialog')?.close()`);

  // Widget with square shape and 6 providers (revealing shape pages navigation)
  await b.evaluate(`(async () => {
    const api = window.__AI_USAGE_DEMO__;
    await api.setSettings({ shape: 'square', quoteEnabled: false });
    await api.setSnapshot({
      providers: ['claude', 'codex', 'gemini', 'copilot', 'openrouter', 'deepseek'].map(id => ({
        id, state: 'OK', windows: [{ kind: 'session', used_percent: 40 }]
      }))
    });
  })()`);
  await new Promise(r => setTimeout(r, 50));
  await scanScope('widget:square-pages');

  // Widget with placement bar active
  await b.evaluate(`(async () => {
    const api = window.__AI_USAGE_DEMO__;
    await api.setSettings({ placementEditing: true });
  })()`);
  await new Promise(r => setTimeout(r, 50));
  await scanScope('widget:placement-bar');

  // Validate unmapped live controls
  let hasFailure = false;
  if (unmappedLiveControls.length > 0) {
    hasFailure = true;
    console.error(`FAIL: ${unmappedLiveControls.length} live DOM control(s) are missing from controls.json:`);
    for (const u of unmappedLiveControls) {
      console.error(`  - [${u.scope}] <${u.tag} id="${u.elementId}" class="${u.className}"> ${u.text} (${u.outer})`);
    }
  }

  // Validate missing / stale entries in controls.json
  const unmatchedDomEntries = domEntries.filter(e => !matchedEntries.has(e.id));
  if (unmatchedDomEntries.length > 0) {
    hasFailure = true;
    console.error(`FAIL: ${unmatchedDomEntries.length} entry/entries in controls.json were never matched by a live control:`);
    for (const u of unmatchedDomEntries) {
      console.error(`  - id: "${u.id}", where: "${u.where}", selector: "${u.selector}"`);
    }
  }

  // Verify shortcuts
  const knownShortcuts = [
    'shortcut:ctrl-plus',
    'shortcut:ctrl-minus',
    'shortcut:ctrl-zero',
    'shortcut:ctrl-comma',
    'shortcut:ctrl-s',
    'shortcut:escape',
    'shortcut:map-arrow-keys'
  ];
  const unmatchedShortcuts = shortcutEntries.filter(s => !knownShortcuts.includes(s.id));
  if (unmatchedShortcuts.length > 0) {
    hasFailure = true;
    console.error(`FAIL: Unrecognized keyboard shortcuts in controls.json:`, unmatchedShortcuts);
  }

  const exactCount = domEntries.filter(e => !e.pattern).length;
  const patternCount = domEntries.filter(e => !!e.pattern).length;

  console.log(`Inventory Check Summary:`);
  console.log(`- Total entries in controls.json: ${controls.length}`);
  console.log(`  * DOM exact entries: ${exactCount}`);
  console.log(`  * DOM pattern entries: ${patternCount}`);
  console.log(`  * Keyboard shortcuts: ${shortcutEntries.length}`);
  console.log(`- Live DOM controls scanned: ${totalLiveElementsScanned}`);
  console.log(`- Matched DOM entries: ${matchedEntries.size} / ${domEntries.length}`);
  console.log(`- Unmapped live controls: ${unmappedLiveControls.length}`);

  if (hasFailure) {
    process.exit(1);
  } else {
    console.log(`PASS: All live DOM controls match controls.json and every entry exists.`);
    process.exit(0);
  }
} finally {
  await b.close();
}
