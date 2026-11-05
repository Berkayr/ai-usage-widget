// Dependency-free documentation capture. Never starts Tauri or quotacore.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { sizePresets } from '../../app/src/sizing.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'docs/screenshots');
const snapshot = JSON.parse(await readFile(resolve(root, 'docs/tools/fixtures/quotas.json'), 'utf8'));
if (typeof WebSocket === 'undefined') throw new Error('Use Node with built-in WebSocket (Node 22+ recommended).');
await mkdir(resolve(output, 'themes'), { recursive: true });
await mkdir(resolve(output, 'checks'), { recursive: true });
async function run(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code) throw new Error(`${command} exited ${code}`);
}
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], resolve(root, 'app'));
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frame = (label, width=340, height=590, settings={}, options={}) => {
  const config = { snapshot, settings: { appearance: 'dark', colorMode: 'calm', accentEdge: 'off', fitHeight: true, ...settings }, ...options };
  return `<div class="specimen"><iframe title="${escape(label)}" width="${width}" height="${height}" src="/?sample&docs=${encodeURIComponent(JSON.stringify(config))}"></iframe><p>${escape(label)}</p></div>`;
};
const heading = (eyebrow,title,sub='') => `<header><small>${eyebrow}</small><h1>${title}</h1><p>${sub}</p></header>`;
const shell = (body,light=false) => `<!doctype html><html lang="en"><meta charset="utf-8"><title>AI Usage • fictional demo</title><style>
@font-face{font-family:Mono;src:url('/assets-docs/mono.woff2')}*{box-sizing:border-box}html{min-height:100%}body{min-height:100vh;margin:0;padding:48px;color:${light?'#1b1b1b':'#f4f4f6'};background:${light?'radial-gradient(ellipse at top right,#cadbdc,transparent 65%),#eceae4':'radial-gradient(ellipse at top right,#263a4c,transparent 65%),#10141c'};font-family:Mono,monospace}header{margin-bottom:32px}small{font-size:12px;letter-spacing:3px;color:${light?'#80501d':'#ff9e65'}}h1{font-size:34px;letter-spacing:-1px;margin:12px 0}p{color:${light?'#53585f':'#a9b5c5'};line-height:1.7;font-size:13px}iframe{display:block;border:0;background:transparent;filter:drop-shadow(0 18px 18px #0003)}.row{display:flex;align-items:flex-start;justify-content:center;gap:24px}.specimen{flex:none}.specimen>p{text-align:center;margin:16px 0}.hero{display:flex;align-items:center;justify-content:space-around;gap:60px}.copy{max-width:420px}.copy h1{font-size:48px;line-height:1.15}.logo{width:88px;height:88px}.pill{display:inline-block;margin-top:20px;padding:9px 14px;border:1px solid #8994a744;border-radius:30px;font-size:12px}.bar{height:60px;border-radius:12px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:${light?'#f3f3f3e8':'#202020ed'};box-shadow:0 16px 40px #0003;font-family:Arial,sans-serif;color:${light?'#1b1b1b':'#f4f4f6'}}.strip{font-size:12px;line-height:1.6;display:flex;gap:24px}.warn{color:${light?'#855500':'#ff9e1b'}}.danger{color:${light?'#b91c1c':'#ff2a2a'}}.track{width:60px;height:3px;background:${light?'#0000001f':'#ffffff1f'};margin-top:4px}.track i{display:block;height:3px;background:currentColor}.panel-area{margin-top:80px}.note{font-size:11px;margin-top:24px}
</style>${/MONO|DOT STANDARD/.test(body) ? '<style>body{background:#101010;color:#eeeeee}body p{color:#aaaaaa}header small{color:#aaa}</style>' : ''}${body}</html>`;
const scenes = new Map();
for (const light of [false,true]) {
 const mode=light?'light':'dark';
 scenes.set(`taskbar-${mode}`,{w:1100,h:380,html:shell(heading('WINDOWS 11','Small footprint. Always in sight.','Taskbar strip · transparent style · two provider rows')+`<div class="panel-area"><div class="bar"><span>▦ &nbsp; ⌕ &nbsp; ▣ &nbsp; ▤</span><div class="strip"><div>Claude &nbsp;34% <span style="color:${light?'#626262':'#b0b0ba'}">· 2h 40m</span><br>Codex &nbsp; 8% <span style="color:${light?'#626262':'#b0b0ba'}">· 3h 28m</span></div><div>⌁ &nbsp; ◖)) &nbsp; ▰</div><div>12:00<br>01 Nov</div></div></div></div>`,light)});
}
// Synthetic provider failures; NO_SUBSCRIPTION stays hidden by the real renderer.
const states = structuredClone(snapshot);
states.providers.forEach((p,i)=>{p.state=['STALE','AUTH_REQUIRED','RATE_LIMITED'][i];p.stale=i===0;if(i===1)p.windows=[];});
scenes.set('kde-panel',{w:1100,h:370,html:shell(heading('KDE PLASMA 6','Part of your panel','Breeze light · compact session view · mini bars')+`<div class="panel-area"><div class="bar" style="height:44px;background:#eff0f1;color:#232629;border:1px solid #bdc3c7"><span>◉ &nbsp; ▣ &nbsp; ▤</span><div class="strip"><span>CL <b>34%</b><div class="track"><i style="width:34%"></i></div></span><span>CX <b style="color:#8a6300">77%</b><div class="track" style="color:#8a6300"><i style="width:77%"></i></div></span><span>GM <b style="color:#b42323">86%</b><div class="track" style="color:#b42323"><i style="width:86%"></i></div></span><span style="color:#232629">⌁ &nbsp; 12:00</span></div></div></div>`,true)});
scenes.set('waybar',{w:1100,h:360,html:shell(heading('HYPRLAND / SWAY','Your bar, your workflow','Waybar · shared snapshot · session usage')+`<div class="panel-area"><div class="bar" style="height:32px;font-family:Mono;background:#20242d"><span>1 &nbsp; 2 &nbsp; 3 &nbsp; 4</span><span style="font-size:12px">CL 34% · 2h40 | CX 8% · 3h28 | GM 12% · 2h50 &nbsp; │ &nbsp; 12:00</span></div></div>`)});
const themeIds = ['system', 'dot-matrix', 'circular-rings', 'terminal', 'frosted-glass', 'brutalist', 'compact-strip', 'retro-lcd', 'minimal-pace', 'reactor'];
const names = ['System', 'Dot Matrix', 'Circular Rings', 'Terminal', 'Frosted Glass', 'Brutalist', 'Compact Strip', 'Retro LCD', 'Minimal Pace', 'Reactor'];
const oneProvider = { ...snapshot, providers: snapshot.providers.slice(0,1) };
for (const appearance of ['dark','light']) {
 const light = appearance === 'light';

 scenes.set(light ? 'themes-light' : 'themes', {w:1950,h:2400,autoHeight:true,html:shell(heading('TEN THEMES', 'Find your own rhythm', 'Medium · three fictional providers · equal vertical boxes. Compact Strip keeps its horizontal contract.') + `<div style="display:grid;grid-template-columns:repeat(5,340px);gap:32px;align-items:start">${themeIds.map((id,i)=>(id==='compact-strip'?'<div style="grid-column:1 / -1;grid-row:3">':'')+frame(names[i]+' · '+((i+(light?1:0))%2?'Light':'Dark'),id==='compact-strip'?960:340,1250,{theme:id,sizePreset:'Medium',fineTune:100,appearance:(i+(light?1:0))%2?'light':'dark',colorMode:'vivid',...(id==='dot-matrix'?{palette:'sakura-pink'}:{})})+(id==='compact-strip'?'</div>':'')).join('')}</div>`,light)});
 for (const [i,id] of themeIds.entries()) {
  scenes.set(`themes/${id}-${appearance}`, {w:id==='compact-strip'?1056:436,h:1450,autoHeight:true,html:shell(frame(names[i],id==='compact-strip'?960:340,1250,{theme:id,appearance}),light)});
  scenes.set(`checks/${id}-${appearance}`, {w:1260,h:1500,autoHeight:true,html:shell(heading('RESPONSIVE CHECK', `${names[i]} / ${appearance}`, 'Calm / 340 px and 200 px / 100% and 150%') + `<div class="row" style="gap:12px">${[340,200].map(width=>[100,150].map(scale=>frame(`${width}px / ${scale}%`,width,2400,{theme:id,appearance,scale})).join('')).join('')}</div>`,light)});
 }
}

const ember = {theme:'dot-matrix',palette:'ember',appearance:'dark',colorMode:'vivid'};
for(const mode of ['dark','light']) scenes.set(`hero-${mode}`, {w:1100,h:1100,autoHeight:true,html:shell(`<style>body{background:radial-gradient(ellipse at 70% 30%,#ff5a1f18,transparent 60%),#151619}.hero{gap:50px}.copy{max-width:410px}</style><div class="hero"><div class="copy"><img class="logo" src="/assets-docs/logo.svg" alt="AI Usage logo"><small> YOUR LIMITS. IN SIGHT.</small><h1>AI Usage</h1><p>Claude Code · Codex · Gemini<br>Usage windows. Reset countdowns.<br>Right on your desktop.</p><span class="pill">Windows + Linux · 10 themes</span></div>${frame('Dot Matrix · Ember · Vivid',380,1250,ember)}</div>`)});
scenes.set('social-preview',{w:1280,h:640,dpr:1,html:shell(`<style>body{background:radial-gradient(ellipse at right,#ff5a1f22,transparent 65%),#151619}</style><div class="hero"><div class="copy"><img class="logo" src="/assets-docs/logo.svg" alt="AI Usage logo"><h1>AI Usage</h1><p style="font-size:21px">Your usage limits, on your desktop.</p><span class="pill">Windows + Linux · 10 themes</span><p>Claude Code · Codex · Gemini</p></div>${frame('Dot Matrix · Ember',340,500,{...ember,scale:90},{snapshot:oneProvider})}</div>`)});
scenes.set('sizes',{w:2900,h:1600,autoHeight:true,html:shell(heading('ONE SIZE CONTRACT','Five sizes. One shape.','Small / Medium / Large / X-Large / 2X-Large · one fictional provider · 100% fine-tune')+`<div class="row">${Object.entries(sizePresets).map(([sizePreset,scale])=>frame(sizePreset,340*scale/100,326*scale/100,{theme:'system',sizePreset,fineTune:100},{snapshot:oneProvider})).join('')}</div>`,true)});
scenes.set('scale',{w:1280,h:1500,autoHeight:true,html:shell(heading('READ AT YOUR PACE','A comfortable reading distance','75% / 100% / 150% · fixed type proportions at every scale')+`<div class="row">${frame('75% · Circular Rings · Ocean',255,1400,{theme:'circular-rings',scale:75,colorMode:'vivid'})}${frame('100% · Dot Matrix · Sakura Pink',340,1400,{theme:'dot-matrix',palette:'sakura-pink',appearance:'light',colorMode:'vivid'})}${frame('150% · Minimal Pace · Emerald',510,2000,{theme:'minimal-pace',scale:150,appearance:'light',colorMode:'vivid'})}</div>`,true)});
scenes.set('palettes',{w:1530,h:1200,autoHeight:true,html:shell(heading('FIND YOUR SIGNAL','A little color goes a long way','Vivid palettes, from soft pink to cool blue.')+`<div class="row">${frame('Dot Matrix · Sakura Pink',340,1500,{theme:'dot-matrix',palette:'sakura-pink',appearance:'light',colorMode:'vivid'})}${frame('Dot Matrix · Nord',340,1500,{theme:'dot-matrix',palette:'nord',colorMode:'vivid'})}${frame('Frosted Glass · Acrylic',340,1500,{theme:'frosted-glass',colorMode:'vivid'})}${frame('Brutalist · Acid',340,1500,{theme:'brutalist',colorMode:'vivid'})}</div>`,true)});
scenes.set('states',{w:1000,h:1400,autoHeight:true,html:shell(heading('HONEST STATUS','Know when data needs attention','Cached data stays marked. Missing values never become zero.')+`<div class="row">${frame('Terminal · Phosphor · Cached / sign-in / rate limit',400,1400,{theme:'terminal',colorMode:'vivid'},{snapshot:states})}${frame('Retro LCD · Liquid Crystal · Same source states',400,1400,{theme:'retro-lcd',appearance:'light',colorMode:'vivid'},{snapshot:states})}</div>`)});
for(const mode of ['dark','light']) {
 const light=mode==='light',theme=light?'frosted-glass':'circular-rings';
 scenes.set(`settings-${mode}`,{w:1000,h:920,appearance:mode,html:shell(heading('MAKE IT YOURS','A place on your desktop','Settings open in a separate, resizable window.')+`<iframe title="AI Usage Settings" width="900" height="680" src="/?settings&sample"></iframe>`,light)});
}
scenes.set('system',{w:1000,h:1400,autoHeight:true,html:shell(heading('FOLLOWS YOUR DESKTOP','At home in light and dark','System fonts and quiet colors, with the System theme.')+`<div class="row">${frame('System · Desktop · Light',400,1400,{theme:'system',appearance:'light'})}${frame('System · Desktop · Dark',400,1400,{theme:'system',appearance:'dark'})}</div>`,true)});
scenes.set('checks/vivid', {w:850,h:1600,autoHeight:true,html:shell(heading('COLOR MODE','Calm / Vivid')+`<div class="row">${['calm','vivid'].map(colorMode=>frame(colorMode,340,1400,{colorMode})).join('')}</div>`)});
const edgeData = structuredClone(snapshot);
edgeData.providers[0].stale = true;
edgeData.providers[0].windows.push({id:'extra',label:'Extra window',used_percent:81,kind:'other',hidden_by_default:true,resets_at:null});
edgeData.providers[1].state = 'AUTH_REQUIRED'; edgeData.providers[1].windows = [{id:'unknown',label:'Unknown quota',used_percent:null,resets_at:null}];
edgeData.providers[2].state = 'RATE_LIMITED';
for (const id of themeIds) scenes.set(`checks/${id}-states`, {w:1000,h:1600,autoHeight:true,html:shell(heading('DATA CONTRACT',id,'Hidden extra window / visible extra window / unknown values')+`<div class="row">${[false,true].map(showExtraWindows=>frame(showExtraWindows?'Extra visible':'Extra hidden',340,1300,{theme:id,showExtraWindows},{snapshot:edgeData})).join('')}</div>`)});
const consentDisclosures = {
 claude: 'Reads ~/.claude/.credentials.json, ~/.claude.json and local observations; connects to api.anthropic.com',
 codex: 'Runs codex app-server; the installed CLI manages credentials and OpenAI connections',
 gemini: 'Reads local gemini-kota.json; explicit refresh runs agy with its own credentials and Google connections',
 copilot: 'Runs gh auth token; connects to api.github.com',
 openrouter: 'Reads OPENROUTER_API_KEY or local secrets.json; connects to openrouter.ai',
 deepseek: 'Reads DEEPSEEK_API_KEY or local secrets.json; connects to api.deepseek.com',
 jetbrains: 'Reads JetBrains quota XML under the platform config directory; no network',
};
const providerConfig = { initialized:false, disclosures:consentDisclosures,
 providers:Object.fromEntries(Object.keys(consentDisclosures).map(id=>[id,{enabled:false}])),
 detected:Object.fromEntries(Object.keys(consentDisclosures).map(id=>[id,true])) };
for(const appearance of ['dark','light']) scenes.set(`checks/providers-${appearance}`, {
 w:1552,h:1700,autoHeight:true,html:shell(heading('PRIVACY','Choose what to track','Synthetic detection; all providers off until Start')+
 [0,4,8].map(start=>`<div class="row">${themeIds.slice(start,start+4).map(id=>frame(id,340,780,{theme:id,appearance},{snapshot:{providers:[]},providerConfig})).join('')}</div>`).join(''),appearance==='light') });
const monoSnapshot = structuredClone(snapshot);
monoSnapshot.providers[0].stale = true;
monoSnapshot.providers[1].windows[1].used_percent = 86;
for (const width of [200,340,520,700]) scenes.set(`checks/dots-${width}`, {
 w:4*width+192,h:3500,autoHeight:true,html:shell(heading('DOT STANDARD',`${width} CSS px / Mono`, 'Fixed marks; XS has 10, other tiers 20. Fictional data.') + `<div style="display:grid;grid-template-columns:repeat(4,${width}px);gap:24px;align-items:start">${themeIds.map(id=>frame(id,width,1600,{theme:id,colorMode:'mono'},{snapshot:monoSnapshot})).join('')}</div>`)
});
for (const appearance of ['dark','light']) scenes.set(appearance === 'dark' ? 'mono' : 'checks/mono-light', {
 w:1570,h:3000,autoHeight:true,html:shell(heading('MONO','Nine themes. Black and white.','Hollow marks from 50%; inverse percentage from 80%; outlined status badges.') + `<div style="display:grid;grid-template-columns:repeat(4,340px);gap:32px;align-items:start">${themeIds.map(id=>frame(id,340,1600,{theme:id,appearance,colorMode:'mono'},{snapshot:monoSnapshot})).join('')}</div>`,appearance==='light')
});
const thresholds = {...snapshot,providers:[{...snapshot.providers[0],windows:[0,49,50,79,80,100,null].map((used_percent,i)=>({id:String(i),label:used_percent===null?'Unknown':`${used_percent}% boundary`,used_percent,resets_at:null}))}]};
scenes.set('checks/mono-thresholds',{w:1570,h:3000,autoHeight:true,html:shell(heading('MONO THRESHOLDS','49 / 50 / 79 / 80','Normal, hollow warning, inverse danger, unknown')+`<div style="display:grid;grid-template-columns:repeat(4,340px);gap:32px;align-items:start">${themeIds.map(id=>frame(id,340,2000,{theme:id,colorMode:'mono'},{snapshot:thresholds})).join('')}</div>`)});
// An expired reset with an old snapshot must be visibly STALE in every theme.
const agedSnapshot = structuredClone(snapshot);
agedSnapshot.generated_at = '2026-11-01T11:49:00Z';
agedSnapshot.providers.forEach(p => { p.state = 'OK'; p.stale = false; p.windows.forEach(w => { w.resets_at = '2026-11-01T11:50:00Z'; }); });
scenes.set('checks/stale-age', {w:1570,h:3000,autoHeight:true,html:shell(heading('STALE SNAPSHOT','Expired resets / eleven minutes old','Synthetic snapshot; every active card must show STALE.')+`<div style="display:grid;grid-template-columns:repeat(4,340px);gap:32px;align-items:start">${themeIds.map(id=>frame(id,340,1600,{theme:id},{snapshot:agedSnapshot})).join('')}</div>`)});
for (const appearance of ['dark','light']) scenes.set(`checks/system-matrix-${appearance}`, {
 w:1250,h:2400,autoHeight:true,appearance,html:shell(heading('SYSTEM', `${appearance} / Calm + Mono`, '200 / 340 / 520 CSS px · automatic OS appearance')+
 ['calm','mono'].map(colorMode=>`<div class="row">${[200,340,520].map(width=>frame(`${width}px / ${colorMode}`,width,1600,{theme:'system',appearance:'auto',colorMode})).join('')}</div>`).join(''),appearance==='light')
});
// The same numeral is measured in the actual responsive numeric styles.
for (const id of themeIds) scenes.set(`checks/typography-${id}`, {
 w:920,h:1200,dpr:1,html:shell(`<div class="row">${frame(id,700,1000,{theme:id},{snapshot:oneProvider})}</div>`)
});
function measureGlyphs(d) {
 const w=d.defaultView;
 const numbers=[...d.querySelectorAll('.window-top b,.ring-center strong')].filter(el=>el.getBoundingClientRect().width>0);
 return numbers.map(el=>{
  const css=w.getComputedStyle(el),probe=d.createElement('span');
  for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariantNumeric','fontFeatureSettings','fontVariationSettings','fontStretch','letterSpacing','lineHeight'])probe.style[key]=css[key];
  Object.assign(probe.style,{display:'inline-block',position:'absolute',padding:'0',border:'0',margin:'0',whiteSpace:'pre'});
  probe.textContent='8';el.append(probe);
  const box=probe.getBoundingClientRect();probe.remove();
  return {selector:el.className||el.tagName,font:css.fontFamily,size:css.fontSize,weight:css.fontWeight,width:box.width,height:box.height,ratio:box.height/box.width};
 });
}
function measure(d) {
 const w=d.defaultView;
 const visible=el=>el.getClientRects().length && w.getComputedStyle(el).visibility!=='hidden' && el.getBoundingClientRect().width>0;
 const leaves=[...d.querySelectorAll('#widget *')].filter(el=>visible(el)&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!el.closest('.segments,svg,select'));
 const minFont=Math.min(...leaves.map(el=>parseFloat(w.getComputedStyle(el).fontSize)));
 const numbers=[...d.querySelectorAll('.window-top b,.ring-center strong')].filter(visible);
 const numberFont=Math.min(...numbers.map(el=>parseFloat(w.getComputedStyle(el).fontSize)));
 const canvas=d.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=1;
 const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)};
 const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const ratios=[...d.querySelectorAll('.sync-line,.plan,.window-top>span,.reset,.pace,.footer,.balance-row,.ring-center small')].filter(el=>visible(el)&&el.textContent.trim()).map(el=>{
  const layers=[];for(let p=el;p;p=p.parentElement)layers.unshift(rgba(w.getComputedStyle(p).backgroundColor));
  // Test the translucent widget against the least favorable desktop polarity.
  let bg=d.documentElement.dataset.mode==='light'?[0,0,0]:[255,255,255];
  for(const layer of layers)bg=bg.map((v,i)=>layer[i]*layer[3]+v*(1-layer[3]));
  return {selector:el.className||el.tagName,ratio:contrast(rgba(w.getComputedStyle(el).color),bg)};
 });
 const dotCounts=[...d.querySelectorAll('.dot-bar,.segments')].filter(visible).map(el=>[...el.querySelectorAll('i')].filter(visible).length);
 const dotSizes=[...d.querySelectorAll('.dot-bar i,.segments i')].filter(visible).map(el=>el.getBoundingClientRect().width);
 return {dotCounts,dotSizes,minFont,numberFont,minContrast:Math.min(...ratios.map(r=>r.ratio)),ratios,scale:w.__AI_USAGE_DEMO__.getSettings().scale,width:w.innerWidth,zoom:w.getComputedStyle(d.querySelector('#app')).zoom};
}
const server = createServer(async (req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/scene/')) {const scene=scenes.get(url.pathname.slice(7)); if(!scene)throw Error('Unknown scene');res.setHeader('Content-Type','text/html');res.end(scene.html);return;}
  let path;
  if(url.pathname==='/assets-docs/mono.woff2')path=resolve(root,'app/src/fonts/jetbrains-mono-latin-400-normal.woff2');
  else if(url.pathname.startsWith('/assets-docs/'))path=resolve(root,'docs/assets',url.pathname.split('/').pop());
  else {path=resolve(root,'app/dist','.'+decodeURIComponent(url.pathname));if(path!==resolve(root,'app/dist')&&!path.startsWith(resolve(root,'app/dist')+'/'))throw Error('Invalid path');if(url.pathname==='/')path=resolve(root,'app/dist/index.html');}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end('Not found');}
});
const profile=await mkdtemp(resolve(tmpdir(),'quota-docs-chrome-'));
let chrome;
let ws;
const pending=new Map();let sequence=0;
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
try {
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 chrome=spawn(process.env.CHROME_BIN||'google-chrome-stable',['--headless=new',...(process.env.SCREENSHOT_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),'--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const port = await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),20000);chrome.once('error',error=>{clearTimeout(timer);reject(error)});chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});
 let target;
 for(let attempt=0;attempt<150;attempt++){
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  target=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(target)break;
  await new Promise(r=>setTimeout(r,100));
 }
 if(!target)throw Error('Browser page target timeout');
 ws=new WebSocket(target.webSocketDebuggerUrl);await once(ws,'open');
 const errors=[];
 const checks=[];
 const typography=[];
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);const call=pending.get(message.id);if(call){clearTimeout(call.timer);pending.delete(message.id);if(message.error)call.reject(Error(message.error.message));else call.resolve(message.result);}});
 await cdp('Page.enable');await cdp('Runtime.enable');
 await cdp('Emulation.setTimezoneOverride',{timezoneId:'UTC'});await cdp('Emulation.setLocaleOverride',{locale:'en-US'});
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-01T12:00:00Z']))}static now(){return 1793534400000}}; const raw=new URLSearchParams(location.search).get('docs');if(raw)window.__QUOTA_DOCS_FIXTURE__=JSON.parse(raw);`});
 for(const [name,scene] of scenes){
  if(process.env.SCENE && !name.startsWith(process.env.SCENE))continue;
  errors.length=0;
  await cdp('Emulation.setDeviceMetricsOverride',{width:scene.w,height:scene.h,deviceScaleFactor:scene.dpr||2,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scene.appearance || 'dark'}]});
  await cdp('Page.navigate',{url:`${base}/scene/${name}`});
  if(name.startsWith('settings-')) {
   await cdp('Runtime.evaluate',{expression:`(async()=>{for(let i=0;i<100;i++){if(document.querySelector('iframe')?.contentWindow.__SETTINGS_READY__)return;await new Promise(r=>setTimeout(r,50));}throw Error('Settings readiness');})()`,awaitPromise:true});
   const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(output,`${name}.png`),Buffer.from(capture.data,'base64'));console.log(`${name}.png`);continue;
  }
  const result=await cdp('Runtime.evaluate',{expression:`(async()=>{for(let attempt=0;attempt<150;attempt++){const frames=[...document.querySelectorAll('iframe')];if(location.pathname==='/scene/${name}'&&document.readyState==='complete'&&frames.every(f=>f.contentWindow?.__QUOTA_DOCS_READY__)){await document.fonts.ready;await Promise.all(frames.map(f=>f.contentDocument.fonts.ready));for(const f of frames){if(f.contentDocument.documentElement.classList.contains('fit-height')) f.height=Math.ceil(f.contentDocument.querySelector('#widget').getBoundingClientRect().height);}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return frames.map(f=>{const d=f.contentDocument;const expected=JSON.parse(new URL(f.src).searchParams.get('docs')).snapshot.providers.length;const overflow=[...d.querySelectorAll('.provider-list,.provider-card,.quota-window,.provider-heading,.windows')].filter(el=>el.scrollWidth>el.clientWidth+2 && !(d.documentElement.dataset.theme==='compact-strip' && el.classList.contains('provider-list') && f.contentWindow.getComputedStyle(el).overflowX==='auto')).map(el=>el.className);return {cards:d.querySelectorAll('.provider-card').length,expected,overflow,theme:d.documentElement.dataset.theme,styles:d.querySelectorAll('#active-theme').length,metrics:(${measure.toString()})(d)};});}await new Promise(r=>setTimeout(r,100));}throw Error('Frame readiness timed out');})()`,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails||errors.length)throw Error(`${name}: ${JSON.stringify(result.exceptionDetails||errors)}`);
  if(result.result.value.some(frame=>frame.cards!==frame.expected || frame.overflow.length || frame.styles!==1))throw Error(`${name}: layout failure ${JSON.stringify(result.result.value.map(({theme,overflow,cards,expected})=>({theme,overflow,cards,expected})))}`);
  if(name==='themes'||name==='themes-light') {
    const gallery=await cdp('Runtime.evaluate',{expression:`[...document.querySelectorAll('iframe')].map(f=>{const d=f.contentDocument,w=f.contentWindow,theme=d.documentElement.dataset.theme,r=d.querySelector('#widget').getBoundingClientRect(),strip=theme==='compact-strip';if(Math.abs(r.width-(strip?960:340))>2||Math.abs(r.height-(strip?326:746))>2||w.__AI_USAGE_DEMO__.getSettings().sizePreset!=='Medium'||d.querySelectorAll('.provider-card').length!==3)throw Error('Gallery size: '+theme);return {theme,width:r.width,height:r.height};})`,returnByValue:true});
    if(gallery.exceptionDetails)throw Error(JSON.stringify(gallery.exceptionDetails));
  }

  if(name.startsWith('checks/typography-')) {
   const rows=await cdp('Runtime.evaluate',{expression:`(async()=>{const f=document.querySelector('iframe'),d=f.contentDocument,w=f.contentWindow;const rows=[];for(const width of [200,340,520,700])for(const scale of [75,100,150]){await w.__AI_USAGE_DEMO__.setSettings({scale});f.width=width;await new Promise(r=>setTimeout(r,100));await d.fonts.ready;rows.push({theme:d.documentElement.dataset.theme,width,scale,glyphs:(${measureGlyphs.toString()})(d)});}return rows;})()`,awaitPromise:true,returnByValue:true});
   if(rows.exceptionDetails)throw Error(JSON.stringify(rows.exceptionDetails));
   const values=rows.result.value.flatMap(r=>r.glyphs.map(g=>g.ratio));
   if(!values.length || Math.max(...values)/Math.min(...values)>1.03)throw Error('Glyph ratio drift: '+name+' / '+JSON.stringify(rows.result.value));
   typography.push(...rows.result.value);
   await writeFile(resolve(output,'checks/typography.json'),JSON.stringify(typography,null,2)+'\n');
   console.log(name+': 12 width/scale combinations passed');
   continue;
  }
  if(name.startsWith('checks/system-matrix-')) {
   const systemCheck=await cdp('Runtime.evaluate',{expression:`[...document.querySelectorAll('iframe')].map(f=>{const d=f.contentDocument,w=f.contentWindow;const css=w.getComputedStyle(d.querySelector('.widget'));if(d.documentElement.dataset.mode!=='${scene.appearance}' || d.querySelectorAll('.segments,.dot-bar').length || !d.querySelectorAll('.meter').length || !css.fontFamily.includes('system-ui') || css.borderRadius!=='8px')throw Error('System geometry / OS appearance');return {mode:d.documentElement.dataset.mode,font:css.fontFamily,accent:css.getPropertyValue('--accent'),nativeAccent:w.CSS.supports('color','AccentColor'),meters:d.querySelectorAll('.meter').length};})`,returnByValue:true});
   if(systemCheck.exceptionDetails)throw Error(JSON.stringify(systemCheck.exceptionDetails));
   result.result.value.forEach((f,i)=>f.system=systemCheck.result.value[i]);
  }
  checks.push({scene:name,frames:result.result.value});
  if(name.startsWith('checks/dots-') && result.result.value.some(f=>f.theme!=='system' && (!f.metrics.dotCounts.length || f.metrics.dotCounts.some(count=>count!==(f.metrics.width<220?10:20)))))throw Error(`${name}: dot count failure ${JSON.stringify(result.result.value)}`);
  if(name.startsWith('checks/') && !name.startsWith('checks/providers-') && !name.endsWith('-states') && name!=='checks/vivid' && !name.startsWith('checks/dots-') && result.result.value.some(f=>f.metrics.minFont<11*f.metrics.scale/100-.01 || f.metrics.numberFont<15*f.metrics.scale/100-.01 || f.metrics.minContrast<4.5))throw Error(`${name}: readability failure ${JSON.stringify(result.result.value)}`);
  if(name==='checks/mono-thresholds') {
    const thresholdResult=await cdp('Runtime.evaluate',{expression:`[...document.querySelectorAll('iframe')].map(f=>{const d=f.contentDocument;const values=[...d.querySelectorAll('.quota-window .window-top b')].map(el=>el.dataset.severity);if(values.join(',')!=='normal,normal,warning,warning,danger,danger,unknown')throw Error('Thresholds: '+d.documentElement.dataset.theme);const rows=[...d.querySelectorAll('.quota-window .dot-bar,.quota-window .segments')];if(d.documentElement.dataset.theme!=='system' && (rows[1].querySelectorAll('.threshold').length || !rows[2].querySelectorAll('.threshold').length))throw Error('Hollow boundary');return d.documentElement.dataset.theme;})`,returnByValue:true});
    if(thresholdResult.exceptionDetails)throw Error(JSON.stringify(thresholdResult.exceptionDetails));
  }
  if (name === 'checks/stale-age') {
   const stale = await cdp('Runtime.evaluate',{expression:`[...document.querySelectorAll('iframe')].map(f=>{const d=f.contentDocument;const badges=[...d.querySelectorAll('.status-badge')];if(badges.length!==3||badges.some(b=>b.textContent!=='STALE'))throw Error('Old snapshot not marked STALE: '+d.documentElement.dataset.theme);return d.documentElement.dataset.theme;})`,returnByValue:true});
   if(stale.exceptionDetails)throw Error(JSON.stringify(stale.exceptionDetails));
  }
  if(scene.autoHeight){
   const bounds=await cdp('Runtime.evaluate',{expression:`Math.ceil(Math.max(...[...document.body.children].map(el=>el.getBoundingClientRect().bottom)))+48`,returnByValue:true});
   await cdp('Emulation.setDeviceMetricsOverride',{width:scene.w,height:bounds.result.value,deviceScaleFactor:scene.dpr||2,mobile:false});
   await cdp('Runtime.evaluate',{expression:'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))',awaitPromise:true});
  }
  const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const png=Buffer.from(capture.data,'base64');
  if(name==='social-preview'&&png.length>=1000000)throw Error('Social preview exceeds 1 MB');
  await writeFile(resolve(output,`${name}.png`),png);
  console.log(`${name}.png (${png.readUInt32BE(16)} × ${png.readUInt32BE(20)})`);
 }
 if(process.env.SCENE?.startsWith('settings-')) {
  console.log('Settings images captured; use settings-check.mjs for interactions.');
 } else if(process.env.SCENE?.startsWith('checks/providers-')) {
   const consentChecks=await cdp('Runtime.evaluate',{expression:`(async()=>{
     for(const f of document.querySelectorAll('iframe')) {
       const d=f.contentDocument,w=f.contentWindow;
       const inputs=[...d.querySelectorAll('#provider-onboarding input')];
       if(inputs.length!==7 || inputs.some(i=>i.checked))throw Error('Provider defaults');
       if([...d.querySelectorAll('#provider-onboarding label')].some(el=>el.scrollWidth>el.clientWidth+2))throw Error('Disclosure overflow');
       inputs[0].checked=true;d.querySelector('#provider-onboarding button').click();
       await new Promise(r=>setTimeout(r,50));
       if(w.__QUOTA_DOCS_PROVIDER_SELECTION__.join(',')!=='claude' || !d.querySelector('#provider-onboarding').hidden)throw Error('Consent save');
     }
     return 'All eight themes: seven unchecked providers, wrapped disclosures and explicit Start selection';
   })()`,awaitPromise:true,returnByValue:true});
   if(consentChecks.exceptionDetails)throw Error(JSON.stringify(consentChecks.exceptionDetails));
   await writeFile(resolve(output,'checks/provider-results.json'),JSON.stringify({checks,consent:consentChecks.result.value},null,2)+'\n');
   console.log(consentChecks.result.value);
 } else {
 // Exercise switching in the same webview; a screenshot alone cannot detect
 // cached CSS accumulating or a selector failing after repeated switches.
 const interactions = await cdp('Runtime.evaluate',{expression:`(async()=>{
 const f=document.querySelector('iframe'),w=f.contentWindow,d=f.contentDocument,api=w.__AI_USAGE_DEMO__;
 const assert=(v,message)=>{if(!v)throw Error(message);};
 for(const id of ${JSON.stringify(themeIds)}) {
  await api.setSettings({theme:id});assert(d.documentElement.dataset.theme===id && d.querySelectorAll('#active-theme').length===1,'Theme: '+id);
  assert(api.themes.find(t=>t.id===id).palettes[api.getSettings().palette],'Palette: '+id);
  for(const fitHeight of [false,true]) {await api.setSettings({fitHeight});assert(d.documentElement.classList.contains('fit-height')===fitHeight,'Fit: '+id);}
  for(const showExtraWindows of [true,false]) {await api.setSettings({showExtraWindows});if(!showExtraWindows)assert(!d.body.textContent.includes('Extra window'),'Extra window: '+id);}
  for(const appearance of ['light','dark','auto']) {await api.setSettings({appearance});if(appearance!=='auto')assert(d.documentElement.dataset.mode===appearance,'Appearance: '+id);}
  for(const scale of [50,300,100]) {await api.setSettings({scale});assert(parseFloat(d.documentElement.style.fontSize)===16*scale/100,'Scale: '+id);}
  const oldWidth=f.width;f.width=340;
  for(const dotCount of [10,20,30]) {await api.setSettings({dotCount});const rows=[...d.querySelectorAll('.dot-bar,.segments')].filter(el=>el.getBoundingClientRect().width>0);if(id!=='system')assert(rows.length&&rows.every(el=>el.querySelectorAll('i').length===dotCount),'Dots: '+id);}
  f.width=200;await api.setSettings({dotCount:20});assert([...d.querySelectorAll('.dot-bar,.segments')].filter(el=>el.getBoundingClientRect().width>0).every(el=>el.querySelectorAll('i').length===10),'XS dots: '+id);f.width=oldWidth;
 }
 for(const accentEdge of ['off','auto','left','right'])for(const position of ['Top left','Bottom right','Free']) {await api.setSettings({accentEdge,position});const expected=accentEdge==='auto'?(position.endsWith('left')?'left':position.endsWith('right')?'right':'off'):accentEdge;assert(d.documentElement.dataset.accentEdge===expected,'Accent edge');}
 for(const colorMode of ['vivid','mono','calm']) {await api.setSettings({colorMode});assert(d.documentElement.dataset.colorMode===colorMode,'Color mode');}
 return 'Theme switching, palette, appearance, fit, scale, extra windows, dots, accent edges and color modes passed; settings document checks: docs/tools/settings-check.mjs';
 })()`,awaitPromise:true,returnByValue:true});
 if(interactions.exceptionDetails)throw Error(JSON.stringify(interactions.exceptionDetails));
 await writeFile(resolve(output,`checks/${process.env.SCENE?.replaceAll('/','-') || 'results'}.json`),JSON.stringify({checks,interactions:interactions.result.value},null,2)+'\n');
 console.log(interactions.result.value);
 }
} finally {
 if(ws)ws.close();for(const call of pending.values())clearTimeout(call.timer);
 if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([once(chrome,'exit'),new Promise(r=>setTimeout(r,3000))]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
