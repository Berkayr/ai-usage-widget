const overflows = card => card.scrollHeight > card.clientHeight || card.scrollWidth > card.clientWidth;

// Observe content and font changes; Portrait also grows within existing type tiers.
export function observeUsageFit(root) {
  let frame = 0;
  const fit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fitUsage(root));
  };
  const observer = new ResizeObserver(fit);
  observer.observe(root);
  document.fonts.ready.then(fit);
  document.fonts.addEventListener('loadingdone', fit);
  return {refresh:() => fitUsage(root), disconnect() {cancelAnimationFrame(frame);observer.disconnect();document.fonts.removeEventListener('loadingdone', fit);}};
}

export function fitUsage(root) {
  if (!root.clientHeight) return;
  const cards = [...root.querySelectorAll('.provider-card')];
  for (const el of root.closest('.widget').querySelectorAll('[data-usage-font]')) {
    el.style.fontSize = el.dataset.usageFont;
    delete el.dataset.usageFont;
  }
  // Recompute from authored styles after viewport, theme, quote or font changes.
  root.style.removeProperty('grid-template-rows');
  root.style.setProperty('--portrait-growth', 0);
  root.style.removeProperty('flex-shrink');
  root.style.removeProperty('padding-bottom');
  for (const card of cards) {
    delete card.dataset.usageCompact;
    card.style.removeProperty('padding-bottom');
    if (document.documentElement.dataset.shape === 'portrait') {
      card.style.removeProperty('min-height');
      card.style.removeProperty('max-height');
    }
    if (document.documentElement.dataset.shape === 'portrait') for (const ring of card.querySelectorAll('.ring-display')) ring.style.removeProperty('height');
  }
  // The scale changes geometry, but readable text has a physical 11px floor.
  for (const el of root.closest('.widget').querySelectorAll('*')) {
    if (document.documentElement.dataset.readableSize === 'true' && [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) > 0 && parseFloat(getComputedStyle(el).fontSize) < 11) {
      if (!el.hasAttribute('data-usage-font')) el.dataset.usageFont = el.style.fontSize;
      el.style.fontSize = '11px';
    }
  }
  if (document.documentElement.dataset.shape === 'portrait' && document.documentElement.classList.contains('fit-height') && cards.length) {
    fitNaturalPortrait(root, cards);
    fitHeader(root.closest('.widget'));
    return;
  }
  cards.forEach(fitPortraitGraphics);
  cards.forEach(compactCard);
  // Spend the existing compact tier before scrolling a long Portrait list.
  if (document.documentElement.dataset.shape === 'portrait' && overflows(root.closest('.widget'))) {
    cards.forEach(card => { card.dataset.usageCompact = 'true'; });
    cards.forEach(compactCard);
  }
  cards.forEach(fitPortraitGraphics);
  // Once text reaches its floor, preserve the card and scroll the list.
  if (document.documentElement.dataset.shape === 'portrait') {
    cards.filter(overflows).forEach(card => { card.style.maxHeight = 'none'; });
  }
  if (document.documentElement.dataset.shape === 'portrait' && overflows(root.closest('.widget'))) root.style.flexShrink = '1';
  growPortraitContent(root, cards);
  // Graphic label reservations can exceed fractional tracks; share that minimum.
  if (document.documentElement.dataset.shape === 'portrait' && cards.length) {
    const height = Math.max(...cards.map(card => card.getBoundingClientRect().height));
    cards.forEach(card => { card.style.minHeight = `${height}px`; });
  }
  // Fractional rem budgets can round scrollHeight up while clientHeight rounds down.
  // Remove that rounding debt from trailing space, preserving every card's height.
  const debt = root.scrollHeight - root.clientHeight;
  const padding = parseFloat(getComputedStyle(root).paddingBottom);
  if (debt > 0 && debt <= padding) root.style.paddingBottom = `${padding - debt}px`;
  fitHeader(root.closest('.widget'));
}

// Measure unconstrained tracks before applying the window's available height.
function fitNaturalPortrait(root, cards) {
  const widget = root.closest('.widget');
  const saved = [widget, root].map(el => el.getAttribute('style'));
  widget.style.height = 'auto';
  widget.style.maxHeight = 'none';
  root.style.flex = 'none';
  root.style.height = 'auto';
  root.style.gridTemplateRows = 'none';
  root.style.gridAutoRows = 'max-content';
  const height = Math.ceil(Math.max(...cards.map(card => {
    const style = getComputedStyle(card);
    return Math.max(card.getBoundingClientRect().height, card.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth));
  })));
  // Expanded history belongs only to its own card.
  if (!root.querySelector('.usage-history')) root.style.gridAutoRows = `${height}px`;
  const naturalHeight = Math.ceil(widget.getBoundingClientRect().height);
  [widget, root].forEach((el, i) => saved[i] == null ? el.removeAttribute('style') : el.setAttribute('style', saved[i]));
  widget.style.setProperty('--usage-fit-height', `${naturalHeight}px`);
  widget.dataset.usageHeight = naturalHeight;
}

// Native resizing must use the desired content height, even in a short viewport.
export function fittedUsageHeight(widget, limit = Infinity) {
  return Math.min(Number(widget.dataset.usageHeight) || widget.getBoundingClientRect().height, limit);
}

function growPortraitContent(root, cards) {
  if (document.documentElement.dataset.portraitFit !== 'true' || !cards.length || root.querySelector('.ring-display')) return;
  const widget = root.closest('.widget');
  const fits = () => !overflows(root) && !overflows(widget) && cards.every(card => !overflows(card));
  root.style.setProperty('--portrait-growth', 1);
  if (fits()) return;
  let low=0, high=1;
  for (let i=0; i<8; i++) {
    const middle=(low+high)/2;
    root.style.setProperty('--portrait-growth', middle);
    if (fits()) low=middle; else high=middle;
  }
  root.style.setProperty('--portrait-growth', low);
}

// A constrained grid can overlap its intrinsic graphic without overflowing.
// Reserve the text rows before sizing graphics, keeping the labels intact.
function fitPortraitGraphics(card) {
  if (document.documentElement.dataset.shape !== 'portrait') return;
  const ring = card.querySelector('.ring-display');
  if (!ring) return;
  const style = getComputedStyle(card);
  const paired = style.gridTemplateColumns.split(' ').length > 1;
  const outerHeight = el => {const s=getComputedStyle(el);return el.getBoundingClientRect().height + parseFloat(s.marginTop) + parseFloat(s.marginBottom);};
  const reserved = [...card.children].filter(el => el !== ring && (!paired || !el.classList.contains('windows'))).reduce((sum, el) => sum + outerHeight(el), 0);
  const labels = [...ring.querySelector('.ring-center').children].reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  card.style.minHeight = `${reserved + labels + padding + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
  const available = card.clientHeight - padding - reserved;
  ring.style.height = `${Math.max(labels, Math.min(ring.getBoundingClientRect().height, available))}px`;
}

function compactCard(card) {
  if (!overflows(card)) return;
  card.dataset.usageCompact = 'true';
  settleCardRounding(card);
  if (!overflows(card)) return;
  const texts = [...card.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) > 0);
  const sizes = texts.map(el => parseFloat(getComputedStyle(el).fontSize));
  for (const el of texts) el.dataset.usageFont = el.style.fontSize;
  // Existing small labels keep their authored size; newly reduced text stops at 11px.
  for (let reduction = .5; reduction <= Math.max(...sizes); reduction += .5) {
    texts.forEach((el, i) => {el.style.fontSize = `${Math.max(Math.min(11, sizes[i]), sizes[i] - reduction)}px`;});
    settleCardRounding(card);
    if (!overflows(card)) break;
  }
}

// The title is frame chrome, so it must fit even at fractional screen sizes.
function fitHeader(widget) {
  const title=widget?.querySelector('.app-title');
  if (!title || !title.getClientRects().length) return;
  title.style.removeProperty('font-size');
  const range=document.createRange();range.selectNodeContents(title);
  const width=range.getBoundingClientRect().width;
  const available=title.parentElement.clientWidth;
  if (width>available && width>0) title.style.fontSize=`${parseFloat(getComputedStyle(title).fontSize)*available/width}px`;
}

function settleCardRounding(card) {
  const debt=card.scrollHeight-card.clientHeight;
  const padding=parseFloat(getComputedStyle(card).paddingBottom);
  if (debt>0 && debt<=1 && debt<=padding) card.style.paddingBottom=`${padding-debt}px`;
}
