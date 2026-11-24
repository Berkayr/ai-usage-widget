// Design dimensions are logical CSS pixels at 100% fine tuning and DPI 1.
export const maxScreenCoverage = 0.5;
export const maxPortraitWidthFraction = 0.3;
export function effectiveSizeMode(settings) {
  return settings.sizeMode === 'screen' && ['portrait','strip'].includes(settings.shape) ? 'screen' : 'fixed';
}
export function screenCoverage(settings) {
  return maxScreenCoverage;
}
export const sizePresets = {Small:85, Medium:100, Large:120, 'X-Large':150, '2X-Large':200};
export const shapes = ['portrait', 'landscape', 'square', 'circle', 'pill', 'strip'];
export function normalizeShape(shape) { return shapes.includes(shape) ? shape : 'portrait'; }
// Loading migration is separate from live edits so Portrait stays selectable.
const isLegacyStrip = value => !value.stripLayoutVersion && value.theme === 'compact-strip' && (!value.shape || value.shape === 'portrait');
export function normalizeSize(value = {}, migrateLegacy = false) {
  if (migrateLegacy && Array.isArray(value.widgets)) value = {...value, widgets:value.widgets.map(widget => {
    const effective = {...value, ...widget.overrides};
    return isLegacyStrip(effective) ? {...widget, overrides:{...widget.overrides, shape:'strip'}} : widget;
  })};
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
  return {...value, shape:migrateLegacy && isLegacyStrip(value) ? 'strip' : normalizeShape(value.shape), stripLayoutVersion:1, sizePreset, fineTune, scale:Math.max(10, Math.min(300, sizePresets[sizePreset]*fineTune/100))};
}
export function widgetWidth(settings, count = 1) {
  if (settings.shape === 'landscape') return 680;
  if (['square','circle'].includes(settings.shape)) return 340;
  if (settings.shape === 'pill') return 480;
  return settings.shape === 'strip' ? 30 + Math.max(1,count)*310 : 340;
}

// Shared with the CSS tokens in layout.css: 28 padding + 2 border +
// 60 header + 26 footer, then one 200px block and 10px gap per provider.
export function widgetHeight(settings, count = 1) {
  if (['landscape', 'square', 'circle'].includes(settings.shape)) return 340;
  if (settings.shape === 'pill') return 120;
  if (settings.shape === 'strip') return 326;
  return (settings.quoteEnabled === true ? 320 : 0) + 116 + Math.max(1, count) * 210;
}

export function widgetProviders(providers, selection) {
  if (!Array.isArray(selection)) return providers.slice(0,3);
  const hasDerived = selection.some(id => String(id).includes('~'));
  return providers.filter(p => selection.includes(p.id) || (!hasDerived && p.baseId && selection.includes(p.baseId))).slice(0,3);
}

// Work-area dimensions use the same units as the native placement API.
export function monitorFit(settings, count, monitor, platform = 'linux') {
  const dpi = monitor.scale || 1;
  const unit = (platform === 'windows' ? dpi : 1) / (settings.matchPhysicalSize && effectiveSizeMode(settings) !== "screen" ? dpi : 1);
  const margin = platform === 'linux' && settings.position !== 'Free' ? Math.max(8, Number(settings.linux?.margin) || 0) : 8 * (platform === 'windows' ? dpi : 1);
  const availableWidth = Math.max(1, monitor.width - 2 * margin);
  const availableHeight = Math.max(1, monitor.height - 2 * margin);
  const baseWidth = widgetWidth(settings, count);
  const baseHeight = widgetHeight(settings, count);
  const coverageScale = Math.sqrt(screenCoverage(settings) * availableWidth * availableHeight / (baseWidth * baseHeight));
  const maxScale = Math.min(availableWidth / baseWidth * (effectiveSizeMode(settings) === 'screen' && settings.shape === 'portrait' ? maxPortraitWidthFraction : 1), availableHeight / baseHeight, coverageScale) * 100 / unit;
  const width = widgetWidth(settings, count) * settings.scale / 100 * unit;
  const height = widgetHeight(settings, count) * settings.scale / 100 * unit;
  return {width, height, maxScale, fits:settings.scale <= maxScale, margin, availableWidth, availableHeight};
}

// Manual reservations replace the detected edge, in logical pixels on every OS.
export function workAreaMonitor(monitor, settings, platform = 'linux') {
  const unit = platform === 'windows' ? monitor.scale || 1 : 1;
  const fullHeight=monitor.height+(monitor.detectedTop || 0)+(monitor.detectedBottom || 0);
  const top = Math.min(fullHeight-1, settings.reservedTop == null ? monitor.detectedTop || 0 : Math.max(0, Number(settings.reservedTop) || 0) * unit);
  const bottom = Math.min(fullHeight-top-1, settings.reservedBottom == null ? monitor.detectedBottom || 0 : Math.max(0, Number(settings.reservedBottom) || 0) * unit);
  const delta = top - (monitor.detectedTop || 0);
  return {...monitor, y:(monitor.y || 0)+delta, height:Math.max(1,monitor.height-delta-bottom+(monitor.detectedBottom || 0))};
}
export function fittedGeometry(settings, count, monitor, platform = 'linux') {
  const area = workAreaMonitor(monitor, settings, platform);
  const fit = monitorFit(settings, count, area, platform);
  const unit = (platform === 'windows' ? monitor.scale || 1 : 1) / (settings.matchPhysicalSize && effectiveSizeMode(settings) !== "screen" ? monitor.scale || 1 : 1);
  const wide = ['landscape','pill','strip'].includes(settings.shape);
  const target = (wide ? fit.availableWidth / widgetWidth(settings,count) : fit.availableHeight / widgetHeight(settings,count)) * 100 / unit;
  const fraction = [1,.75,.5,1/3].includes(Number(settings.fitFraction)) ? Number(settings.fitFraction) : 1;
  const requestedScale = effectiveSizeMode(settings) === 'screen' ? target*fraction*Math.max(.5,Math.min(1.5,Number(settings.fitFineTune || 100)/100)) : settings.scale;
  const scale = Math.min(requestedScale, fit.maxScale);
  return {...fit, limited:requestedScale > fit.maxScale + 1e-6, fits:effectiveSizeMode(settings)==='screen'||fit.fits, requestedWidth:fit.width, requestedHeight:fit.height, scale, width:widgetWidth(settings,count)*scale/100*unit, height:widgetHeight(settings,count)*scale/100*unit, area};
}

export function selectedWorkArea(monitors, settings) {
  const selection=settings.placement?.monitor ?? settings.linux?.monitor;
  const found=typeof selection==='number'?monitors[selection]:monitors.find(m=>m.name===selection);
  if (found) return found;
  if (typeof selection==='string' && settings.placement?.disconnected==='hide') return null;
  return (settings.placement?.disconnected==='monitor' && monitors.find(m=>m.name===settings.placement?.fallbackMonitor)) || monitors.find(m=>m.primary) || monitors[0];
}

// Native monitor dimensions become CSS pixels only at the window boundary.
export function historyHeight(baseHeight, extraHeight, availableHeight) {
  const height = Math.min(availableHeight, baseHeight + extraHeight);
  return {height, history:Math.max(0,height-baseHeight)};
}
