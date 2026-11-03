import { providerIndex, identityColor, identityPatterns } from './identity.js';
import { escapeHtml as esc, pctOf, countdown, severity, providerNames } from '../dot-matrix/render.js';
import { createRenderer } from './render.js';
const renderers=new Map();
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
};
const trackColor = w => `var(--severity${({normal:'Normal',warning:'Warning',danger:'Danger'})[severity(pctOf(w||{})??0)]})`;
function elapsedMarker(w,r) {
  const duration = w?.window_minutes || (w?.kind==='weekly'?10080:w?.kind==='session'?300:0);
  const end=Date.parse(w?.resets_at);
  if(!duration||!Number.isFinite(end))return '';
  const elapsed=Math.max(0,Math.min(1,1-(end-Date.now())/(duration*60000)));
  const angle=elapsed*2*Math.PI-Math.PI/2;
  return `<line class="dial-elapsed" x1="${170+(r-5)*Math.cos(angle)}" y1="${170+(r-5)*Math.sin(angle)}" x2="${170+(r+5)*Math.cos(angle)}" y2="${170+(r+5)*Math.sin(angle)}"/>`;
}
export function renderRound(root,snapshot,settings) {
  const providers=snapshot?.providers||[];
  if(settings.shape==='pill') {
    if(!renderers.has(settings.theme))renderers.set(settings.theme,createRenderer(settings.theme));
    renderers.get(settings.theme)(root,snapshot);
    return;
  }
  const items=providers.map(p=>({p,w:(p.windows||[]).find(w=>w.kind==='session')||(p.windows||[])[0]}));
  const hero=items.reduce((a,b)=>(pctOf(b.w||{})??-1)>(pctOf(a?.w||{})??-1)?b:a,items[0]);
  const tracks=providers.length===1 ? ['session','weekly'].map(kind=>({p:providers[0],w:(providers[0].windows||[]).find(w=>w.kind===kind)})) : items;
  const label=p=>providerNames[p.id]||p.label||p.id||'Provider';
  const multi=providers.length>1;
  const mono=settings.colorMode==='mono';
  const color=(p,w,i)=>mono?'var(--textPrimary)':identityColor(providerIndex(p,i));
  const style=dialStyles[settings.theme]||dialStyles.system;
  root.innerHTML=`<div class="dial"><svg class="dial-rings" style="stroke-width:${style.width};stroke-linecap:${style.cap}" viewBox="0 0 340 340" role="img" aria-label="${esc(tracks.map(({p,w})=>`${label(p)} ${w?.kind||'quota'} ${pctOf(w||{})??'unknown'}%`).join(', '))}">${tracks.map(({p:provider,w},i)=>{
    const r=151-i*17,p=pctOf(w||{}),index=providerIndex(provider,i);
    const pattern=multi&&mono?identityPatterns[index]:style.pattern;
    const angle=(p??0)/100*2*Math.PI-Math.PI/2;
    const level=severity(p??0);
    const marker=level==='normal'?'':`<circle class="dial-status" cx="${170+r*Math.cos(angle)}" cy="${170+r*Math.sin(angle)}" r="${level==='danger'?5:4}" style="fill:${trackColor(w)};stroke:var(--bgWidget);stroke-width:2"/>`;
    return `<defs><mask id="dial-mask-${i}"><circle class="dial-pattern" cx="170" cy="170" r="${r}" pathLength="100" fill="none" stroke="white" stroke-width="${style.width}" stroke-linecap="${style.cap}" ${pattern?`stroke-dasharray="${pattern}"`:''}/></mask></defs><g transform="rotate(-90 170 170)"><circle mask="url(#dial-mask-${i})" class="dial-track" cx="170" cy="170" r="${r}"/><circle mask="url(#dial-mask-${i})" class="dial-value" style="stroke:${color(provider,w,i)}" data-identity="${index}" data-severity="${severity(p??0)}" cx="170" cy="170" r="${r}" pathLength="100" stroke-dasharray="${p??0} 100"/></g>${marker}${settings.theme==='minimal-pace'?elapsedMarker(w,r):''}`;
  }).join('')}</svg>${arcLabels(tracks,color,label)}<div class="dial-safe"><strong class="dial-number">${hero&&pctOf(hero.w||{})!==null?Math.round(pctOf(hero.w||{}))+'%':'—'}</strong><div class="dial-name">${hero?esc(label(hero.p)):'NO ACTIVE PROVIDERS'}</div><small class="dial-reset">${hero?esc(countdown(hero.w?.resets_at)):'Choose providers in Settings'}</small></div></div>`;
}

// Move nearby endpoints along their own ring; reserve the center and 8px rim.
function arcLabels(tracks,color,label) {
 const placed=[],overlap=(a,b)=>Math.abs(a.x-b.x)<46&&Math.abs(a.y-b.y)<22;
 return tracks.map(({p,w},i)=>{
  const radius=133-i*17,angle=(pctOf(w||{})??0)/100*2*Math.PI-Math.PI/2;
  let box;
  for(let step=0;step<70;step++){
   const offset=step===0?0:Math.ceil(step/2)*.12*(step%2?1:-1),a=angle+offset;
   const candidate={x:radius*Math.cos(a),y:radius*Math.sin(a)};
   if(Math.hypot(Math.abs(candidate.x)+22,Math.abs(candidate.y)+10)>160)continue;
   if(Math.abs(candidate.x)<40&&candidate.y<-105)continue;
   if(Math.abs(candidate.x)<96&&Math.abs(candidate.y)<65)continue;
   if(placed.some(b=>overlap(candidate,b)))continue;
   box=candidate;break;
  }
  if(!box)return '';
  placed.push(box);
  return `<span class="dial-arc-label" data-provider="${esc(p.id)}" title="${esc(label(p))}" style="left:${(170+box.x)/3.4}%;top:${(170+box.y)/3.4}%;--identity:${color(p,w,i)}">${pctOf(w||{})===null?'—':Math.round(pctOf(w||{}))+'%'}</span>`;
 }).join('');
}
