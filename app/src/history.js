import {escapeHtml as esc} from './themes/dot-matrix/render.js';

export const historyDefaults = {historyEnabled:true, historyMode:'card', historyCost:true, historyModels:true, historyHeatmap:true, historyMachines:false, historyPanelOpen:false};
const number = value => Number.isFinite(value) && value > 0 ? value : 0;
export function formatTokens(value) {
  const n = number(value);
  return n >= 1e9 ? `${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n/1e3).toFixed(1)}K` : String(n);
}
export const formatMoney = value => `$${number(value).toFixed(number(value) >= 100 ? 0 : 2)}`;
export const hasHistory = provider => ['local','account'].includes(provider?.history?.scope) && Array.isArray(provider.history.daily);
export const splitMachines = (history, enabled) => enabled === true && new Set((history?.machines || []).map(m=>m.id)).size >= 2;
export function dailySeries(history, days = 30, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const entries = new Map((history?.daily || []).map(d=>[d.date,d]));
  return Array.from({length:days}, (_,i)=>{
    const date = new Date(end); date.setDate(date.getDate() - days + i + 1);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return {date:key, tokens:0, ...entries.get(key)};
  });
}
const sum = rows => rows.reduce((total,row)=>total + number(row.tokens),0);
const color = i => `var(--provider-${i % 12}, var(--accent))`;
export function bars(history, days, machines = false, now) {
  const rows = dailySeries(history,days,now), max = Math.max(1,...rows.map(r=>number(r.tokens)));
  const ids = splitMachines(history,machines) ? history.machines.map(m=>m.id) : [];
  return `<div class="history-bars" role="img" aria-label="Daily tokens for the last ${days} days">${rows.map(row=>{
    const values = ids.length ? ids.map(id=>number(row.by_machine?.[id])) : [number(row.tokens)];
    const rest = Math.max(0,number(row.tokens)-values.reduce((a,b)=>a+b,0));
    if (ids.length && rest) values.push(rest);
    return `<div class="history-bar" title="${esc(row.date)} · ${formatTokens(row.tokens)}" style="height:${100*number(row.tokens)/max}%">${values.map((v,i)=>`<i style="flex:${v};background:${ids.length ? color(i) : 'var(--provider-identity, var(--accent))'}"></i>`).join('')}</div>`;
  }).join('')}</div><div class="history-axis"><span>${rows[0].date.slice(5)}</span><span>${rows.at(-1).date.slice(5)}</span></div>`;
}
function price(value, history) {
  return `<p class="history-price" title="Estimated API price equivalent, not your actual bill. Prices as of ${esc(history.prices_as_of || 'unknown')}; unpriced tokens may be excluded.">≈ ${formatMoney(value)} at API prices</p>`;
}
function details(history, settings, days, panel, now) {
  const rows = dailySeries(history,30,now);
  let html = `<div class="history-scope">${history.scope === 'local' ? 'Claude Code logs · LOCAL' : 'All devices · ACCOUNT'}</div><div class="history-kpis">${[['Today',rows.slice(-1)],['7d',rows.slice(-7)],['30d',rows]].map(([label,data])=>`<span>${label}<b>${formatTokens(sum(data))}</b></span>`).join('')}</div>${bars(history,days,settings.historyMachines,now)}`;
  if (settings.historyCost && history.scope === 'local' && rows.some(d=>Number.isFinite(d.cost))) html += price(rows.slice(-days).reduce((s,d)=>s+number(d.cost),0),history);
  if (splitMachines(history,settings.historyMachines)) html += `<div class="history-legend">${history.machines.map((m,i)=>`<span style="--series:${color(i)}">${esc(m.id)} · ${formatTokens(m.tokens)}</span>`).join('')}</div>`;
  if (settings.historyModels && history.models?.length) {
    const total = Math.max(1,sum(history.models));
    html += `<h3>Models · all available history</h3><div class="history-model-bar">${history.models.map((m,i)=>`<i style="flex:${number(m.tokens)};background:${color(i)}"></i>`).join('')}</div><div class="history-legend">${history.models.map((m,i)=>`<span style="--series:${color(i)}">${esc(m.model)} ${Math.round(number(m.tokens)/total*100)}%${settings.historyCost && Number.isFinite(m.cost) ? ' · '+formatMoney(m.cost) : ''}</span>`).join('')}</div>`;
  }
  if (panel && settings.historyHeatmap && history.scope === 'local' && Array.isArray(history.heatmap)) {
    const max = Math.max(1,...history.heatmap.flat().map(number));
    html += '<h3>Activity · all available history</h3><div class="history-heat"><span></span><span class="history-hours">00　　　　 06　　　　 12　　　　 18</span>';
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((day,d)=>{
      html += `<span>${day}</span>${Array.from({length:24},(_,h)=>{const value = number(history.heatmap[d]?.[h]); return `<i title="${day} ${h}:00 · ${formatTokens(value)}" style="opacity:${.12+.88*Math.sqrt(value/max)}"></i>`;}).join('')}`;
    });
    html += '</div>';
  }
  if (panel && splitMachines(history,settings.historyMachines)) html += `<h3>Computers · all available history</h3>${history.machines.map(m=>`<p>${esc(m.id)} · ${formatTokens(m.tokens)}${settings.historyCost && Number.isFinite(m.cost) ? ' · '+formatMoney(m.cost) : ''}</p>`).join('')}`;
  if (history.scope === 'account') html += '<p class="history-note">Account totals only. Model, computer and activity breakdowns are unavailable.</p>';
  return html;
}
export function historyGeometry(baseWidth, availableWidth, scale = 100) {
  const available = Math.max(1, availableWidth);
  const panel = Math.min(360 * scale / 100, available / 2);
  return {panel, width: Math.min(baseWidth, available - panel) + panel};
}
export function panelOnLeft(settings) {
  return settings.position === 'Free' ? (settings.placement?.xRatio ?? settings.placement?.x_ratio ?? 1) >= .5 : !settings.position?.endsWith('left');
}
export function mountHistory(widget, root, providers, value, state, redraw, saveOpen, now) {
  const settings = {...historyDefaults,...value};
  widget.querySelectorAll(':scope > .history-panel, :scope > .history-toggle').forEach(el=>el.remove());
  const available = providers.filter(hasHistory);
  const enabled = settings.historyEnabled && available.length > 0;
  widget.classList.toggle('has-history-panel',Boolean(enabled && settings.historyMode === 'panel' && settings.historyPanelOpen));
  widget.classList.toggle('history-left',panelOnLeft(settings));
  if (!enabled) return false;
  if (settings.historyMode !== 'panel') {
    root.querySelectorAll('.provider-card').forEach((card,i)=>{
      const provider = providers[i]; if (!hasHistory(provider)) return;
      const section = document.createElement('section'); section.className='usage-history';
      if (settings.historyMode === 'under') {
        const rows = dailySeries(provider.history,14,now);
        section.classList.add('history-mini');
        section.innerHTML = `${bars(provider.history,14,false,now)}<div class="history-mini-label">Today ${formatTokens(sum(rows.slice(-1)))} · 7d ${formatTokens(sum(rows.slice(-7)))} <b>${esc(provider.history.scope.toUpperCase())}</b></div>`;
      } else {
        const open = state.open === provider.id;
        card.tabIndex=0; card.setAttribute('role','button'); card.setAttribute('aria-expanded',String(open));
        card.setAttribute('aria-label',`${provider.label || provider.id} usage history`);
        const hint=document.createElement('span'); hint.className='history-card-hint'; hint.textContent=open?'▴ Hide history':'▾ 30d history'; card.append(hint);
        card.dataset.historyProvider=provider.id;
        const toggle=()=>{state.open=open?null:provider.id; redraw(); requestAnimationFrame(()=>[...root.querySelectorAll('.provider-card')].find(c=>c.dataset.historyProvider===provider.id)?.focus());};
        card.onclick=e=>{if (!e.target.closest('button,a,input,select')) toggle();};
        card.onkeydown=e=>{if(e.target===card && ['Enter',' '].includes(e.key)){e.preventDefault();toggle();}};
        if (!open) return;
        section.innerHTML=details(provider.history,settings,30,false,now);
      }
      card.append(section);
    });
    return false;
  }
  const left=panelOnLeft(settings), open=settings.historyPanelOpen;
  const button=document.createElement('button'); button.className='history-toggle'; button.textContent=(left !== open)?'‹':'›'; button.setAttribute('aria-label',open?'Close usage history':'Open usage history'); button.setAttribute('aria-expanded',String(open)); button.onclick=()=>saveOpen(!open); widget.append(button);
  if (!open) return false;
  const panel=document.createElement('aside'); panel.className='history-panel'; panel.setAttribute('aria-label','Usage history');
  const controls=document.createElement('div'); controls.className='history-controls';
  const select=document.createElement('select'); select.setAttribute('aria-label','History provider');
  available.forEach(p=>select.add(new Option(p.label || p.id,p.id)));
  const provider=available.find(p=>p.id===state.provider) || available[0]; select.value=provider.id;
  select.onchange=()=>{state.provider=select.value;redraw();}; controls.append(select);
  for(const days of [7,30]) {const b=document.createElement('button');b.textContent=`${days} days`;b.setAttribute('aria-pressed',String((state.days || 30)===days));b.onclick=()=>{state.days=days;redraw();};controls.append(b);}
  panel.append(controls); const body=document.createElement('div'); body.innerHTML=details(provider.history,settings,state.days || 30,true,now); panel.append(body); widget.append(panel);
  return true;
}
