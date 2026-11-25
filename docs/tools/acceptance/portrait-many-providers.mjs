import { normalizeSize, fittedGeometry, sizePresets } from '../../../app/src/sizing.js';

// Native fits the measured shell, capped to the monitor, rather than keeping
// the geometry estimate as the viewport (or allowing an unbounded browser page).
export async function portraitManyProviders(b) {
  const results = [];
  for (const monitor of [
    { width: 1366, height: 768, scale: 1, primary: true },
    { width: 1536, height: 960, scale: 1.25, primary: true },
    { width: 1920, height: 1080, scale: 1, primary: true }
  ]) for (const count of [4, 6, 7]) for (const choice of [...Object.keys(sizePresets), 1, .75, .5, 1/3]) for (const quoteEnabled of [false, true]) {
    const settings = normalizeSize({ theme: 'system', shape: 'portrait', sizeMode: typeof choice === 'number' ? 'screen' : 'fixed', sizePreset: typeof choice === 'string' ? choice : 'Medium', fineTune: 100, fitFineTune: 100, fitFraction: typeof choice === 'number' ? choice : 1, quoteEnabled, fitHeight: true, featuredProvider: 'first', featuredPosition: 'bottom', position: 'Top right', linux: { margin: 12 } });
    const box = fittedGeometry(settings, count, monitor);
    const viewport = height => b.cdp('Emulation.setDeviceMetricsOverride', { width: Math.round(box.width), height: Math.max(1, Math.ceil(height)), deviceScaleFactor: 1, mobile: false });
    await viewport(box.availableHeight);
    await b.evaluate(`(async () => {
      const api = window.__AI_USAGE_DEMO__;
      await api.setWorkArea([${JSON.stringify(monitor)}]);
      await api.setSettings(${JSON.stringify(settings)});
      await api.setSnapshot({providers: ['claude','codex','gemini','copilot','cursor','opencode','antigravity'].slice(0,${count}).map(id => ({id,state:'OK',plan:'DEMO',windows:[{kind:'session',used_percent:42,resets_at:'2099-01-01T00:00:00Z'},{kind:'weekly',used_percent:68,resets_at:'2099-01-02T00:00:00Z'}]}))});
      await api.setQuote({status:'ok',cards:[{quote:'Patient work makes room for a clear thought. '.repeat(4),author:'Example Author',reason:'Fictional selection'}]});
      await document.fonts.ready;
    })()`);
    const measured = await b.evaluate(`document.querySelector('#widget').getBoundingClientRect().height`);
    await viewport(Math.min(measured, box.availableHeight));
    const metrics = await b.evaluate(`(async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const errors = [], list = document.querySelector('#providers'), shell = document.querySelector('#widget'), footer = document.querySelector('.footer');
      const visible = el => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
      const bounds = list.getBoundingClientRect();
      if (shell.getBoundingClientRect().bottom > innerHeight + 1) errors.push('shell outside capped viewport');
      if (!visible(footer)) errors.push('footer hidden');
      if (visible(footer) && footer.getBoundingClientRect().bottom > innerHeight + 1) errors.push('footer outside capped viewport');
      if (visible(footer) && bounds.bottom > footer.getBoundingClientRect().top + 1) errors.push('list overlaps footer');
      if (list.scrollWidth > list.clientWidth + 1) errors.push('list horizontal overflow');
      if (list.scrollHeight > list.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(list).overflowY)) errors.push('list overflow inaccessible');
      for (const card of list.querySelectorAll('.provider-card')) {
        if (card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1) errors.push('card content clipped');
        list.scrollTop += card.getBoundingClientRect().top - bounds.top;
        const r = card.getBoundingClientRect();
        if (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1) errors.push('card inaccessible');
      }
      list.scrollTop = list.scrollHeight;
      if (list.lastElementChild.getBoundingClientRect().bottom > bounds.bottom + 1) errors.push('last card inaccessible');
      list.scrollTop = 0;
      const quote = document.querySelector('#quote');
      if (visible(quote) && (quote.getBoundingClientRect().bottom > shell.getBoundingClientRect().bottom + 1 || quote.scrollHeight > quote.clientHeight + 1)) errors.push('quote clipped');
      if (visible(quote)) {
        quote.querySelector('.quote-source').click();
        const dialog = document.querySelector('.quote-dialog');
        if (!dialog?.open || !dialog.textContent.includes('Patient work')) errors.push('full quote inaccessible');
        dialog?.close();
      }
      return {errors: [...new Set(errors)], scrolling: list.scrollHeight > list.clientHeight + 1, height: shell.getBoundingClientRect().height};
    })()`);
    results.push({ screen: `${monitor.width}x${monitor.height}@${monitor.scale}`, count, choice, quoteEnabled, ...metrics });
  }
  return results;
}
