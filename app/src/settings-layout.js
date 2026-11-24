import {providerLogo} from './icons/provider-logos.js';
import {applyLimits} from './limits.js';
import {orderedProviders, featuredProvider} from './provider-layout.js';
import {widgetProviders} from './sizing.js';
import {hiddenStates, providerNames} from './themes/dot-matrix/render.js';

export function layoutControls(root, getDraft, getProviders, update, getSnapshot = () => []) {
  const field = document.createElement('fieldset');
  field.innerHTML =
      `<legend>Provider layout</legend>
<p class="setting-note">Drag to reorder, or use the arrow buttons. Visibility applies to every shape.</p>
<div id="provider-order">
</div>
<label>Featured provider<select id="featured-provider">
</select>
</label>
<p id="featured-hint" class="setting-note" role="status"></p>
<label>Featured position<select id="featured-position">
<option value="top">Top</option>
<option value="bottom">Bottom</option>
</select>
</label>
<label class="toggle-setting">Reactor breathing glow<input id="reactor-motion" type="checkbox">
</label>`;
  root.append(field);
  let dragging = null;
  const change = (key, value) => {
    getDraft()[key] = value;
    update();
  };
  const select = field.querySelector('#featured-provider');
  select.onchange = () => change('featuredProvider', select.value === 'legacy' ? null : select.value);
  field.querySelector('#featured-position').onchange = e =>
      change('featuredPosition', e.target.value);
  field.querySelector('#reactor-motion').onchange = e =>
      change('reactorMotion', e.target.checked);
  function reorder(source, target) {
    const ids = currentOrder();
    ids.splice(ids.indexOf(source), 1);
    ids.splice(target, 0, source);
    change('providerOrder', ids);
  }
  function currentOrder() {
    return [
      ...new Set([...(getDraft().providerOrder || []), ...getProviders() ])
    ].filter(id => getProviders().includes(id));
  }
  function row(id, index, ids) {
    const el = document.createElement('div');
    el.className = 'provider-order-row';
    el.draggable = true;
    el.dataset.layoutProvider = id;
    const name = document.createElement('span');
    name.className = 'setting-copy';
    const title = document.createElement('strong'), hint = document.createElement('small');
    title.textContent = providerNames[id] || id;
    hint.textContent = 'Show in the widget; drag or use arrows to reorder.';
    name.append(title, hint);
    const logo = providerLogo(id) || '';
    el.insertAdjacentHTML('beforeend', logo.replace(/id="([^"]+)"/g, 'id="order-$1"').replace(/url\(#([^)]+)\)/g, 'url(#order-$1)'));
    el.append(name);
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.setAttribute('role', 'switch');
    visible.checked = !(getDraft().hiddenProviders || []).includes(id);
    visible.setAttribute('aria-label', `Show ${id}`);
    visible.onchange = () =>
        change('hiddenProviders',
               visible.checked ? (getDraft().hiddenProviders ||
                                  []).filter(key => key !== id)
                               : [...(getDraft().hiddenProviders || []), id ]);
    el.append(visible);
    for (const [label, delta] of [[ 'Up', -1 ], [ 'Down', 1 ]]) {
      const button = document.createElement('button');
      button.textContent = delta < 0 ? '↑' : '↓';
      button.disabled = index + delta < 0 || index + delta >= ids.length;
      button.setAttribute('aria-label', `${label} ${id}`);
      button.onclick = () => {
        reorder(id, index + delta);
        field
            .querySelector(
                `[data-layout-provider="${id}"] button:not(:disabled)`)
            ?.focus();
      };
      el.append(button);
    }
    el.ondragstart = e => {
      dragging = id;
      e.dataTransfer.setData('text/plain', id);
    };
    el.ondragover = e => e.preventDefault();
    el.ondrop = e => {
      e.preventDefault();
      if (ids.includes(dragging))
        reorder(dragging, index);
      dragging = null;
    };
    el.ondragend = () => { dragging = null; };
    return el;
  }
  return () => {
    const draft = getDraft(), ids = currentOrder();
    const active = getSnapshot().filter(p => ids.includes(p.id) && !hiddenStates.has(String(p.state).toUpperCase()));
    const visible = orderedProviders(applyLimits(active, draft), draft);
    const derivedChoices = draft.separatePools
        ? visible.filter(p => p.baseId).map(p => [p.id, `${providerNames[p.baseId] || p.baseId} · ${p.label || p.id}`])
        : [];
    const knownChoices = [...ids, ...derivedChoices.map(([id]) => id)];
    field.querySelector('#provider-order')
        .replaceChildren(...ids.map((id, i) => row(id, i, ids)));
    select.replaceChildren(
        ...[[ 'first', 'First in list' ], [ 'auto', 'Highest usage' ], [ 'none', 'None' ],
            ...(!draft.featuredProvider ? [['legacy', 'Legacy layout']] : []),
            ...(draft.featuredProvider && !['first', 'auto', 'none', ...knownChoices].includes(draft.featuredProvider)
                ? [[draft.featuredProvider, 'Unavailable selection']] : []),
            ...ids.map(id => [id, providerNames[id] || id]),
            ...derivedChoices]
            .map(([ value, label ]) => new Option(label, value)));
    select.value = draft.featuredProvider || 'legacy';
    select.disabled = ['landscape', 'pill'].includes(draft.shape);
    select.setAttribute('aria-describedby', 'featured-hint');
    const round = ['circle', 'pill'].includes(draft.shape);
    const shown = round ? widgetProviders(visible, draft.widgetProviders) :
        draft.shape === 'square' ? visible.slice(0, 4) : visible;
    const hero = featuredProvider(shown, draft, draft.shape === 'portrait');
    const name = hero ? providerNames[hero.id] || hero.label || hero.id : 'No provider';
    let hint = draft.featuredProvider === 'auto'
        ? `${name} selected by highest usage across quota windows. Up / Down changes order, not the featured provider.`
        : draft.featuredProvider === 'first'
        ? `${name} is first in the visible list. Up / Down changes the featured provider.`
        : draft.featuredProvider && draft.featuredProvider !== 'none'
        ? `${name} selected explicitly. Up / Down changes order, not the featured provider.`
        : draft.featuredProvider === 'none'
        ? 'No featured provider selected. Up / Down changes list order.'
        : `${name} selected by legacy layout (last Portrait cell, highest-usage Circle center).`;
    if (draft.shape === 'portrait' && shown.length % 2 === 0)
      hint += ' With an even provider count, all cards are equal; Top / Bottom has no effect.';
    else if (draft.shape === 'square')
      hint += ' Square uses equal rows; Top / Bottom changes order only, on each page.';
    else if (draft.shape === 'circle')
      hint += ' Circle uses the selection for its center; Top / Bottom has no effect.';
    else if (['landscape', 'pill'].includes(draft.shape))
      hint += ' This shape uses list order; featured selection and Top / Bottom have no effect.';
    field.querySelector('#featured-hint').textContent = hint;
    const position = field.querySelector('#featured-position');
    position.disabled = draft.shape !== 'portrait' || shown.length % 2 === 0;
    position.setAttribute('aria-describedby', 'featured-hint');
    field.querySelector('#featured-position').value =
        draft.featuredPosition || 'bottom';
    document.querySelector('#reactor-motion').checked =
        draft.reactorMotion === true;
  };
}
