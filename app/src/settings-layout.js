export function layoutControls(root, getDraft, getProviders, update) {
  const field = document.createElement('fieldset');
  field.innerHTML = `<legend>Provider layout</legend><p class="setting-note">Drag to reorder, or use Up / Down. Visibility applies to every shape.</p><div id="provider-order"></div><label>Featured provider<select id="featured-provider"></select></label><label>Featured position<select id="featured-position"><option value="top">Top</option><option value="bottom">Bottom</option></select></label><label class="toggle-setting">Reactor breathing glow<input id="reactor-motion" type="checkbox"></label>`;
  root.append(field);
  let dragging = null;
  const change = (key, value) => { getDraft()[key] = value; update(); };
  const select = field.querySelector('#featured-provider');
  select.onchange = () => change('featuredProvider', select.value);
  field.querySelector('#featured-position').onchange = e => change('featuredPosition', e.target.value);
  field.querySelector('#reactor-motion').onchange = e => change('reactorMotion', e.target.checked);
  function reorder(source, target) {
    const ids = currentOrder();
    ids.splice(ids.indexOf(source), 1); ids.splice(target, 0, source);
    change('providerOrder', ids);
  }
  function currentOrder() {
    return [...new Set([...(getDraft().providerOrder || []), ...getProviders()])].filter(id => getProviders().includes(id));
  }
  function row(id, index, ids) {
    const el = document.createElement('div'); el.className = 'provider-order-row'; el.draggable = true; el.dataset.layoutProvider = id;
    const name = document.createElement('span'); name.textContent = id; el.append(name);
    const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = !(getDraft().hiddenProviders || []).includes(id); visible.setAttribute('aria-label', `Show ${id}`);
    visible.onchange = () => change('hiddenProviders', visible.checked ? (getDraft().hiddenProviders || []).filter(key => key !== id) : [...(getDraft().hiddenProviders || []), id]);
    el.append(visible);
    for (const [label, delta] of [['Up', -1], ['Down', 1]]) {
      const button = document.createElement('button'); button.textContent = label; button.disabled = index + delta < 0 || index + delta >= ids.length;
      button.setAttribute('aria-label', `${label} ${id}`); button.onclick = () => { reorder(id, index + delta); field.querySelector(`[data-layout-provider="${id}"] button:not(:disabled)`)?.focus(); }; el.append(button);
    }
    el.ondragstart = e => { dragging = id; e.dataTransfer.setData('text/plain', id); };
    el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); if (ids.includes(dragging)) reorder(dragging, index); dragging = null; };
    el.ondragend = () => { dragging = null; };
    return el;
  }
  return () => {
    const draft = getDraft(), ids = currentOrder();
    field.querySelector('#provider-order').replaceChildren(...ids.map((id, i) => row(id, i, ids)));
    select.replaceChildren(...[['auto', 'Auto (highest usage)'], ['none', 'None'], ...ids.map(id => [id, id])].map(([value, label]) => new Option(label, value)));
    select.value = draft.featuredProvider || 'auto';
    field.querySelector('#featured-position').value = draft.featuredPosition || 'bottom';
    field.querySelector('#reactor-motion').checked = draft.reactorMotion === true;
  };
}
