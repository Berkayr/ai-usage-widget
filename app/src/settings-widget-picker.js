import {canOverride, newWidgetId, overrideKeys} from './settings-widgets.js';

export function mountWidgetPicker({sections, bindings, root, selected, select, refresh, mutate}) {
  const box = document.createElement('div');
  box.className = 'widget-picker';
  box.innerHTML = `<label for="widget-select">Widget</label><select id="widget-select"></select>
<p id="widget-monitor-status" role="status" hidden></p>
<div id="widget-add" hidden><label>Name<input id="widget-new-name" maxlength="80"></label>
<label>Monitor<select id="widget-new-monitor"></select></label><button id="widget-create">Add</button><button id="widget-add-cancel">Cancel</button></div>
<div id="widget-details" hidden><label>Name<input id="widget-name" maxlength="80"></label>
<button id="widget-remove">Remove widget</button><span id="widget-remove-confirm" hidden>Remove this widget? <button id="widget-remove-yes">Remove</button><button id="widget-remove-cancel">Cancel</button></span></div>`;
  document.querySelector('.settings-shell > nav').prepend(box);
  const $ = id => box.querySelector('#' + id);
  let monitors = [];
  $('widget-select').onchange = async () => {
    if ($('widget-select').value === '+') {
      try {
        await refresh();
        $('widget-add').hidden = false;
        $('widget-select').value = selected();
        $('widget-new-monitor').replaceChildren(...monitors.map(m => new Option(m.name, m.name)));
        $('widget-new-name').value = monitors[0]?.name || '';
        $('widget-create').disabled = !monitors.length;
        $('widget-new-name').focus();
      } catch { $('widget-select').value = selected(); }
    } else select($('widget-select').value);
  };
  $('widget-new-monitor').onchange = () => $('widget-new-name').value = $('widget-new-monitor').value;
  $('widget-add-cancel').onclick = () => $('widget-add').hidden = true;
  $('widget-create').onclick = () => {
    const monitor = $('widget-new-monitor').value;
    if (!monitors.some(m => m.name === monitor)) return;
    const name = $('widget-new-name').value.trim() || monitor;
    const id = newWidgetId(root().widgets || [], name);
    mutate(value => (value.widgets ??= []).push({id, name,
      placement:{...structuredClone(value.placement), monitor, disconnected:'hide'}, overrides:{}}));
    $('widget-add').hidden = true;
    select(id);
  };
  $('widget-name').onchange = () => mutate(value => {
    value.widgets.find(w => w.id === selected()).name = $('widget-name').value.trim() || 'Widget';
  });
  $('widget-remove').onclick = () => $('widget-remove-confirm').hidden = false;
  $('widget-remove-cancel').onclick = () => $('widget-remove-confirm').hidden = true;
  $('widget-remove-yes').onclick = () => {
    const id = selected();
    if (id === 'main') return;
    select('main');
    mutate(value => { value.widgets = value.widgets.filter(w => w.id !== id); });
  };
  const keys = {
    general:['showExtraWindows', 'quoteEnabled', 'quoteMode', 'quotePosition', 'quoteNavigation'],
    providers:['widgetProviders', 'featuredProvider', 'featuredPosition'],
    history:[...overrideKeys].filter(k => k.startsWith('history'))
  };
  keys.appearance = [...overrideKeys].filter(k => !Object.values(keys).flat().includes(k));
  const resets = {};
  for (const [id, section] of Object.entries(sections)) {
    const button = document.createElement('button');
    button.className = 'widget-reset';
    button.textContent = 'Reset to Main';
    button.onclick = () => mutate(value => {
      const widget = value.widgets.find(w => w.id === selected());
      for (const key of keys[id] || []) delete widget.overrides[key];
      if (id === 'appearance') delete widget.overrides.linux;
    });
    section.querySelector('h1').after(button);
    resets[id] = button;
  }
  return {
    render(available) {
      monitors = available;
      const id = selected(), widget = root().widgets?.find(w => w.id === id);
      const disconnected = w => !monitors.some(m => m.name === w.placement.monitor);
      $('widget-select').replaceChildren(new Option('Main', 'main'), ...(root().widgets || []).map(w => {
        const option = new Option(`${w.name} · ${w.placement.monitor}${disconnected(w) ? ' (not connected)' : ''}`, w.id);
        option.classList.toggle('widget-disconnected', disconnected(w));
        return option;
      }), new Option('Add widget…', '+'));
      $('widget-select').value = id;
      $('widget-select').classList.toggle('widget-disconnected', !!widget && disconnected(widget));
      $('widget-monitor-status').hidden = !widget || !disconnected(widget);
      $('widget-monitor-status').textContent = 'Monitor not connected; hidden until it returns';
      $('widget-details').hidden = !widget;
      $('widget-name').value = widget?.name || '';
      if ($('widget-details').dataset.id !== id) $('widget-remove-confirm').hidden = true;
      $('widget-details').dataset.id = id;
      for (const [category, button] of Object.entries(resets)) {
        button.hidden = !widget || !Object.keys(widget.overrides).some(k =>
          (keys[category] || []).includes(k) || category === 'appearance' && k === 'linux');
      }
      for (const row of document.querySelectorAll('#settings label.setting-row, #settings .provider-choice, #settings .provider-order-row, #palette-tools label')) {
        const input = row.querySelector('input,select');
        const path = bindings[input?.id] || ({'featured-provider':'featuredProvider', 'featured-position':'featuredPosition', 'reactor-motion':'reactorMotion'})[input?.id];
        const shared = path ? !canOverride(path) : !input?.dataset.widgetProvider;
        let note = row.querySelector('.widget-shared-note');
        if (widget && shared && !note) {
          note = document.createElement('small');
          note.className = 'widget-shared-note';
          note.textContent = 'Shared by all widgets';
          (row.querySelector('.setting-copy') || row).append(note);
        }
        if (note) note.hidden = !widget || !shared;
      }
      for (const id of ['placement-monitor', 'disconnected', 'fallback-monitor', 'linux-monitor']) {
        const input = document.getElementById(id);
        if (id === 'placement-monitor') input.querySelector('option[value=""]')?.toggleAttribute('disabled', !!widget);
        else if (id !== 'linux-monitor') input.disabled = !!widget;
      }
    }
  };
}
