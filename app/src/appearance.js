import { selectedPalette, appearancePalette } from './user-palettes.js';
import { providerColors } from './themes/shared/identity.js';
const rgb = hex => hex.replace('#', '').match(/../g).slice(0, 3).map(n => parseInt(n, 16));
function mix(a, b, weight) { return '#' + rgb(a).map((v, i) => Math.round(v * weight + rgb(b)[i] * (1 - weight)).toString(16).padStart(2, '0')).join(''); }
function luminance(hex) { return rgb(hex).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
function readable(color, background) {
  const bg = luminance(background), target = bg > .179 ? '#000000' : '#ffffff';
  for (let i = 0; i <= 100; i++) {
    const candidate = mix(color, target, 1 - i / 100), value = luminance(candidate);
    if ((Math.max(value, bg) + .05) / (Math.min(value, bg) + .05) >= 5) return candidate;
  }
  return target;
}
function properties(values) {
  for (const [key,value] of Object.entries(values)) document.documentElement.style.setProperty(`--${key}`,value);
}
function basePalette(settings, palette, background = palette.bgWidget) {
  const values = Object.fromEntries(Object.entries(palette).filter(([key,value]) => typeof value === 'string' && !['name','mode'].includes(key)));
  properties(values);
  providerColors(settings, settings.background || background).forEach((color,i) => properties({[`provider-${i}`]:color}));
  if (settings.accent) properties({accent:settings.accent});
  if (settings.background) properties({bgWidget:settings.background});
  document.documentElement.dataset.mode = palette.mode;
  // Native system accent when supported; no platform bridge or font embedding.
  const native = CSS.supports('color','AccentColor') && CSS.supports('color','AccentColorText');
  properties({systemAccent:settings.accent || (native && !(settings.theme === 'system' && settings.palette !== 'default') ? 'AccentColor' : palette.accent),systemAccentText:CSS.supports('color','AccentColorText')?'AccentColorText':palette.textPrimary});
}
function textPalette(settings, palette) {
  const card = palette.bgCard, background = settings.background || palette.bgWidget;
  const neutral = palette.mode === 'light' ? '#292d32' : '#e0e3e7';
  const calmText = color => settings.colorMode === 'calm' ? mix(color,neutral,.25) : color;
  const foreground = calmText(palette.textPrimary), primary = readable(foreground,card);
  properties({textPrimary:primary,textSecondary:readable(calmText(palette.textSecondary),card),textMuted:readable(calmText(palette.textMuted),card),chromeText:readable(foreground,background),chromeSecondary:readable(calmText(palette.textMuted),background)});
  if (settings.colorMode === 'calm') properties({severityNormal:primary,severityWarning:readable(palette.mode==='light'?'#805c29':'#c6ab7d',card),severityDanger:readable(palette.mode==='light'?'#99494b':'#d29898',card)});
}
function monoPalette(mode) {
  const light = mode === 'light', ink = light ? '#000000' : '#ffffff', paper = light ? '#ffffff' : '#000000';
  const secondary = light ? '#333333' : '#cccccc', muted = light ? '#555555' : '#aaaaaa';
  properties({bgWidget:paper,bgCard:paper,bgTrackOff:light?'#dddddd':'#333333',textPrimary:ink,textSecondary:secondary,textMuted:muted,chromeText:ink,chromeSecondary:muted,border:light?'#888888':'#777777',accent:ink,severityNormal:ink,severityWarning:ink,severityDanger:ink});
}
function colorMode(settings) {
  settings.colorMode = ['calm','vivid','mono'].includes(settings.colorMode) ? settings.colorMode : 'calm';
  settings.accentEdge = ['off','auto','left','right'].includes(settings.accentEdge) ? settings.accentEdge : 'off';
  document.documentElement.dataset.colorMode = settings.colorMode;
  const automatic = settings.position.endsWith('left') ? 'left' : settings.position.endsWith('right') ? 'right' : 'off';
  document.documentElement.dataset.accentEdge = settings.accentEdge === 'auto' ? automatic : settings.accentEdge;
}
export function applyAppearance(settings, theme, systemLight) {
  const selected = selectedPalette(theme, settings);
  const mode = settings.appearance === 'auto' ? (systemLight ? 'light' : 'dark') : settings.appearance;
  const palette = appearancePalette(selected, mode);
  const textColors = settings.palette.startsWith('user-') ? appearancePalette(selected, mode, true) : palette;
  basePalette(settings,palette,textColors.bgWidget);colorMode(settings);textPalette(settings,textColors);
  if (settings.colorMode === 'mono') monoPalette(mode);
}
