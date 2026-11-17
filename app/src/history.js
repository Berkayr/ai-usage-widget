import {providerIndex} from './themes/shared/identity.js';
import {escapeHtml as esc} from './themes/dot-matrix/render.js';

export const historyDefaults = {historyEnabled:true, historyMode:'card', historyCost:true, historyModels:true, historyHeatmap:true, historyMachines:false, historyPanelOpen:false, historyPanelLayout:'stacked'};
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
    const entry = entries.get(key);
    // Account history can omit delayed server buckets; local logs cover every day.
    return {date:key, tokens:history?.scope === 'account' ? null : 0, ...entry};
  });
}
const sum = rows => rows.reduce((total,row)=>total + number(row.tokens),0);
const partial = rows => rows.some(row=>row.tokens == null || row.partial);
const totalLabel = rows => `${formatTokens(sum(rows))}${partial(rows) ? ' · partial' : ''}`;

export function aggregateHistory(providers, days = 30, now = new Date()) {
  const tools = providers.filter(hasHistory);
  const series = tools.map(p=>dailySeries(p.history,days,now));
  const combined={scope:'all', tools, daily:dailySeries({scope:'local'},days,now).map((row,i)=>({
    ...row, tokens:series.reduce((n,rows)=>n+number(rows[i].tokens),0),
    partial:series.some(rows=>rows[i].tokens == null),
    by_provider:Object.fromEntries(tools.map((p,j)=>[p.id,number(series[j][i].tokens)]))
  }))};
  if (tools.some(p=>Array.isArray(p.history.today_hourly))) {
    combined.today_hourly=Array.from({length:24},(_,hour)=>tools.reduce((total,p)=>
      total+(Array.isArray(p.history.today_hourly) ? number(p.history.today_hourly[hour]) : 0),0));
  }
  return combined;
}

export function hourlyBars(history, now = new Date()) {
  if (!Array.isArray(history.today_hourly)) return '<p class="history-note">Hourly data unavailable</p>';
  const rows=history.today_hourly.slice(0,now.getHours()+1), max=Math.max(1,...rows.map(number));
  return `<div class="history-bars" role="img" aria-label="Today by local hour">${rows.map((v,h)=>`<div class="history-bar" title="${String(h).padStart(2,'0')}:00 · ${formatTokens(v)}" style="height:${100*number(v)/max}%"><i style="flex:1;background:var(--provider-identity,var(--accent))"></i></div>`).join('')}</div><div class="history-axis"><span>00:00</span><span>${String(now.getHours()).padStart(2,'0')}:00</span></div>`;
}
export function allHourlyBars(history, now = new Date()) {
  const tools=history.tools.filter(p=>Array.isArray(p.history.today_hourly));
  const hours=Array.from({length:now.getHours()+1},(_,hour)=>tools.map(p=>number(p.history.today_hourly[hour])));
  const max=Math.max(1,...hours.map(values=>values.reduce((a,b)=>a+b,0)));
  return `<div class="history-bars" role="img" aria-label="Today by local hour">${hours.map((values,hour)=>{
    const total=values.reduce((a,b)=>a+b,0);
    return `<div class="history-bar" title="${String(hour).padStart(2,'0')}:00 · ${formatTokens(total)}" style="height:${100*total/max}%">${values.map((value,i)=>`<i style="flex:${value};background:${color(providerIndex(tools[i],i))}"></i>`).join('')}</div>`;
  }).join('')}</div><div class="history-axis"><span>00:00</span><span>${String(now.getHours()).padStart(2,'0')}:00</span></div>`;
}
function combinedLine(history, now = new Date()) {
  const rows=dailySeries(history,7,now);
  return `All tools · Today ${totalLabel(rows.slice(-1))} · 7d ${totalLabel(rows)}`;
}
const color = i => `var(--provider-${i % 12}, var(--accent))`;
export function bars(history, days, machines = false, now) {
  const rows = dailySeries(history,days,now), max = Math.max(1,...rows.map(r=>number(r.tokens)));
  const tools=history.tools || [];
  const ids = tools.length ? tools.map(p=>p.id) : splitMachines(history,machines) ? history.machines.map(m=>m.id) : [];
  return `<div class="history-bars" role="img" aria-label="Daily tokens for the last ${days} days${rows.some(row=>row.tokens == null) ? '; No data: '+rows.filter(row=>row.tokens == null).map(row=>row.date).join(', ') : ''}">${rows.map(row=>{
    const values = ids.length ? ids.map(id=>number((tools.length ? row.by_provider : row.by_machine)?.[id])) : [number(row.tokens)];
    const rest = Math.max(0,number(row.tokens)-values.reduce((a,b)=>a+b,0));
    if (ids.length && rest) values.push(rest);
    return `<div class="history-bar" title="${esc(row.date)} · ${row.tokens == null ? 'No data' : formatTokens(row.tokens)+(row.partial ? ' · partial' : '')}" aria-label="${esc(row.date)} · ${row.tokens == null ? 'No data' : formatTokens(row.tokens)+(row.partial ? ' · partial' : '')}" style="height:${100*number(row.tokens)/max}%">${values.map((v,i)=>`<i style="flex:${v};background:${ids.length ? color(tools.length ? providerIndex(tools[i],i) : i) : 'var(--provider-identity, var(--accent))'}"></i>`).join('')}</div>`;
  }).join('')}</div><div class="history-axis"><span>${rows[0].date.slice(5)}</span><span>${rows.at(-1).date.slice(5)}</span></div>`;
}
function price(value, history) {
  return `<p class="history-price" title="Estimated API price equivalent, not your actual bill. Prices as of ${esc(history.prices_as_of || 'unknown')}; unpriced tokens may be excluded.">≈ ${formatMoney(value)} at API prices</p>`;
}
function details(history, settings, days, panel, now) {
  const rows = dailySeries(history,30,now);
  const today=rows.slice(-1);
  const chart=days === 1 && history.scope === 'local' ? hourlyBars(history,now) : days === 1 && history.scope === 'account' ? `<p class="history-today">${partial(today) ? 'No data yet today' : formatTokens(sum(today))+' tokens today'}</p>` : days === 1 && history.scope === 'all' && Array.isArray(history.today_hourly) ? allHourlyBars(history,now) : bars(history,days,settings.historyMachines,now);
  let html = `<div class="history-scope">${history.scope === 'all' ? 'All tools · local + account' : history.scope === 'local' ? 'Claude Code logs · LOCAL' : 'All devices · ACCOUNT'}</div><div class="history-kpis">${[['Today',today],['7d',rows.slice(-7)],['30d',rows]].map(([label,data])=>`<span>${label}<b>${history.scope === 'account' && label === 'Today' && partial(data) ? 'No data yet today' : totalLabel(data)}</b></span>`).join('')}</div>${chart}`;
  if (history.tools) html += `<div class="history-legend">${history.tools.map((p,i)=>{
    const label=esc(p.label || p.id), providerRows=dailySeries(p.history,days,now);
    const value=days===1 && history.scope==='all' && Array.isArray(history.today_hourly) && !Array.isArray(p.history.today_hourly)
      ? partial(providerRows.slice(-1)) ? 'No data yet today' : `${formatTokens(sum(providerRows.slice(-1)))} · partial`
      : totalLabel(providerRows);
    return `<span style="--series:${color(providerIndex(p,i))}">${label} · ${value}</span>`;
  }).join('')}</div>`;
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
  widget.querySelectorAll('.history-panel, .history-toggle, :scope > .history-total').forEach(el=>el.remove());
  const available = providers.filter(hasHistory);
  const enabled = settings.historyEnabled && available.length > 0;
  widget.classList.toggle('has-history-panel',Boolean(enabled && settings.historyMode === 'panel' && settings.historyPanelOpen));
  widget.classList.toggle('history-left',panelOnLeft(settings));
  if (!enabled) return false;
  const combined=available.length >= 2 ? aggregateHistory(available,30,now) : null;
  if (settings.historyMode !== 'panel') {
    if (combined && (settings.historyMode === 'under' || state.open)) {
      const line=document.createElement('div');line.innerHTML=combinedLine(combined,now);line.className='history-total';widget.insertBefore(line,root);
    }
    root.querySelectorAll('.provider-card').forEach((card,i)=>{
      const provider = providers[i]; if (!hasHistory(provider)) return;
      const section = document.createElement('section'); section.className='usage-history';
      if (settings.historyMode === 'under') {
        const rows = dailySeries(provider.history,14,now);
        section.classList.add('history-mini');
        section.innerHTML = `${bars(provider.history,14,false,now)}<div class="history-mini-label">Today ${formatTokens(sum(rows.slice(-1)))}${provider.history.scope === 'account' && partial(rows.slice(-1)) ? ' · partial' : ''} · 7d ${formatTokens(sum(rows.slice(-7)))}${provider.history.scope === 'account' && partial(rows.slice(-7)) ? ' · partial' : ''} <b>${esc(provider.history.scope.toUpperCase())}</b></div>`;
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
  const button=document.createElement('button'); button.className='history-toggle'; button.textContent=(left !== open)?'‹':'›'; button.setAttribute('aria-label',open?'Close usage history':'Open usage history'); button.setAttribute('aria-expanded',String(open)); button.onclick=()=>{saveOpen(!open);requestAnimationFrame(()=>widget.querySelector('.history-toggle')?.focus());}; widget.querySelector('#gear').before(button);
  if (!open) return false;
  const panel=document.createElement('aside'); panel.className='history-panel'; panel.setAttribute('aria-label','Usage history');
  const controls=document.createElement('div'); controls.className='history-controls';
  const stacked=settings.historyPanelLayout !== 'single';
  const select=document.createElement('select'); select.setAttribute('aria-label','History provider');
  if (combined) select.add(new Option('All tools','all'));
  available.forEach(p=>select.add(new Option(p.label || p.id,p.id)));
  const provider=available.find(p=>p.id===state.provider) || (combined ? {id:'all',history:combined} : available[0]); select.value=provider.id;
  select.onchange=()=>{state.provider=select.value;redraw();}; if (!stacked) controls.append(select);
  for(const days of [1,7,30]) {const b=document.createElement('button');b.textContent=days===1?'Today':`${days} days`;b.setAttribute('aria-pressed',String((state.days || 30)===days));b.onclick=()=>{state.days=days;redraw();};controls.append(b);}
  panel.append(controls);
  const body=document.createElement('div'); body.className='history-body';
  if (stacked) {
    const sections=[{id:'all',label:'All tools',history:combined || aggregateHistory(available,30,now)},...available];
    body.innerHTML=sections.map((p,i)=>`<section class="history-section" data-history-provider="${esc(p.id)}" style="--provider-identity:${color(providerIndex(p,Math.max(0,i-1)))}"><h2>${esc(p.label || p.id)}</h2>${details(p.history,settings,state.days || 30,true,now)}</section>`).join('');
  } else body.innerHTML=details(provider.history,settings,state.days || 30,true,now);
  panel.append(body); widget.append(panel);
  return true;
}
