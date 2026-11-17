const boxOverflows = el => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
// A constrained grid can overlap its own heading without overflowing the card.
const truncatedPlan = el => [...el.querySelectorAll('.plan')].some(plan => plan.scrollWidth > plan.clientWidth);
const overflows = el => boxOverflows(el) || (el.classList.contains('provider-card') && (truncatedPlan(el) || [...el.querySelectorAll('.windows,.quota-window')].some(boxOverflows)));

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
  const {shape, quote, quotePage} = document.documentElement.dataset;
  const sharedQuote = quote === 'true' && (shape === 'landscape' || (shape === 'square' && quotePage === 'true'));
  root.style.minHeight = sharedQuote ? `${root.closest('.widget').getBoundingClientRect().height * .55}px` : '';
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
    delete card.dataset.usageStacked;
    delete card.dataset.usageMetadata;
    delete card.dataset.usageBadge;
    delete card.dataset.usageInlineReset;
    card.style.removeProperty('padding-bottom');
    for (const plan of card.querySelectorAll('.plan')) plan.style.removeProperty('visibility');
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
  cards.forEach(fitPortraitGraphics);
  cards.forEach(stackNarrowWindows);
  cards.forEach(compactCard);
  cards.forEach(stackNarrowWindows);
  cards.forEach(compactCard);
  cards.forEach(fitInlineResets);
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
  if (document.documentElement.dataset.shape === 'portrait' && cards.length && !root.closest('.has-inline-history')) {
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

// Native resizing uses the shared geometry even in a short viewport.
export function fittedUsageHeight(widget, limit = Infinity) {
  return Math.min(parseFloat(getComputedStyle(widget).getPropertyValue('--widget-height')) || widget.getBoundingClientRect().height, limit);
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
  // Keep the shared track height; compactCard handles labels that exceed it.
  card.style.minHeight = '0';
  const available = card.clientHeight - padding - reserved;
  ring.style.height = `${Math.max(labels, Math.min(ring.getBoundingClientRect().height, available))}px`;
}

// Intrinsic text widths catch collisions and ellipsis that scrollWidth misses.
function stackNarrowWindows(card) {
  const heading = card.querySelector('.provider-heading>div');
  if (heading && heading.scrollWidth > heading.clientWidth) card.dataset.usageMetadata = 'hidden';
  const badge = card.querySelector('.status-badge');
  const name = heading?.querySelector('.provider-name');
  const nameRange = document.createRange();
  if (name) nameRange.selectNodeContents(name);
  if (heading && badge && (heading.scrollWidth > heading.clientWidth || (name && nameRange.getBoundingClientRect().right > heading.getBoundingClientRect().right - 2))) {
    badge.title = badge.textContent;
    card.dataset.usageBadge = 'compact';
  }
  if (!['landscape', 'strip'].includes(document.documentElement.dataset.shape)) return;
  const tooNarrow = [...card.querySelectorAll('.window-top')].some(row => {
    if (!row.getClientRects().length || getComputedStyle(row).display === 'contents') return false;
    const texts = [...row.children];
    const needed = texts.reduce((sum, el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return sum + range.getBoundingClientRect().width + parseFloat(getComputedStyle(el).fontSize) * .16;
    }, Math.max(8, parseFloat(getComputedStyle(row).columnGap) || 0) + 8);
    return needed > row.getBoundingClientRect().width;
  });
  if (tooNarrow) card.dataset.usageStacked = 'true';
}

// A shallow card can keep timing beside usage when all three labels fit whole.
function fitInlineResets(card) {
  if (!card.dataset.usageStacked || !overflows(card)) return;
  const rows = [...card.querySelectorAll('.quota-window')];
  const fits = rows.every(row => {
    const texts = [...row.querySelectorAll('.window-top>span,.window-top>b,.reset')];
    const needed = texts.reduce((sum, el) => {
      const range = document.createRange();range.selectNodeContents(el);
      return sum + range.getBoundingClientRect().width + parseFloat(getComputedStyle(el).fontSize)*.16;
    }, 16);
    const style = getComputedStyle(card);
    const available = card.querySelector('.ring-display') ? card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) : row.clientWidth;
    return needed <= available;
  });
  if (fits) card.dataset.usageInlineReset = 'true';
}

function compactCard(card) {
  if (!overflows(card)) return;
  if (truncatedPlan(card)) {
    for (const plan of card.querySelectorAll('.plan')) if (plan.scrollWidth > plan.clientWidth) plan.style.visibility = 'hidden';
    if (!boxOverflows(card) && ![...card.querySelectorAll('.windows,.quota-window')].some(boxOverflows)) return;
  }
  card.dataset.usageCompact = 'true';
  settleCardRounding(card);
  if (!overflows(card)) return;
  const texts = [...card.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) > 0);
  const sizes = texts.map(el => parseFloat(getComputedStyle(el).fontSize));
  for (const el of texts) if (!el.hasAttribute('data-usage-font')) el.dataset.usageFont = el.style.fontSize;
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
