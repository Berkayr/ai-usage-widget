const icon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
export const settingsCategories = [
  ['general', 'General', icon('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>')],
  ['appearance', 'Appearance', icon('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 7h6M12 12h9M12 17h6"/>')],
  ['providers', 'Providers', icon('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>')],
  ['history', 'History', icon('<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2"/>')],
  ['taskbar', 'Taskbar', icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18M7 18h2M12 18h2"/>')],
  ['about', 'About', icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>')]
];

export function mountNavigation(sections) {
  const nav = document.querySelector('.settings-shell > nav');
  const tabs = [...nav.querySelectorAll('[data-category]')];
  const narrow = matchMedia('(max-width: 559px)');
  let selected;
  const available = () => tabs.filter(tab => !tab.hidden);
  function select(id) {
    const active = available().find(tab => tab.dataset.category === id) || available()[0];
    selected = active.dataset.category;
    for (const tab of tabs) {
      const current = tab === active;
      tab.setAttribute('aria-selected', String(current));
      tab.tabIndex = current ? 0 : -1;
      sections[tab.dataset.category].hidden = !current;
    }
    document.querySelector('.settings-content').scrollTop = 0;
    active.scrollIntoView({block:'nearest', inline:'nearest'});
    try { localStorage.setItem('settings-category', selected); }
    catch { /* Navigation still works when local storage is unavailable. */ }
  }
  for (const tab of tabs) tab.onclick = () => select(tab.dataset.category);
  nav.onkeydown = event => {
    const visible = available(), index = visible.indexOf(document.activeElement);
    if (index < 0) return;
    const delta = {ArrowDown:1, ArrowUp:-1, ...(narrow.matches ? {ArrowRight:1, ArrowLeft:-1} : {})}[event.key];
    if (delta === undefined && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? visible[0] : event.key === 'End' ? visible.at(-1)
        : visible[(index + delta + visible.length) % visible.length];
    select(next.dataset.category);
    next.focus();
    next.scrollIntoView({block:'nearest', inline:'nearest'});
  };
  const orientation = () => nav.setAttribute('aria-orientation', narrow.matches ? 'horizontal' : 'vertical');
  narrow.addEventListener('change', orientation);
  orientation();
  let remembered;
  try { remembered = localStorage.getItem('settings-category'); }
  catch { /* Use General when storage is unavailable. */ }
  select(remembered);
  return {
    platform(value) {
      nav.querySelector('[data-category=taskbar]').hidden = value !== 'windows';
      select(selected);
    }
  };
}

const descriptions = {
  'start-at-login':'Open the widget when you sign in.',
  'show-extra-windows':'Include additional quota windows in the widget.',
  'quote-enabled':'Fetch a daily quote when enabled; see the privacy note above.',
  'quote-position':'Place the quote above or below usage.',
  'quote-mode':'Choose the source of each daily quote.',
  'quote-navigation':'Show buttons to browse quotes.',
  appearance:'Follow the system or choose light or dark.',
  'color-mode':'Choose calm, vivid or monochrome indicators.',
  accent:'Override the palette accent color.', background:'Override the widget background.',
  'widget-opacity':'Adjust transparency of the whole widget.',
  'background-opacity':'Adjust the background without fading text.',
  'accent-edge':'Choose where the accent edge appears.',
  'dot-count':'Number of marks in each quota track.',
  'reactor-motion':'Animate the round Reactor widget.',
  scale:'Fine-tune the selected fixed size.',
  'fit-height':'End the portrait widget after its content.',
  'match-physical-size':'Keep a similar physical size on different displays.',
  'fit-fraction':'Maximum share of the available screen height.',
  'fit-fine-tune':'Fine-tune the screen share independently of fixed size.',
  'lock-position':'Prevent moving the widget by dragging its header.',
  'placement-monitor':'Choose the display for the widget.',
  snap:'Align map placement to edges, center or the grid.',
  disconnected:'Choose what happens when a display is unavailable.',
  'fallback-monitor':'Display to use when the selected monitor disconnects.',
  'reserved-top':'Leave extra space above the widget.',
  'reserved-bottom':'Leave extra space below the widget.',
  'linux-layer':'Show above windows or on the desktop.',
  'linux-margin':'Space between the widget and the screen edge.',
  'linux-monitor':'Choose the layer-shell display.',
  'featured-provider':'Choose the provider to emphasize.',
  'featured-position':'Place the featured provider at the top or bottom.',
  'taskbar-enabled':'Show quota usage in the Windows taskbar.',
  'taskbar-style':'Choose a transparent strip or a chip.',
  'taskbar-theme':'Follow the system or choose light or dark.',
  'taskbar-window':'Choose which quota windows to display.',
  'taskbar-bars':'Show small bars alongside taskbar values.'
};

export function decorateRows(root) {
  for (const label of root.querySelectorAll('label:not(.provider-choice):not(.palette-token)')) {
    if (label.querySelector('.setting-copy') || label.closest('#palette-tools')) continue;
    const text = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    const title = text.map(node => node.textContent.trim()).join(' ').trim();
    if (!title) continue;
    const input = label.querySelector('input,select');
    const copy = document.createElement('span'), name = document.createElement('strong'), hint = document.createElement('small');
    copy.className = 'setting-copy';
    name.textContent = title;
    hint.textContent = descriptions[input?.id] || (input?.dataset.widgetProvider
        ? 'Include this provider in round and pill shapes.' : input?.dataset.providerColor
        ? 'Identify this provider across widget shapes.' : 'Include this provider in the taskbar strip.');
    copy.append(name, hint);
    for (const node of text) node.remove();
    label.prepend(copy);
    label.classList.add('setting-row');
    if (input?.type === 'checkbox') input.setAttribute('role', 'switch');
  }
}

// Keep native fieldset semantics while placing the heading above its card.
export function decorateGroups(root) {
  for (const field of root.querySelectorAll('fieldset')) {
    if (field.querySelector(':scope > .settings-card')) continue;
    field.classList.add('settings-group');
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.append(...[...field.children].filter(child => child.tagName !== 'LEGEND'));
    field.append(card);
  }
}
