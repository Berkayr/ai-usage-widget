// Design dimensions are logical CSS pixels at 100% fine tuning and DPI 1.
export const sizePresets = {Small:75, Medium:100, Large:150, 'X-Large':200, '2X-Large':250};
// Reserved geometries are schema values, not selectable shapes in this phase.
export const shapes = ['portrait', 'landscape', 'square'];
export const reservedShapes = ['circle', 'pill'];
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
  return {...value, shape:normalizeShape(value.shape), sizePreset, fineTune, scale:sizePresets[sizePreset]*fineTune/100};
}
export function widgetWidth(settings, count = 1) {
  if (settings.shape === 'landscape') return 680;
  if (settings.shape === 'square') return 340;
  return settings.theme === 'compact-strip' ? 30 + Math.max(1,count)*310 : 340;
}

// Shared with the CSS tokens in layout.css: 28 padding + 2 border +
// 60 header + 26 footer, then one 200px block and 10px gap per provider.
export function widgetHeight(settings, count = 1) {
  if (['landscape', 'square'].includes(settings.shape)) return 340;
  return 116 + (settings.theme === 'compact-strip' ? 1 : Math.max(1, count)) * 210;
}
