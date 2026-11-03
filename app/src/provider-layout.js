import { pctOf } from './themes/dot-matrix/render.js';

export function orderedProviders(providers, settings) {
  const order = settings.providerOrder || [];
  const rank = id => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
  return providers.filter(p => !(settings.hiddenProviders || []).includes(p.id))
    .sort((a, b) => rank(a.id) - rank(b.id));
}
export function featuredProvider(providers, settings, legacyLast = false) {
  const choice = settings.featuredProvider;
  if (choice === 'none') return null;
  if (!choice && legacyLast) return providers.at(-1);
  if (choice && choice !== 'auto') return providers.find(p => p.id === choice) || null;
  const usage = p => Math.max(-1, ...(p.windows || []).map(w => pctOf(w) ?? -1));
  return providers.reduce((best, p) => !best || usage(p) > usage(best) ? p : best, null);
}
export function arrangeCards(root, providers, settings) {
  const cards = [...root.querySelectorAll('.provider-card')];
  const grid = ['portrait', 'square'].includes(settings.shape);
  const hero = grid && cards.length % 2 ? featuredProvider(providers, settings, true) : null;
  document.documentElement.dataset.featuredLayout = hero ? settings.featuredPosition || 'bottom' : 'none';
  cards.forEach((card, i) => {
    card.classList.toggle('featured-provider', hero != null && providers[i] === hero);
    card.dataset.provider = providers[i]?.id || '';
  });
  const featured = root.querySelector('.featured-provider');
  if (featured) settings.featuredPosition === 'top' ? root.prepend(featured) : root.append(featured);
}
