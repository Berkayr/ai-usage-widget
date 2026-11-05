import { featuredProvider } from '../../provider-layout.js';
import { providerIndex, identityColor, identityPatterns } from './identity.js';
import { escapeHtml as esc, pctOf, countdown, severity, providerNames } from '../dot-matrix/render.js';
import { createRenderer } from './render.js';
const renderers = new Map();
// Width, cap and segmentation form a stable signature for each dial theme.
export const dialStyles = {
  system: {width:6, cap:'round'},
  brutalist: {width:12, cap:'butt'},
  'circular-rings': {width:13, cap:'round'},
  'dot-matrix': {width:7, cap:'round', pattern:'.1 3'},
  'retro-lcd': {width:9, cap:'butt', pattern:'1.3 .7'},
  terminal: {width:4, cap:'butt', pattern:'1 1'},
  'frosted-glass': {width:8, cap:'round'},
  'minimal-pace': {width:2, cap:'butt'},
  'compact-strip': {width:5, cap:'square'},
  reactor: {width:9, cap:'butt', pattern:'9 1'},
};
const usage = w => pctOf(w || {});
const label = p => providerNames[p.id] || p.label || p.id || 'Provider';
const providerWindow = p => (p.windows || []).find(w => w.kind === 'session') || (p.windows || [])[0];
function endpoint(w, r) {
  const p = usage(w) ?? 0, level = severity(p);
  if (level === 'normal') return '';
  const color = `var(--severity${({normal:'Normal',warning:'Warning',danger:'Danger'})[level]})`;
  const angle = p / 100 * 2 * Math.PI - Math.PI / 2;
  return `<circle class="dial-status" cx="${170+r*Math.cos(angle)}" cy="${170+r*Math.sin(angle)}" r="${level==='danger'?5:4}" style="fill:${color};stroke:var(--bgWidget);stroke-width:2"/>`;
}
function dialTrack(item, i, context) {
  const {p:provider,w} = item, {style,settings,multi,color} = context;
  const r = 151 - i * 17, p = usage(w), index = providerIndex(provider, i);
  const pattern = multi && settings.colorMode === 'mono' ? identityPatterns[index] : style.pattern;
  const dash = pattern ? `stroke-dasharray="${pattern}"` : '';
  return `<defs><mask id="dial-mask-${i}"><circle class="dial-pattern" cx="170" cy="170" r="${r}" pathLength="100" fill="none" stroke="white" stroke-width="${style.width*(settings.colorMode==='vivid'?1.12:1)}" stroke-linecap="${style.cap}" ${dash}/></mask></defs><g transform="rotate(-90 170 170)"><circle mask="url(#dial-mask-${i})" class="dial-track" cx="170" cy="170" r="${r}"/><circle mask="url(#dial-mask-${i})" class="dial-value" style="stroke:${color(provider,w,i)}" data-identity="${index}" data-severity="${severity(p??0)}" cx="170" cy="170" r="${r}" pathLength="100" stroke-dasharray="${p??0} 100"/></g>${endpoint(w,r)}`;
}
function center(hero, count) {
  if (!hero) return `<div class="dial-safe"><strong class="dial-number">—</strong><div class="dial-name">${count?'ALL PROVIDERS':'NO ACTIVE PROVIDERS'}</div><small class="dial-reset">${count?'Select a featured provider':'Choose providers in Settings'}</small></div>`;
  const value = usage(hero.w), weekly = usage((hero.p.windows || []).find(w=>w.kind==='weekly'));
  return `<div class="dial-safe"><strong class="dial-number">${value === null?'—':Math.round(value)+'%'}</strong><div class="dial-name">${esc(label(hero.p))}</div><small class="dial-weekly">Weekly ${weekly === null?'—':Math.round(weekly)+'%'}</small><small class="dial-reset">${esc(countdown(hero.w?.resets_at))}</small></div>`;
}
function quotaTracks(providers, items) {
  if (providers.length !== 1) return items;
  return ['session','weekly'].map(kind => ({p:providers[0],w:(providers[0].windows || []).find(w => w.kind === kind)}));
}
function renderPill(root, snapshot, settings) {
  if (!renderers.has(settings.theme)) renderers.set(settings.theme, createRenderer(settings.theme));
  renderers.get(settings.theme)(root, snapshot);
}
export function renderRound(root, snapshot, settings) {
  const providers = snapshot?.providers || [];
  if (settings.shape === 'pill') return renderPill(root, snapshot, settings);
  const items = providers.map(p => ({p,w:providerWindow(p)}));
  const chosen = featuredProvider(providers, settings);
  const hero = items.find(item => item.p === chosen);
  const tracks = quotaTracks(providers, items);
  const color = (p,w,i) => settings.colorMode === 'mono' ? 'var(--textPrimary)' : identityColor(providerIndex(p,i));
  const style = dialStyles[settings.theme] || dialStyles.system;
  const context = {style,settings,multi:providers.length>1,color};
  const core = settings.theme === 'reactor' ? '<div class="reactor-core" aria-hidden="true"></div>' : '';
  const description = tracks.map(({p,w}) => `${label(p)} ${w?.kind || 'quota'} ${usage(w) ?? 'unknown'}%`).join(', ');
  const width = style.width * (settings.colorMode === 'vivid' ? 1.12 : 1);
  root.innerHTML = `<div class="dial">${core}<svg class="dial-rings" style="stroke-width:${width};stroke-linecap:${style.cap}" viewBox="0 0 340 340" role="img" aria-label="${esc(description)}">${tracks.map((item,i)=>dialTrack(item,i,context)).join('')}</svg>${arcLabels(tracks,color)}${center(hero,providers.length)}</div>`;
}
const overlap = (a,b) => Math.abs(a.x-b.x)<46 && Math.abs(a.y-b.y)<22;
function validLabel(candidate, placed) {
  if (Math.hypot(Math.abs(candidate.x)+22,Math.abs(candidate.y)+10)>160) return false;
  if (Math.abs(candidate.x)<40 && candidate.y<-105) return false;
  if (Math.abs(candidate.x)<96 && Math.abs(candidate.y)<65) return false;
  return !placed.some(b => overlap(candidate,b));
}
function labelPosition(w, i, placed) {
  const radius = 133 - i * 17, angle = (usage(w) ?? 0)/100*2*Math.PI-Math.PI/2;
  for (let step=0;step<70;step++) {
    const offset = step===0 ? 0 : Math.ceil(step/2)*.12*(step%2?1:-1), a = angle+offset;
    const candidate = {x:radius*Math.cos(a),y:radius*Math.sin(a)};
    if (validLabel(candidate,placed)) return candidate;
  }
  return null;
}
// Move nearby endpoints along their own ring; reserve the center and 8px rim.
function arcLabels(tracks, color) {
  const placed = [];
  return tracks.map(({p,w},i) => {
    const box = labelPosition(w,i,placed);
    if (!box) return '';
    placed.push(box);
    const value = usage(w);
    return `<span class="dial-arc-label" data-provider="${esc(p.id)}" title="${esc(label(p))}" style="left:${(170+box.x)/3.4}%;top:${(170+box.y)/3.4}%;--identity:${color(p,w,i)}">${value===null?'—':Math.round(value)+'%'}</span>`;
  }).join('');
}
