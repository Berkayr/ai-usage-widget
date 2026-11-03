import { layoutControls } from './settings-layout.js';
import { quotePrivacy } from './quote.js';
import { providerIds, providerColors, providerColorWarnings } from './themes/shared/identity.js';
import { normalizeSize, sizePresets, widgetWidth, widgetHeight, shapes } from './sizing.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { themes } from './themes/registry.js';
import { settingsMarkup } from './settings-markup.js';
import { mountProviders } from './themes/shared/providers.js';
import './settings.css';
import { rgba, contrast, luminance } from './text-contrast.js';

const sample = new URLSearchParams(location.search).has('sample') || !window.__TAURI_INTERNALS__;
const $ = selector => document.querySelector(selector);
function normalizePlacement(value) {const result={...value,xRatio:value.x_ratio??value.xRatio??1,yRatio:value.y_ratio??value.yRatio??0};delete result.x_ratio;delete result.y_ratio;return result;}
const defaults = { featuredProvider:'auto', featuredPosition:'bottom', reactorMotion:false, quoteEnabled:false, quoteMode:'qotd', quoteNavigation:true, theme:'system', shape:'portrait', appearance:'auto', colorMode:'calm', dotCount:20, matchPhysicalSize:false, accentEdge:'off', palette:'default', accent:null, background:null, widgetOpacity:100, backgroundOpacity:100, scale:100, fitHeight:true, position:'Top right', placementEditing:false, lockPosition:true, showExtraWindows:false, taskbar:{enabled:false,providers:['claude','codex','gemini'],window:'session',showBars:false,style:'transparent',theme:'auto'}, linux:{layer:'bottom',margin:12,monitor:null}, placement:{monitor:null,xRatio:1,yRatio:0,snap:'off',disconnected:'primary',fallbackMonitor:null} };
let draft = structuredClone(defaults), saved, providers, savedProviders, autostart=false, savedAutostart=false, closing=false, saving=false, positionBefore=null;
const abort = new AbortController(), stops = [];
let disposed=false, previewRunning=false, previewPending=null;
function error(message) { $('#status').textContent=String(message); }
let previewWork = Promise.resolve();
function preview() {
  // One worker drains the latest value; closing/reverting waits for the drain.
  previewPending={...structuredClone(draft),providerPreview:structuredClone(providers ?? [])};
  if (previewRunning) return previewWork;
  previewRunning=true;
  previewWork=(async()=> {
    try { while(previewPending && !disposed) { const value=previewPending; previewPending=null; if(!sample) await invoke('preview_settings',{settings:value}); } }
    catch(e) { error(e); throw e; } finally { previewRunning=false; }
  })();
  return previewWork;
}

function changed() { return saved && (JSON.stringify(draft)!==JSON.stringify(saved) || JSON.stringify(providers)!==JSON.stringify(savedProviders) || autostart!==savedAutostart); }
function mark() { const dirty=changed(); $('#revert').disabled=!dirty; $('#dirty').textContent=dirty?'Unsaved changes':'All changes saved'; document.title=`AI Usage · Settings${dirty?' · Unsaved changes':''}`; if(!sample) getCurrentWindow().setTitle(document.title).catch(error); }
function update() { draft=normalizeSize(draft); renderControls(); mark(); preview().catch(()=>{}); }
const groups=[['providers','Providers'],['appearance','Appearance / Theme'],['layout','Layout & Position'],['quote','Quote'],['taskbar','Taskbar strip'],['desktop','Desktop (Linux)'],['about','About / Diagnostics']];
document.querySelector('#app').innerHTML=`<div class="settings-shell"><nav aria-label="Settings categories">${groups.map(([id,label])=>`<button data-category="${id}" aria-selected="false">${label}</button>`).join('')}</nav><main class="settings-content">${settingsMarkup}</main><div id="close-prompt" hidden role="alert"><strong>Save changes?</strong><button id="close-save">Save</button><button id="close-discard">Discard</button><button id="close-cancel">Cancel</button></div><footer class="settings-actions"><span id="dirty" role="status"></span><span id="status" role="status"></span><button id="revert">Revert</button><button class="primary" id="save">Save</button></footer></div>`;
const panel=$('#settings'); panel.inert=true;$('#save').disabled=true;$('#revert').disabled=true;panel.hidden=false; panel.querySelector('header').remove();
const sections=Object.fromEntries(groups.map(([id,label])=> {const section=document.createElement('section');section.id=`category-${id}`;section.hidden=true;const h=document.createElement('h1');h.textContent=label;section.append(h);panel.append(section);return [id,section];}));
const move=(id,category)=>{const el=$(`#${id}`);if(el) sections[category].append(el.closest('label') || el);};
sections.providers.append($('#provider-settings').closest('fieldset'));
sections.about.append($('#runtime-diagnostics').closest('fieldset'));
sections.appearance.append($('.theme-section'),$('.look-section'));
for(const id of ['appearance','palette','accent','background','widget-opacity','background-opacity'])move(id,'appearance');
for(const id of ['scale','position','fit-height','show-extra-windows'])move(id,'layout');
sections.layout.append($('.scale-presets'));
sections.quote.innerHTML += `<p class="setting-note">${quotePrivacy}</p><label class="toggle-setting">Show daily quote<input id="quote-enabled" type="checkbox"></label><label>Mode<select id="quote-mode"><option value="qotd">Quote of the day</option><option value="born">Born on this day</option><option value="died">Died on this day</option><option value="on-this-day">On this day</option><option value="mixed">Mixed</option></select></label><label class="toggle-setting">Show quote navigation<input id="quote-navigation" type="checkbox"></label>`;
const shapePicker=document.createElement('fieldset');shapePicker.className='shape-picker';shapePicker.innerHTML='<legend>Shape</legend>'+shapes.map(shape=>`<button data-shape="${shape}" aria-pressed="false"><i class="shape-silhouette ${shape}" aria-hidden="true"></i>${shape[0].toUpperCase()+shape.slice(1)}</button>`).join('');sections.layout.prepend(shapePicker);
shapePicker.querySelectorAll('button').forEach(button=>button.onclick=()=>{draft.shape=button.dataset.shape;update();});
const widgetChoices=document.createElement('fieldset');widgetChoices.id='widget-provider-choices';sections.layout.insertBefore(widgetChoices,shapePicker.nextSibling);
move('start-at-login','about');move('autostart-status','about');
sections.desktop.append($('#linux-settings'));$('#linux-settings').hidden=false;
sections.taskbar.append($('#taskbar-settings'));
for(const el of [...panel.children])if(el.tagName!=='SECTION')el.remove();
const oldPalette=$('#palette');oldPalette.closest('label').hidden=true;
const paletteGrid=document.createElement('div');paletteGrid.id='palette-grid';paletteGrid.setAttribute('aria-label','Palette');sections.appearance.append(paletteGrid);
for(const key of ['accent','background']) {const reset=document.createElement('button');reset.textContent='Reset to palette';reset.onclick=()=>{draft[key]=null;update();};$(`#${key}`).after(reset);}
sections.layout.insertAdjacentHTML('beforeend',`<label class="toggle-setting">Lock position<input id="lock-position" type="checkbox"></label><button id="place">Place widget</button><p class="setting-note">Drag the widget on the map, or drag its header on Windows / X11. Ratios use the available work area.</p><label>Monitor<select id="placement-monitor"></select></label><label>Snap<select id="snap"><option value="off">Off</option><option value="edges">Edges &amp; center</option><option value="grid">Grid (8 px)</option></select></label><div id="monitor-map" aria-label="Monitor work area"><button id="map-widget" aria-label="Widget position. Use arrow keys to move.">Widget</button></div><div id="placement-presets"></div><div id="placement-actions" hidden><button id="save-position">Save position</button><button id="cancel-position">Cancel</button></div><label>When monitor is disconnected<select id="disconnected"><option value="primary">Move to primary monitor</option><option value="monitor">Move to monitor</option><option value="hide">Hide until it returns</option></select></label><label>Fallback monitor<select id="fallback-monitor"></select></label>`);
for(const [label,x,y] of [['Top left',0,0],['Top center',.5,0],['Top right',1,0],['Bottom left',0,1],['Bottom center',.5,1],['Bottom right',1,1],['Center',.5,.5]]) {const button=document.createElement('button');button.textContent=label;button.onclick=()=>{beginPlacement();draft.position='Free';Object.assign(draft.placement,{xRatio:x,yRatio:y});mapMoved=true;update();};$('#placement-presets').append(button);}
function category(id) {for(const [key,section]of Object.entries(sections))section.hidden=key!==id;document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.category===id)));}
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>category(b.dataset.category));category('providers');
const themeSymbols={reactor:'◎ ◉ ◎',system:'━━━━','dot-matrix':'••••••','circular-rings':'◉ ◎',terminal:'[▓▓░░]','frosted-glass':'▰ ▰',brutalist:'84%','compact-strip':'━ ━ ━','retro-lcd':'▮▮▮▯▯','minimal-pace':'──┊──'};
for(const theme of themes) {const button=document.createElement('button');button.dataset.theme=theme.id;button.innerHTML='<span class="theme-preview" aria-hidden="true"></span><span></span>';button.firstChild.textContent=themeSymbols[theme.id];button.lastChild.textContent=theme.name;button.onclick=()=>{draft.theme=theme.id;draft.palette=Object.keys(theme.palettes)[0];draft.accent=null;draft.background=null;update();};$('#theme-picker').append(button);}
const colorControls=document.createElement('fieldset');colorControls.id='provider-colors';
colorControls.innerHTML='<legend>Provider colors</legend><p class="setting-note">Colors identify providers in every shape. Mono uses patterns.</p>';
for(const id of providerIds){
 const label=document.createElement('label');label.textContent=id;
 const input=document.createElement('input');input.type='color';input.dataset.providerColor=id;input.setAttribute('aria-label',id+' color');
 input.oninput=()=>{draft.providerColors={...draft.providerColors,[id]:input.value};update();};
 const reset=document.createElement('button');reset.textContent='Reset to default';reset.onclick=()=>{delete (draft.providerColors||{})[id];update();};
 label.append(input,reset);colorControls.append(label);
}
const colorWarning=document.createElement('p');colorWarning.id='provider-color-warning';colorWarning.className='setting-note';colorWarning.setAttribute('role','status');colorControls.append(colorWarning);sections.appearance.append(colorControls);
const mode=matchMedia('(prefers-color-scheme:light)');
function themePalette(t=themes.find(t=>t.id===draft.theme)||themes[0],key=draft.palette) {const p=t.palettes[key]||Object.values(t.palettes)[0];const appearance=draft.appearance==='auto'?(mode.matches?'light':'dark'):draft.appearance;return {...p,...p[appearance]};}
// Palette samples retain their hue while keeping their glyphs readable.
function previewInk(ink, paper) {
  const foreground=rgba(ink),background=rgba(paper),target=luminance(background)>.179?0:255;
  for(let step=0;step<=100;step++) {
    const value=foreground.slice(0,3).map(v=>Math.round(v+(target-v)*step/100));
    if(contrast(value,background)>=4.7)return `rgb(${value.join(',')})`;
  }
  return ink;
}
const renderLayout = layoutControls(sections.layout, () => draft, () => providers || [], update);
function renderControls() {
  renderLayout();
  document.querySelectorAll('[data-shape]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shape===draft.shape)));
  widgetChoices.hidden=!['circle','pill'].includes(draft.shape);
  widgetChoices.replaceChildren();const legend=document.createElement('legend');legend.textContent='Providers on this widget';widgetChoices.append(legend);
  const note=document.createElement('p');note.className='setting-note';note.textContent='Choose up to 3. By default the first 3 enabled providers are shown.';widgetChoices.append(note);
  const selected=Array.isArray(draft.widgetProviders)?draft.widgetProviders:providers.slice(0,3);
  for(const id of providers){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.widgetProvider=id;input.checked=selected.includes(id);input.disabled=!input.checked&&selected.length>=3;label.textContent=id;label.append(input);widgetChoices.append(label);input.onchange=()=>{draft.widgetProviders=providers.filter(key=>key===id?input.checked:selected.includes(key)).slice(0,3);update();};}
  $('#fit-height').disabled=draft.shape!=='portrait';
  for(const [id,key]of Object.entries(bindings)) {const el=$(`#${id}`);const value=get(key);if(el.type==='checkbox')el.checked=!!value;else el.value=value??'';const output=$(`#${id.replace('-opacity','')}-out`)||$(`#${id}-out`);if(output)output.value=`${value}${id==='linux-margin'?' px':'%'}`;}
  document.querySelectorAll('[data-size]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.size===draft.sizePreset));b.querySelector('small').textContent=`${Math.round(widgetWidth(draft,visibleProviderCount())*sizePresets[b.dataset.size]/100)} × ${Math.round(widgetHeight(draft,visibleProviderCount())*sizePresets[b.dataset.size]/100)} px`;});
  const p=themePalette();const paper=draft.background||p.bgWidget;const colors=providerColors(draft,paper);document.querySelectorAll('[data-provider-color]').forEach((el,i)=>el.value=colors[i]);colorWarning.textContent=providerColorWarnings(draft,paper).join('. ');$('#accent').value=draft.accent||p.accent;$('#background').value=draft.background||p.bgWidget;
  document.querySelectorAll('[data-theme]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.theme===draft.theme));const colors=themePalette(themes.find(t=>t.id===b.dataset.theme));b.querySelector('.theme-preview').style.cssText=`background:${colors.bgWidget};color:${previewInk(colors.accent,colors.bgWidget)};border-color:${colors.border}`;});
  paletteGrid.replaceChildren();const t=themes.find(t=>t.id===draft.theme)||themes[0];
  for(const [key,value]of Object.entries(t.palettes)) {const button=document.createElement('button');button.className='palette-option';button.setAttribute('aria-pressed',String(key===draft.palette));const name=document.createElement('span');name.textContent=value.name;button.append(name);const colors=themePalette(t,key);for(const color of ['accent','bgWidget','bgCard','textPrimary','severityWarning']) {const swatch=document.createElement('i');swatch.style.background=colors[color];swatch.title=`${color}: ${colors[color]}`;button.append(swatch);}button.onclick=()=>{draft.palette=key;draft.accent=null;draft.background=null;update();};paletteGrid.append(button);}
  document.querySelectorAll('[data-taskbar-provider]').forEach(el=>el.checked=draft.taskbar.providers.includes(el.dataset.taskbarProvider));
  $('#placement-actions').hidden=!positionBefore;$('#place').disabled=!!positionBefore;$('#map-widget').disabled=!positionBefore;renderMap();
}
const bindings={'quote-enabled':'quoteEnabled','quote-mode':'quoteMode','quote-navigation':'quoteNavigation','color-mode':'colorMode','dot-count':'dotCount','match-physical-size':'matchPhysicalSize','accent-edge':'accentEdge',appearance:'appearance',accent:'accent',background:'background','widget-opacity':'widgetOpacity','background-opacity':'backgroundOpacity',scale:'fineTune',position:'position','fit-height':'fitHeight','show-extra-windows':'showExtraWindows','taskbar-enabled':'taskbar.enabled','taskbar-style':'taskbar.style','taskbar-theme':'taskbar.theme','taskbar-window':'taskbar.window','taskbar-bars':'taskbar.showBars','linux-layer':'linux.layer','linux-margin':'linux.margin','linux-monitor':'linux.monitor','lock-position':'lockPosition','placement-monitor':'placement.monitor',snap:'placement.snap',disconnected:'placement.disconnected','fallback-monitor':'placement.fallbackMonitor'};
const get=path=>path.split('.').reduce((v,k)=>v?.[k],draft);
function set(path,value) {const keys=path.split('.');const key=keys.pop();let obj=draft;for(const k of keys)obj=obj[k]??={};obj[key]=value;}
for(const [id,key]of Object.entries(bindings)) {const el=$(`#${id}`);el.addEventListener(el.type==='range'||el.type==='color'?'input':'change',()=>{let value=el.type==='checkbox'?el.checked:el.type==='range'||id==='dot-count'?Number(el.value):el.value;if(id==='placement-monitor'&&value==='')value=null;if(id==='linux-monitor'&&value==='')value=null;set(key,value);update();},{signal:abort.signal});}
document.querySelectorAll('[data-taskbar-provider]').forEach(el=>el.onchange=()=>{draft.taskbar.providers=[...document.querySelectorAll('[data-taskbar-provider]:checked')].map(el=>el.dataset.taskbarProvider);update();});
document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{draft.sizePreset=b.dataset.size;draft.fineTune=100;update();});
$('#start-at-login').onchange=event=>{autostart=event.target.checked;mark();};
function renderProviders() {if(!providerConfig)return;const config=structuredClone(providerConfig);for(const [id,p]of Object.entries(config.providers))p.enabled=providers.includes(id);config.initialized=true;mountProviders($('#provider-settings'),config,async()=>{});$('#provider-settings .provider-consent-actions').hidden=true;$('#provider-settings').onchange=()=>{providers=[...$('#provider-settings').querySelectorAll('input')].flatMap((el,i)=>el.checked?[Object.keys(config.providers).filter(id=>id in config.disclosures)[i]]:[]);renderControls();mark();preview().catch(()=>{});};}
let providerConfig;let autostartAvailable=true;let desktopPlatform='linux';
let geometry={monitors:[{name:'Demo display',width:1920,height:1080,primary:true,scale:1}],widgetWidth:340,widgetHeight:600};
function visibleProviderCount(){return Math.max(1,(providers || []).filter(id=>!(draft.hiddenProviders || []).includes(id)).length);}
function selectedMonitor(){return geometry.monitors.find(m=>m.name===draft.placement.monitor)||geometry.monitors.find(m=>m.primary)||geometry.monitors[0];}
function renderMap(){const monitor=selectedMonitor();if(monitor){const dpi=monitor.scale||1;const factor=draft.scale/100*(desktopPlatform==='windows'?dpi:1)/(draft.matchPhysicalSize?dpi:1);geometry.widgetWidth=Math.min(monitor.width,widgetWidth(draft,visibleProviderCount())*factor);if(draft.shape!=='portrait'||draft.fitHeight)geometry.widgetHeight=Math.min(monitor.height,widgetHeight(draft,visibleProviderCount())*factor);}if(!monitor){$('#monitor-map').hidden=true;return;}$('#monitor-map').hidden=false;const map=$('#monitor-map');map.style.aspectRatio=`${monitor.width}/${monitor.height}`;map.style.maxWidth=`${260*monitor.width/monitor.height}px`;const width=Math.min(1,geometry.widgetWidth/monitor.width),height=Math.min(1,geometry.widgetHeight/monitor.height);$('#map-widget').style.cssText=`width:${width*100}%;height:${height*100}%;left:${draft.placement.xRatio*(1-width)*100}%;top:${draft.placement.yRatio*(1-height)*100}%`;}
function beginPlacement(){if(!positionBefore){positionBefore=structuredClone({placement:draft.placement,position:draft.position,lockPosition:draft.lockPosition});if(draft.position!=='Free'){draft.placement.xRatio=draft.position.endsWith('left')?0:1;draft.placement.yRatio=draft.position.startsWith('Top')?0:1;}draft.placementEditing=true;draft.lockPosition=false;mapMoved=false;}if(!draft.placement.monitor)draft.placement.monitor=selectedMonitor()?.name??null;}
$('#place').onclick=()=>{beginPlacement();update();};
function cancelPlacement(){if(positionBefore)Object.assign(draft,structuredClone(positionBefore));positionBefore=null;draft.placementEditing=false;mapMoved=false;update();}
async function savePosition(){if(!sample && !mapMoved && !geometry.layerShell){try{draft.placement=normalizePlacement(await invoke('capture_position'));}catch(e){error(e);return;}}draft.position='Free';draft.lockPosition=true;draft.placementEditing=false;positionBefore=null;mapMoved=false;update();await save();}
$('#save-position').onclick=savePosition;$('#cancel-position').onclick=cancelPlacement;
let drag=null,mapMoved=false;
$('#map-widget').addEventListener('pointerdown',event=>{if(!positionBefore)return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();drag={x:event.clientX-rect.left,y:event.clientY-rect.top};event.currentTarget.setPointerCapture(event.pointerId);},{signal:abort.signal});
function snap(value,available){value=Math.max(0,Math.min(available,value));if(draft.placement.snap==='grid')return Math.max(0,Math.min(available,Math.round(value/8)*8));if(draft.placement.snap==='edges')for(const edge of [0,available/2,available])if(Math.abs(value-edge)<=12)return edge;return value;}
$('#map-widget').addEventListener('pointermove',event=>{if(!drag)return;const rect=$('#monitor-map').getBoundingClientRect(),monitor=selectedMonitor();const aw=Math.max(0,monitor.width-geometry.widgetWidth),ah=Math.max(0,monitor.height-geometry.widgetHeight);draft.position='Free';draft.placement.xRatio=aw?snap((event.clientX-rect.left-drag.x)/rect.width*monitor.width,aw)/aw:0;draft.placement.yRatio=ah?snap((event.clientY-rect.top-drag.y)/rect.height*monitor.height,ah)/ah:0;mapMoved=true;mark();renderMap();preview().catch(()=>{});},{signal:abort.signal});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('#map-widget').addEventListener(type,()=>drag=null,{signal:abort.signal});
$('#map-widget').onkeydown=event=>{if(!positionBefore||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const m=selectedMonitor();const key=['ArrowLeft','ArrowRight'].includes(event.key)?'xRatio':'yRatio';const available=key==='xRatio'?m.width-geometry.widgetWidth:m.height-geometry.widgetHeight;const delta=['ArrowLeft','ArrowUp'].includes(event.key)?-8:8;draft.position='Free';draft.placement[key]=Math.max(0,Math.min(1,draft.placement[key]+delta/Math.max(1,available)));mapMoved=true;update();};
async function refreshMonitors(){if(!sample)geometry=await invoke('get_placement_monitors');for(const id of ['placement-monitor','fallback-monitor','linux-monitor']){const el=$(`#${id}`),value=get(bindings[id]);el.replaceChildren(new Option('Primary / Auto',''));for(const m of geometry.monitors)el.add(new Option(m.name,m.name));if(value&&!geometry.monitors.some(m=>m.name===value))el.add(new Option(`${value} (disconnected)`,value));el.value=value??'';}renderMap();}
async function save(){
  if(saving)return false;
  if(positionBefore){error('Save or cancel placement first.');return false;}
  saving=true;$('#save').disabled=true;
  const value=structuredClone(draft),chosen=structuredClone(providers),login=autostart;
  try {
    await preview();
    if(!sample){
      if(JSON.stringify(chosen)!==JSON.stringify(savedProviders)){await invoke('configure_providers',{providers:chosen});savedProviders=structuredClone(chosen);invoke('refresh_now').catch(error);}
      if(login!==savedAutostart){await invoke('set_autostart',{enabled:login});savedAutostart=login;}
      await invoke('save_settings',{settings:value});
    }
    saved=value;savedProviders=chosen;savedAutostart=login;
    await preview();$('#close-prompt').hidden=true;error('');mark();return true;
  }catch(e){error(`Unable to save: ${e}`);mark();return false;}
  finally{saving=false;$('#save').disabled=false;}
}

$('#save').onclick=save;$('#revert').onclick=()=>{draft=structuredClone(saved);providers=structuredClone(savedProviders);autostart=savedAutostart;$('#start-at-login').checked=autostart;positionBefore=null;renderProviders();update();};
async function close(){
  if(closing)return;
  closing=true;
  try {await previewWork;if(!sample)await invoke('finish_settings');else window.close();}
  catch(e){error(e);}
  finally{closing=false;}
}
$('#close-save').onclick=async()=>{if(await save())await close();};$('#close-discard').onclick=async()=>{draft=structuredClone(saved);providers=structuredClone(savedProviders);await preview();await close();};$('#close-cancel').onclick=()=>$('#close-prompt').hidden=true;
window.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();save();}if(event.key==='Escape')$('#close-prompt').hidden=true;},{signal:abort.signal});
mode.addEventListener('change',renderControls,{signal:abort.signal});
window.addEventListener('pagehide',()=>{disposed=true;abort.abort();stops.splice(0).forEach(stop=>stop());},{once:true});
async function subscription(promise){const stop=await promise;if(disposed)stop();else stops.push(stop);}
async function loadSession(){
  panel.inert=true;$('#save').disabled=true;$('#revert').disabled=true;$('#close-prompt').hidden=true;
  positionBefore=null;mapMoved=false;drag=null;previewPending=null;error('');
  await previewWork;
  draft={...defaults,...(sample?{}:await invoke('load_settings'))};draft.providerPreview=null;draft.placement=normalizePlacement(draft.placement||{});for(const key of ['taskbar','linux','placement'])draft[key]={...defaults[key],...draft[key]};if(!themes.some(t=>t.id===draft.theme))draft.theme='system';const manifest=themes.find(t=>t.id===draft.theme);if(!manifest.palettes[draft.palette])draft.palette=Object.keys(manifest.palettes)[0];
  draft=normalizeSize(draft);
  saved=structuredClone(draft);
  if(!sample){
    try {providerConfig=await invoke('get_provider_config');} catch(e){providerConfig={initialized:true,providers:{},disclosures:{},detected:{}};error(`Provider settings unavailable: ${e}`);}
    try {autostart=await invoke('get_autostart');} catch(e){autostartAvailable=false;$('#autostart-status').hidden=false;$('#autostart-status').textContent=String(e);}
    try {const desktop=await invoke('get_desktop_info');desktopPlatform=desktop.platform;$('#desktop-layer').hidden=!desktop.layerShell;$('#desktop-layer-unavailable').hidden=desktop.layerShell;sections.desktop.querySelector('#linux-settings').hidden=desktop.platform!=='linux';sections.taskbar.querySelector('#taskbar-settings').hidden=desktop.platform!=='windows';}catch(e){error(e);}
  }
  else providerConfig={initialized:true,providers:{claude:{enabled:true},codex:{enabled:true},gemini:{enabled:false}},disclosures:{claude:'Read local quota metadata.',codex:'Read local quota metadata.',gemini:'Read local quota metadata.'},detected:{}};
  providers=Object.entries(providerConfig.providers).filter(([,p])=>p.enabled&&providerConfig.initialized).map(([id])=>id);savedProviders=structuredClone(providers);savedAutostart=autostart;$('#start-at-login').checked=autostart;$('#start-at-login').disabled=!autostartAvailable;
  renderProviders();try{await refreshMonitors();}catch(e){geometry.monitors=[];error(e);}renderControls();mark();panel.inert=false;$('#save').disabled=false;
}
try {
  await loadSession();
  if(!sample){await subscription(getCurrentWindow().onCloseRequested(event=>{event.preventDefault();if(closing||panel.inert)return;if(changed()){$('#close-prompt').hidden=false;$('#close-save').focus();}else close();}));await subscription(listen('settings-reopened',()=>loadSession().catch(error)));await subscription(listen('monitors-changed',()=>refreshMonitors().catch(error)));await subscription(listen('placement-action',event=>event.payload==='save'?savePosition():cancelPlacement()));invoke('get_runtime_diagnostics').then(value=>{$('#runtime-diagnostics').textContent=`Python ${value.paths.python_version} (${value.paths.runtime_source})`;}).catch(error);}
}catch(e){error(e);}
window.__SETTINGS_READY__=true;
