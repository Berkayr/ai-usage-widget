import { pctOf } from './themes/dot-matrix/render.js';

export function orderedProviders(providers, settings) {
  const order = settings.providerOrder || [];
  const hidden = settings.hiddenProviders || [];
  const rank = p => {
    const direct = order.indexOf(p.id);
    if (direct >= 0) return direct;
    const base = p.baseId ? order.indexOf(p.baseId) : -1;
    return base < 0 ? order.length : base;
  };
  return providers.filter(p => !(hidden.includes(p.id) || (p.baseId && hidden.includes(p.baseId))))
    .sort((a, b) => rank(a) - rank(b));
}
export function featuredProvider(providers, settings, legacyLast = false) {
  const choice = settings.featuredProvider;
  if (choice === 'none') return null;
  if (choice === 'first') return providers[0] || null;
  if (!choice && legacyLast) return providers.at(-1);
  if (choice && choice !== 'auto') return providers.find(p => p.id === choice) || providers.find(p => p.baseId === choice) || null;
  const usage = p => Math.max(-1, ...(p.windows || []).map(w => pctOf(w) ?? -1));
  return providers.reduce((best, p) => !best || usage(p) > usage(best) ? p : best, null);
}
export function arrangeCards(root, providers, settings) {
  const cards = [...root.querySelectorAll('.provider-card')];
  const grid = settings.shape === 'portrait';
  const hero = grid && cards.length % 2 ? featuredProvider(providers, settings, true) : null;
  document.documentElement.dataset.featuredLayout = hero ? settings.featuredPosition || 'bottom' : 'none';
  cards.forEach((card, i) => {
    card.classList.toggle('featured-provider', hero != null && providers[i] === hero);
    card.dataset.provider = providers[i]?.id || '';
  });
  const featured = settings.shape === 'square' ? cards[providers.indexOf(featuredProvider(providers, settings))] : root.querySelector('.featured-provider');
  if (featured) settings.featuredPosition === 'top' ? root.prepend(featured) : root.append(featured);
}
