// Vite emits separate renderer chunks. CSS is imported as text so the old
// stylesheet can actually be removed, including when revisiting a cached theme.
const renderers = import.meta.glob('./*/render.js');
const styles = import.meta.glob('./*/theme.css', { query: '?inline', import: 'default' });
const manifests = import.meta.glob('./*/theme.json', { eager: true, import: 'default' });
export const themes = Object.values(manifests);
export async function loadTheme(id) {
  if (!themes.some(theme => theme.id === id)) id = 'dot-matrix';
  const [renderer, css] = await Promise.all([renderers[`./${id}/render.js`](), styles[`./${id}/theme.css`]()]);
  return { ...renderer, css, manifest: themes.find(theme => theme.id === id) };
}
