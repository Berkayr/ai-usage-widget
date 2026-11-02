// Resolve the painted ancestor stack, including translucent card surfaces.
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
const context = canvas.getContext('2d', { willReadFrequently: true });
export const rgba = value => { context.clearRect(0,0,1,1); context.fillStyle=value; context.fillRect(0,0,1,1); return [...context.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v); };
export function luminance(rgb) { return rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function surface(element) {
  const layers = [];
  for (let node = element; node; node = node.parentElement) layers.unshift(rgba(getComputedStyle(node).backgroundColor));
  let result = [128, 128, 128];
  for (const layer of layers) { const alpha = layer[3] ?? 1; if (layer.length >= 3) result = result.map((v, i) => layer[i] * alpha + v * (1 - alpha)); }
  return result;
}
export function repairTextContrast(root) {
  const elements = [...root.querySelectorAll('*')].filter(el => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
  for (const el of elements) el.style.removeProperty('color');
  for (const el of elements) {
    if (!el.getClientRects().length) continue;
    const background = surface(el), css = getComputedStyle(el), source = rgba(css.color);
    const alpha = source[3] ?? 1;
    const color = source.slice(0, 3).map((v, i) => v * alpha + background[i] * (1 - alpha));
    if (contrast(color, background) >= 4.7) continue;
    const target = luminance(background) > .179 ? [0, 0, 0] : [255, 255, 255];
    for (let amount = .01; amount <= 1.01; amount += .01) {
      const candidate = color.map((v, i) => Math.round(v * (1 - amount) + target[i] * amount));
      if (contrast(candidate, background) >= 4.7) { el.style.setProperty('color', `rgb(${candidate.join(',')})`, 'important'); break; }
    }
  }
}
