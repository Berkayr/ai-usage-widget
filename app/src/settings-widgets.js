import {differingKeys, equalSettings} from './settings-compare.js';

export const overrideKeys = new Set([
  'theme', 'shape', 'scale', 'sizePreset', 'fineTune', 'sizeMode', 'fitFraction',
  'fitFineTune', 'fitHeight', 'matchPhysicalSize', 'appearance', 'palette', 'accent',
  'background', 'widgetOpacity', 'backgroundOpacity', 'colorMode', 'dotCount',
  'accentEdge', 'historyEnabled', 'historyMode', 'historyCost', 'historyModels',
  'historyHeatmap', 'historyMachines', 'historyPanelOpen', 'showExtraWindows',
  'widgetProviders', 'featuredProvider', 'featuredPosition', 'quoteEnabled',
  'quoteMode', 'quotePosition', 'quoteNavigation', 'position', 'lockPosition',
  'placementEditing', 'reservedTop', 'reservedBottom'
]);
export const overrideCategories = {
  general: ['showExtraWindows'],
  quote: ['quoteEnabled', 'quoteMode', 'quotePosition', 'quoteNavigation'],
  theme: ['theme', 'dotCount'],
  colors: ['appearance', 'palette', 'accent', 'background', 'widgetOpacity', 'backgroundOpacity', 'colorMode', 'accentEdge'],
  'shape-size': ['shape', 'scale', 'sizePreset', 'fineTune', 'sizeMode', 'fitFraction', 'fitFineTune', 'fitHeight', 'matchPhysicalSize'],
  display: ['position', 'lockPosition', 'placementEditing', 'reservedTop', 'reservedBottom'],
  providers: ['widgetProviders', 'featuredProvider', 'featuredPosition'],
  history: [...overrideKeys].filter(key => key.startsWith('history'))
};
export const canOverride = path => overrideKeys.has(path.split('.')[0]) ||
    path.startsWith('placement.') || ['linux.layer', 'linux.margin'].includes(path);

export function effectiveWidget(root, id) {
  const result = structuredClone(root);
  if (id === 'main') return result;
  const widget = root.widgets.find(w => w.id === id);
  if (!widget) throw Error('Unknown widget id');
  for (const [key, value] of Object.entries(widget.overrides)) {
    if (key === 'linux') Object.assign(result.linux, value);
    else if (overrideKeys.has(key)) result[key] = structuredClone(value);
  }
  result.placement = {...structuredClone(widget.placement), disconnected:'hide'};
  return result;
}

export function splitWidget(root, id, edited) {
  if (id === 'main') return structuredClone(edited);
  const result = structuredClone(root), before = effectiveWidget(root, id);
  const widget = result.widgets.find(w => w.id === id);
  widget.placement = {...structuredClone(edited.placement), disconnected:'hide'};
  // Only changed fields become overrides, so inherited values stay inherited.
  for (const key of differingKeys(before, edited)) {
    if (['widgets', 'placement', 'providerPreview', 'paletteLoadError'].includes(key)) continue;
    if (key === 'linux') {
      for (const part of differingKeys(before.linux, edited.linux)) {
        if (['layer', 'margin'].includes(part)) {
          widget.overrides.linux ??= {};
          if (equalSettings(edited.linux[part], root.linux[part])) delete widget.overrides.linux[part];
          else widget.overrides.linux[part] = edited.linux[part];
        } else result.linux[part] = edited.linux[part];
      }
      if (!Object.keys(widget.overrides.linux || {}).length) delete widget.overrides.linux;
    } else if (overrideKeys.has(key)) {
      if (equalSettings(edited[key], root[key])) delete widget.overrides[key];
      else widget.overrides[key] = structuredClone(edited[key]);
    } else result[key] = structuredClone(edited[key]);
  }
  return result;
}

export function widgetChangeCount(root, saved) {
  let count = differingKeys(root, saved).filter(key => key !== 'widgets').length;
  const current = new Map((root.widgets || []).map(w => [w.id, w]));
  const previous = new Map((saved.widgets || []).map(w => [w.id, w]));
  for (const id of new Set([...current.keys(), ...previous.keys()])) {
    const a = current.get(id), b = previous.get(id);
    count += !a || !b ? 1 : differingKeys(a, b).filter(k => k !== 'overrides').length +
      differingKeys(a.overrides, b.overrides).length;
  }
  return count;
}

export function newWidgetId(widgets, name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'widget';
  let id = base, suffix = 1;
  while (id === 'main' || widgets.some(w => w.id === id)) id = `${base}-${suffix++}`;
  return id;
}
