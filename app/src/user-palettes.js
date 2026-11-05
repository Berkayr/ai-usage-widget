export const paletteTokens = ['bgWidget', 'bgCard', 'bgTrackOff', 'textPrimary', 'textSecondary', 'textMuted', 'border', 'accent', 'severityNormal', 'severityWarning', 'severityDanger'];
export const validColor = value => typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
export function validateUserPalettes(input) {
  if (!Array.isArray(input) || input.length > 50) throw Error('Use an array of at most 50 palettes.');
  const ids = new Set();
  return input.map(p => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^user-[a-z0-9-]{1,64}$/.test(p.id) || ids.has(p.id)) throw Error('Invalid or duplicate palette id.');
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || [...p.name].length > 40 || [...p.name].some(c => c.length === 1 && /[\ud800-\udfff]/.test(c)) || /[<>\x00-\x1f\x7f-\x9f]/.test(p.name)) throw Error('Palette names must be plain text, 1–40 characters.');
    const result = {id:p.id, name:p.name};
    for (const mode of ['dark', 'light']) {
      result[mode] = {};
      for (const key of paletteTokens) {
        if (!validColor(p[mode]?.[key])) throw Error(`Invalid ${mode} ${key}: use #rgb, #rrggbb or #rrggbbaa.`);
        result[mode][key] = p[mode][key];
      }
    }
    return result;
  });
}
export function userPalettes(settings) {
  try { return validateUserPalettes(settings.userPalettes ?? []); } catch { return []; }
}
export function paletteChoices(theme, settings) {
  return {...theme.palettes, ...Object.fromEntries(userPalettes(settings).map(p => [p.id, {...p.dark, name:p.name, light:p.light}]))};
}
export function selectedPalette(theme, settings) {
  return paletteChoices(theme, settings)[settings.palette] || Object.values(theme.palettes)[0];
}
// Normalize short and alpha hex before the appearance pipeline mixes RGB channels.
export function opaqueColor(value, paper = '#ffffff') {
  let h = value.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const alpha = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
  const base = paper.slice(1);
  return '#' + [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * alpha + parseInt(base.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}
export function appearancePalette(selected, mode, normalize = false) {
  const palette = {...selected, ...selected[mode], mode};
  if (!normalize) return palette;
  const paper = opaqueColor(palette.bgWidget, mode === 'light' ? '#ffffff' : '#000000');
  for (const key of paletteTokens) palette[key] = opaqueColor(palette[key], paper);
  return palette;
}
