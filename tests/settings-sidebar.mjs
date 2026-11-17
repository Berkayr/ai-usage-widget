// Synthetic browser coverage; no native app, credentials or user files are read.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {browser} from '../docs/tools/browser-harness.mjs';
import {auditSettings} from '../docs/tools/settings-contrast-audit.mjs';
const screenshots = process.env.SETTINGS_SCREENSHOTS;
const b = await browser();
try {
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', {source:`(() => {
    const callbacks = new Map(), events = new Map();
    let next = 0, disk = {theme:'system', palette:'default'};
    const state = window.__FAKE_NATIVE__ = {calls:[], previews:[], saves:[], hidden:0, fail:null, mismatch:false, historyPermission:false};
    state.emit = async event => {for (const [id, name] of events) if (name === event) await callbacks.get(id)({event, id, payload:{}});};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener:(_, id) => events.delete(id)};
    window.__TAURI_INTERNALS__ = {
      metadata:{currentWindow:{label:'settings'},currentWebview:{label:'settings'}},
      transformCallback:callback => {const id = ++next; callbacks.set(id, callback); return id;},
      invoke:async (cmd, args = {}) => {
        state.calls.push(cmd);
        if (cmd === state.fail) throw Error('Synthetic failure: ' + cmd);
        if (cmd === 'load_settings') {const value = structuredClone(disk); if (state.mismatch) delete value.fineTune; return value;}
        if (cmd === 'get_snapshot') return {snapshot:{providers:['claude','codex'].map(id => ({id,state:'OK'}))}};
        if (cmd === 'get_provider_config') return {initialized:true,providers:{claude:{enabled:true,local_history:state.historyPermission},codex:{enabled:true}},disclosures:{claude:'Synthetic quota metadata',codex:'Synthetic quota metadata'},detected:{}};
        if (cmd === 'set_local_history') {state.historyPermission=args.enabled;return;}
        if (cmd === 'get_autostart') return false;
        if (cmd === 'get_desktop_info') return {platform:'linux',layerShell:true};
        if (cmd === 'get_placement_monitors') return {layerShell:true,monitors:[{name:'Synthetic display',width:1920,height:1080,primary:true}],widgetWidth:340,widgetHeight:600};
        if (cmd === 'get_runtime_diagnostics') return {paths:{python_version:'3.x',runtime_source:'synthetic'}};
        if (cmd === 'preview_settings') {await new Promise(r => setTimeout(r,5)); state.previews.push(structuredClone(args.settings)); return;}
        if (cmd === 'save_settings') {disk = structuredClone(args.settings); state.saves.push(disk); return;}
        if (['configure_providers','set_autostart','refresh_now','plugin:window|set_title'].includes(cmd)) return;
        if (cmd === 'finish_settings') {state.hidden++; return;}
        if (cmd === 'plugin:event|listen') {events.set(args.handler,args.event); return args.handler;}
        if (cmd === 'plugin:event|unlisten') {events.delete(args.eventId); return;}
        throw Error('Unexpected synthetic IPC: ' + cmd);
      }
    };
  })()`});
  await b.navigate('/?settings', 'window.__SETTINGS_READY__');
  console.log(await b.evaluate(`(async () => {
    const $ = s => document.querySelector(s), check = (v, s) => {if (!v) throw Error(s);};
    const native = window.__FAKE_NATIVE__, wait = () => new Promise(r => setTimeout(r,30));
    const visible = () => [...document.querySelectorAll('[data-category]')].filter(t => !t.hidden);
    check($('#status').dataset.state === 'clean', 'Initialization: ' + $('#status').textContent);
    check(visible().map(t => t.dataset.category).join() === 'general,quote,theme,colors,shape-size,display,providers,history,about', 'Linux categories');
    check(!document.querySelector('[data-category=appearance]'), 'Appearance category removed');
    const kids = id => [...$(id).children].filter(el => !el.classList.contains('widget-reset'));
    check(kids('#category-shape-size')[1].classList.contains('shape-picker'), 'Shape is the first Shape & Size control');
    check(kids('#category-shape-size')[2].id === 'widget-provider-choices', 'Circle/pill provider choices follow Shape');
    check(kids('#category-display')[0].tagName === 'H1' && kids('#category-display')[1].id === 'monitor-map', 'Monitor map is the first Display control');
    check(!$('#category-general').hidden, 'Default category');
    check($('#category-quote label input')?.id === 'quote-enabled', 'Quote tab starts with the enable switch');
    check($('#category-history').textContent.split("Counts tokens from this computer's logs. Nothing is stored.").length - 1 === 1, 'History privacy explanation appears once');
    $('[data-category=general]').focus();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    check(document.activeElement.dataset.category === 'quote' && !$('#category-quote').hidden, 'Down selects and focuses Quote');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    check(document.activeElement.dataset.category === 'general', 'Up selects and focuses');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
    check(document.activeElement.dataset.category === 'about', 'End skips hidden Taskbar');
    check(visible().filter(t => t.tabIndex === 0).length === 1, 'Roving tab stop');
    $('[data-category=history]').click();
    const layout=$('#history-panel-layout'),historyMode=$('#history-mode');
    check(layout.disabled,'Panel layout disabled outside side panel');
    historyMode.value='panel';historyMode.dispatchEvent(new Event('change'));await wait();
    layout.value='single';layout.dispatchEvent(new Event('change'));await wait();
    check(!layout.disabled && $('#history-preview').dataset.layout==='single','Panel layout draft and preview');
    $('#revert').click();await wait();
    check(historyMode.value==='card' && layout.value==='stacked' && layout.disabled,'Panel layout Revert');
    historyMode.value='panel';historyMode.dispatchEvent(new Event('change'));
    layout.value='single';layout.dispatchEvent(new Event('change'));$('#save').click();await wait();
    check(native.saves.at(-1).historyPanelLayout==='single' && $('#save').disabled,'Panel layout verified Save');
    $('#local-history').click();await wait();
    check(!native.calls.includes('set_local_history'), 'Log permission stays draft');
    $('#revert').click();check(!$('#local-history').checked,'Revert log permission');
    $('#local-history').click();native.fail='set_local_history';$('#save').click();await wait();
    check($('#status').dataset.state==='failure' && !$('#save').disabled,'Permission failure stays retryable');
    native.fail=null;$('#save').click();await wait();
    check($('#save').disabled && $('#local-history').checked,'Verified log permission Save');
    $('#local-history').click();$('#save').click();await wait();
    check($('#save').disabled && !$('#local-history').checked,'Disable log permission');
    $('#local-history').click();$('#quote-enabled').click();native.fail='save_settings';$('#save').click();await wait();
    check(native.historyPermission && $('#status').textContent.includes('History permission saved'),'Permission remains enabled after later Save failure');
    $('#revert').click();await wait();
    check($('#local-history').checked === native.historyPermission && !$('#quote-enabled').checked,'Revert reflects persisted enabled permission');
    $('#local-history').click();$('#quote-enabled').click();$('#save').click();await wait();
    check(!native.historyPermission && $('#status').textContent.includes('History permission saved'),'Permission remains disabled after later Save failure');
    $('#revert').click();await wait();
    check($('#local-history').checked === native.historyPermission,'Revert reflects persisted disabled permission');
    native.fail=null;
    native.saves.length=0;
    $('[data-category=theme]').click();
    native.calls.length = 0;
    $('#quote-enabled').click(); $('#start-at-login').click();
    $('[data-theme=dot-matrix]').click();
    $('#provider-settings input').click();
    check(/^[1-9][0-9]* unsaved changes$/.test($('#status').textContent), 'Counted dirty status');
    await wait();
    check(native.previews.at(-1).theme === 'dot-matrix' && native.previews.at(-1).quoteEnabled, 'Immediate widget preview');
    check(!native.calls.some(c => ['save_settings','configure_providers','set_autostart'].includes(c)), 'No persistent effects before Save');
    $('#revert').click(); await wait();
    check(native.previews.at(-1).theme === 'system' && !native.previews.at(-1).quoteEnabled, 'Revert restores widget');
    check($('#save').disabled && !$('#quote-enabled').checked && !$('#start-at-login').checked, 'Revert restores every draft');
    $('#place').click();
    $('#map-widget').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
    $('#save-position').click();
    check(native.saves.length === 0 && !native.calls.includes('begin_placement') && !$('#save').disabled, 'Map placement previews without starting native placement or writing disk');
    $('#revert').click();
    $('#scale').value = 120; $('#scale').dispatchEvent(new Event('input'));
    await native.emit('tauri://close-requested');
    check(!$('#close-prompt').hidden, 'Unsaved close prompt');
    $('#close-cancel').click(); check($('#close-prompt').hidden, 'Cancel close');
    native.fail = 'save_settings'; $('#save').click(); await wait();
    check($('#status').dataset.state === 'failure' && !$('#save').disabled, 'IPC failure remains retryable');
    native.fail = null; native.mismatch = true; $('#save').click(); await wait();
    check($('#status').textContent.includes('fineTune'), 'Read-back detects a dropped serde field');
    native.mismatch = false; $('#save').click(); await wait();
    check($('#save').disabled && $('#status').textContent.startsWith('✓ Saved at'), 'Verified Save');
    check(native.saves.at(-1).fineTune === 120, 'Saved scale');
    check(native.previews.at(-1).fineTune === 120, 'Saved draft remains previewed');
    $('#scale').value = 125; $('#scale').dispatchEvent(new Event('input'));
    await native.emit('tauri://close-requested'); $('#close-discard').click(); await wait();
    check(native.hidden === 1 && native.previews.at(-1).fineTune === 120, 'Discard restores widget before closing');
    await native.emit('settings-reopened');
    check($('#scale').value === '120' && $('#save').disabled, 'Reopen restores saved settings');
    $('[data-category=providers]').click();
    $('[data-layout-provider=codex] button').click();
    $('#featured-provider').value = 'codex'; $('#featured-provider').dispatchEvent(new Event('change'));
    $('#save').click(); await wait();
    check(native.saves.at(-1).providerOrder[0] === 'codex' && native.saves.at(-1).featuredProvider === 'codex', 'Provider layout Save');
    $('[data-category=colors]').click();
    const paletteButton = name => [...document.querySelectorAll('#palette-tools button')].find(b => b.textContent === name);
    paletteButton('New palette').click();
    check(!$('#save').disabled, 'Palette creation is a draft');
    $('#save').click(); await wait();
    check(native.saves.at(-1).userPalettes.length === 1 && $('#save').disabled, 'Palette verified Save');
    const name = $('[data-palette-name]'); name.value = 'Unsaved'; name.dispatchEvent(new Event('input'));
    $('#revert').click(); check($('[data-palette-name]').value !== 'Unsaved', 'Palette edit Revert');
    paletteButton('Delete').click(); paletteButton('Delete palette').click();
    $('#save').click(); await wait();
    check(native.saves.at(-1).userPalettes.length === 0 && $('#save').disabled, 'Last palette deletion Save');
    return 'PASS: keyboard, Save/Revert, live preview without persistence, placement draft, errors, serde read-back, close/reopen, provider layout and user palettes';
  })()`));
  await b.evaluate(`localStorage.setItem('settings-category','appearance')`);
  await b.navigate('/?settings&sample', 'window.__SETTINGS_READY__');
  assert.equal(await b.evaluate(`document.querySelector('[aria-selected=true]').dataset.category`), 'theme', 'Legacy appearance category maps to Theme');
  const bindings = Object.keys(Function('return (' + (await readFile(new URL('../app/src/settings-window.js',import.meta.url),'utf8')).match(/export const bindings = ([\s\S]*?);/)[1] + ')')());
  assert.equal(await b.evaluate(`(${JSON.stringify(bindings)}).every(id => document.getElementById(id))`), true, 'All original binding IDs exist');
  assert.equal(await b.evaluate(`document.querySelector('#category-history').querySelectorAll('input,select').length`), 8);
  assert.equal(await b.evaluate(`/coming soon/i.test(document.querySelector('#category-history').textContent)`), false);
  assert.equal(await b.evaluate(`document.querySelectorAll('#settings>section').length`), 10);
  const destinations = {
    general:['start-at-login','show-extra-windows','autostart-status'],
    quote:['quote-enabled','quote-mode','quote-position','quote-navigation'],
    theme:['theme-picker','dot-count','reactor-motion'],
    colors:['palette','palette-grid','palette-tools','appearance','color-mode','accent','background','widget-opacity','background-opacity','accent-edge'],
    'shape-size':['scale','size-mode','fit-screen','reset-fine-tune','fit-height','match-physical-size','fit-fraction','fit-fine-tune','widget-provider-choices'],
    display:['reserved-top','reserved-bottom','position','place','lock-position','monitor-map','map-widget','placement-monitor','snap','disconnected','fallback-monitor','save-position','cancel-position','linux-layer','linux-margin','linux-monitor'],
    providers:['provider-settings','provider-order','featured-provider','featured-position','provider-colors'],
    taskbar:['taskbar-enabled','taskbar-style','taskbar-theme','taskbar-window','taskbar-bars'],
    about:['runtime-diagnostics','app-version','data-folder']
  };
  assert.deepEqual(await b.evaluate(`Object.entries(${JSON.stringify(destinations)}).flatMap(([category, ids]) => ids.filter(id => !document.getElementById(id)?.closest('#category-' + category)))`), [], 'Control destination inventory');
  assert.equal(await b.evaluate(`new Set([...document.querySelectorAll('[id]')].map(el => el.id)).size === document.querySelectorAll('[id]').length`), true, 'Unique IDs');

  let combinations = 0;
  for (const scheme of ['light','dark']) {
    await b.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
    for (const platform of ['linux','windows']) {
      await b.navigate('/?settings&sample&platform=' + platform, 'window.__SETTINGS_READY__');
      assert.equal(await b.evaluate(`document.querySelector('[data-category=taskbar]').hidden`), platform !== 'windows');
      for (const width of [900,559,400]) {
        await b.cdp('Emulation.setDeviceMetricsOverride',{width,height:width === 900 ? 680 : 480,deviceScaleFactor:1,mobile:false});
        await b.evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
        const result = await b.evaluate(`(() => {
          const tabs = [...document.querySelectorAll('[data-category]')].filter(t => !t.hidden);
          for (const tab of tabs) {
            tab.click();
            const content = document.querySelector('.settings-content');
            if (content.scrollWidth > content.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth) throw Error('Overflow: ' + tab.dataset.category + ' at ' + innerWidth);
            const nav = document.querySelector('[role=tablist]'), navRect = nav.getBoundingClientRect(), tabRect = tab.getBoundingClientRect();
            if (innerWidth < 560 && (tabRect.left < navRect.left || tabRect.right > navRect.right)) throw Error('Active tab is not fully visible: ' + tab.dataset.category);
            if (tab.scrollWidth > tab.clientWidth + 1) throw Error('Tab label is clipped: ' + tab.dataset.category);
            if (innerWidth < 560 && tab.dataset.category === 'display' && document.querySelector('#monitor-map').getBoundingClientRect().height > 161) throw Error('Narrow monitor map is too tall');
            if (innerWidth < 560 && tab.dataset.category === 'providers') {
              const color = document.querySelector('[data-provider-color=claude]'), reset = color.nextElementSibling;
              if (Math.abs(color.getBoundingClientRect().top - reset.getBoundingClientRect().top) > 2) throw Error('Provider color controls do not share a row');
            }
          }
          if (innerWidth < 560 && document.querySelector('[role=tablist]').scrollWidth <= document.querySelector('[role=tablist]').clientWidth) throw Error('Narrow category tabs are not scrollable');
          return document.querySelector('[role=tablist]').getAttribute('aria-orientation');
        })()`);
        assert.equal(result, width < 560 ? 'horizontal' : 'vertical');
        combinations++;
        if (screenshots && platform === 'windows' && width !== 559) {
          await mkdir(screenshots,{recursive:true});
          for (const category of ['general','quote','theme','colors','shape-size','display','providers','history','taskbar','about']) {
            await b.evaluate(`document.querySelector('[data-category=${category}]').click();document.querySelector('.settings-content').scrollTop=0`);
            const png = await b.cdp('Page.captureScreenshot',{format:'png'});
            await writeFile(screenshots + '/' + category + '-' + scheme + '-' + width + '.png',Buffer.from(png.data,'base64'));
            const details = category === 'colors' ? ['palette-grid'] : category === 'providers' ? ['provider-colors'] : category === 'shape-size' ? ['scale'] : category === 'display' ? ['place'] : [];
            for (const id of details) {
                await b.evaluate(`document.getElementById('${id}').scrollIntoView({block:'center'})`);
                const detail = await b.cdp('Page.captureScreenshot',{format:'png'});
                await writeFile(screenshots + '/detail-' + id + '-' + scheme + '-' + width + '.png',Buffer.from(detail.data,'base64'));
            }
          }
        }
      }
    }
  }
  console.log(await b.evaluate(`(() => {
    const $ = s => document.querySelector(s);
    $('[data-category=theme]').click();
    const themes = [...document.querySelectorAll('[data-theme]')];
    for (const theme of themes) {
      theme.click();
      if ($('#status').dataset.state === 'failure' || theme.getAttribute('aria-pressed') !== 'true') throw Error('Theme controls: ' + theme.dataset.theme);
      if (getComputedStyle($('.setting-copy')).fontFamily !== 'system-ui, sans-serif') throw Error('System font');
    }
    return 'PASS: settings remain available across ' + themes.length + ' themes';
  })()`));
  assert.equal(await b.evaluate(`document.querySelectorAll('input[type=checkbox]:not([role=switch])').length`), 0, 'Every boolean uses a switch');
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-category] svg').length`), 10, 'Consistent menu SVGs');
  assert.equal(await b.evaluate(`document.querySelectorAll('fieldset:not(.settings-group)').length`), 0, 'Every group has a separate card');
  const contrast = await auditSettings(b);
  assert.deepEqual(contrast.failures, [], 'Chrome text contrast');
  console.log('PASS: ten categories, original bindings, platform visibility, History controls, storage, ' + combinations + ' responsive combinations, light/dark contrast');
} finally { await b.close(); }
