// Reject active SVG content before it reaches an HTML insertion point.
export function validateProviderSvg(svg) {
  if (!/^\s*<svg\b/i.test(svg) || /<\s*(?:script|foreignObject|iframe|object|embed|style|animate\w*|set)\b|<!|\bon[\w:-]*\s*=|href|url\(\s*(?!#)/i.test(svg)) {
    throw new Error('Unsafe provider SVG');
  }
  return svg;
}
const sources = import.meta.env ? import.meta.glob('./providers/*.svg', { query: '?raw', import: 'default', eager: true }) : {};
const logos = Object.fromEntries(Object.entries(sources).map(([path, svg]) => [path.split('/').at(-1).replace('.svg', ''), validateProviderSvg(svg)]));
export function providerLogo(id) {
  const svg = Object.hasOwn(logos, id) ? logos[id] : '';
  return svg ? `<span class="provider-logo" aria-hidden="true">${svg}</span>` : '';
}
