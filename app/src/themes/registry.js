import readability from './shared/readability.css?inline';
// Vite emits separate renderer chunks. CSS is imported as text so the old
// stylesheet can actually be removed, including when revisiting a cached theme.
const renderers = import.meta.glob('./*/render.js');
const styles = import.meta.glob('./*/theme.css', { query: '?inline', import: 'default' });
const manifests = import.meta.glob('./*/theme.json', { eager: true, import: 'default' });
export const themes = Object.values(manifests);
export async function loadTheme(id) {
  if (!themes.some(theme => theme.id === id)) id = 'dot-matrix';
  const [renderer, css] = await Promise.all([renderers[`./${id}/render.js`](), styles[`./${id}/theme.css`]()]);
  // Keep authored pixel dimensions in 16px design units. rem makes scale a
  // fresh layout/font rasterization, without zoom or a transformed surface.
  return { ...renderer, css: (css + '\n' + readability).replace(/(-?(?:\d*\.)?\d+)px\b/g, (_, value) => `${Number(value) / 16}rem`), manifest: themes.find(theme => theme.id === id) };
}
