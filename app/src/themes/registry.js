import shapes from './shared/shapes.css?inline';
import readability from './shared/readability.css?inline';
// Vite emits separate renderer chunks. CSS is imported as text so the old
// stylesheet can actually be removed, including when revisiting a cached theme.
const renderers = import.meta.glob('./*/render.js');
const styles = import.meta.glob('./*/theme.css', { query: '?inline', import: 'default' });
const manifests = import.meta.glob('./*/theme.json', { import: 'default' });
export const themes = Object.keys(manifests).map(path => ({id:path.split('/')[1]}));
export async function allThemes() {
  return (await Promise.all(Object.values(manifests).map(load => load()))).sort((a,b) => Number(b.id === 'system') - Number(a.id === 'system'));
}
export async function loadTheme(id) {
  if (!themes.some(theme => theme.id === id)) id = 'system';
  const [renderer, css, manifest] = await Promise.all([renderers[`./${id}/render.js`](), styles[`./${id}/theme.css`](), manifests[`./${id}/theme.json`]()]);
  // Keep authored pixel dimensions in 16px design units. rem makes scale a
  // fresh layout/font rasterization, without zoom or a transformed surface.
  return { ...renderer, css: (css + '\n' + readability + '\n' + shapes).replace(/(-?(?:\d*\.)?\d+)px\b/g, (_, value) => `${Number(value) / 16}rem`), manifest };
}
