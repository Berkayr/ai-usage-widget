// Design dimensions are logical CSS pixels at 100% fine tuning and DPI 1.
export const sizePresets = {Small:75, Medium:100, Large:125, 'X-Large':200, '2X-Large':250};
export const shapes = ['portrait', 'landscape', 'square', 'circle', 'pill'];
export const reservedShapes = [];
export function normalizeShape(shape) { return shapes.includes(shape) ? shape : 'portrait'; }
export function normalizeSize(value = {}) {
  const aliases = {Normal:'Medium', Huge:'X-Large'};
  let sizePreset = aliases[value.sizePreset] || value.sizePreset;
  const legacy = Number.isFinite(Number(value.scale)) ? Math.max(50, Math.min(300, Number(value.scale))) : 100;
  let fineTune = Number(value.fineTune);
  if (!Object.hasOwn(sizePresets, sizePreset)) {
    sizePreset = Object.keys(sizePresets).reduce((a,b) => Math.abs(sizePresets[b]-legacy)<Math.abs(sizePresets[a]-legacy)?b:a, 'Medium');
    fineTune = legacy / sizePresets[sizePreset] * 100;
  }
  if (!Number.isFinite(fineTune)) fineTune = 100;
  fineTune = Math.max(50, Math.min(150, fineTune));
  return {...value, shape:normalizeShape(value.shape), sizePreset, fineTune, scale:Math.max(10, Math.min(300, sizePresets[sizePreset]*fineTune/100))};
}
export function widgetWidth(settings, count = 1) {
  if (settings.shape === 'landscape') return 680;
  if (['square','circle'].includes(settings.shape)) return 340;
  if (settings.shape === 'pill') return 480;
  return settings.theme === 'compact-strip' ? 30 + Math.max(1,count)*310 : 340;
}

// Shared with the CSS tokens in layout.css: 28 padding + 2 border +
// 60 header + 26 footer, then one 200px block and 10px gap per provider.
export function widgetHeight(settings, count = 1) {
  if (['landscape', 'square', 'circle'].includes(settings.shape)) return 340;
  if (settings.shape === 'pill') return 120;
  return (settings.quoteEnabled === true ? 320 : 0) + 116 + (settings.theme === 'compact-strip' ? 1 : Math.max(1, count)) * (settings.quoteEnabled === true ? 170 : 210);
}

export function widgetProviders(providers, selection) {
  if (!Array.isArray(selection)) return providers.slice(0,3);
  return providers.filter(p=>selection.includes(p.id)).slice(0,3);
}

// Work-area dimensions use the same units as the native placement API.
export function monitorFit(settings, count, monitor, platform = 'linux') {
  const dpi = monitor.scale || 1;
  const unit = (platform === 'windows' ? dpi : 1) / (settings.matchPhysicalSize ? dpi : 1);
  const margin = platform === 'linux' && settings.position !== 'Free' ? Math.max(8, Number(settings.linux?.margin) || 0) : 8 * (platform === 'windows' ? dpi : 1);
  const availableWidth = Math.max(1, monitor.width - 2 * margin);
  const availableHeight = Math.max(1, monitor.height - 2 * margin);
  const maxScale = Math.min(availableWidth / widgetWidth(settings, count), availableHeight / widgetHeight(settings, count)) * 100 / unit;
  const width = widgetWidth(settings, count) * settings.scale / 100 * unit;
  const height = widgetHeight(settings, count) * settings.scale / 100 * unit;
  return {width, height, maxScale, fits:settings.scale <= maxScale, availableWidth, availableHeight};
}
