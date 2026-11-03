const overflows = card => card.scrollHeight > card.clientHeight || card.scrollWidth > card.clientWidth;

// Refit only overflowing cards. Layout budgets and cards that already fit stay intact.
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
  // Recompute from authored styles after viewport, theme, quote or font changes.
  root.style.removeProperty('grid-template-rows');
  root.style.removeProperty('padding-bottom');
  for (const card of cards) {
    delete card.dataset.usageCompact;
    card.style.removeProperty('padding-bottom');
    for (const el of card.querySelectorAll('[data-usage-font]')) {
      el.style.fontSize = el.dataset.usageFont;
      delete el.dataset.usageFont;
    }
  }
  donateFeaturedSpace(root, cards);
  // Fractional rem budgets can round scrollHeight up while clientHeight rounds down.
  // Remove that rounding debt from trailing space, preserving every card's height.
  const debt = root.scrollHeight - root.clientHeight;
  const padding = parseFloat(getComputedStyle(root).paddingBottom);
  if (debt > 0 && debt <= padding) root.style.paddingBottom = `${padding - debt}px`;
  cards.forEach(compactCard);
  fitHeader(root.closest('.widget'));
}

function donateFeaturedSpace(root, cards) {
  // An odd portrait grid donates only the featured row's unused vertical space.
  const hero = cards.find(card => card.classList.contains('featured-provider'));
  if (hero && cards.length === 3 && document.documentElement.dataset.shape === 'portrait' && getComputedStyle(root).display === 'grid' && getComputedStyle(root).gridTemplateColumns.split(' ').length === 2) {
    const paired = cards.filter(card => card !== hero);
    const shortage = Math.max(0, ...paired.map(card => card.scrollHeight - card.clientHeight));
    if (shortage) {
      const height = hero.getBoundingClientRect().height;
      const first = Math.max(0, height - shortage);
      const second = height + shortage;
      root.style.gridTemplateRows = document.documentElement.dataset.featuredLayout === 'top'
        ? `${first}px ${second}px` : `${second}px ${first}px`;
    }
  }
}

function compactCard(card) {
  if (!overflows(card)) return;
  card.dataset.usageCompact = 'true';
  settleCardRounding(card);
  if (!overflows(card)) return;
  const texts = [...card.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
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
