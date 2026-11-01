// Dependency-free documentation capture. Never starts Tauri or quotacore.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'docs/screenshots');
const snapshot = JSON.parse(await readFile(resolve(root, 'docs/tools/fixtures/quotas.json'), 'utf8'));
if (typeof WebSocket === 'undefined') throw new Error('Use Node with built-in WebSocket (Node 22+ recommended).');
await mkdir(output, { recursive: true });
async function run(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code) throw new Error(`${command} exited ${code}`);
}
await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], resolve(root, 'app'));
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frame = (label, width=340, height=590, settings={}, options={}) => {
  const config = { snapshot, settings: { appearance: 'dark', fitHeight: true, ...settings }, ...options };
  return `<div class="specimen"><iframe title="${escape(label)}" width="${width}" height="${height}" src="/?sample&docs=${encodeURIComponent(JSON.stringify(config))}"></iframe><p>${escape(label)}</p></div>`;
};
const heading = (eyebrow,title,sub='') => `<header><small>${eyebrow}</small><h1>${title}</h1><p>${sub}</p></header>`;
const shell = (body,light=false) => `<!doctype html><html lang="en"><meta charset="utf-8"><title>AI Quota Widget • fictional demo</title><style>
@font-face{font-family:Mono;src:url('/assets-docs/mono.woff2')}*{box-sizing:border-box}html{min-height:100%}body{min-height:100vh;margin:0;padding:48px;color:${light?'#1b1b1b':'#f4f4f6'};background:${light?'radial-gradient(ellipse at top right,#cadbdc,transparent 65%),#eceae4':'radial-gradient(ellipse at top right,#263a4c,transparent 65%),#10141c'};font-family:Mono,monospace}header{margin-bottom:32px}small{font-size:12px;letter-spacing:3px;color:${light?'#80501d':'#ff9e65'}}h1{font-size:34px;letter-spacing:-1px;margin:12px 0}p{color:${light?'#53585f':'#a9b5c5'};line-height:1.7;font-size:13px}iframe{display:block;border:0;background:transparent;filter:drop-shadow(0 18px 18px #0003)}.row{display:flex;align-items:flex-start;justify-content:center;gap:24px}.specimen{flex:none}.specimen>p{text-align:center;margin:16px 0}.hero{display:flex;align-items:center;justify-content:space-around;gap:60px}.copy{max-width:420px}.copy h1{font-size:48px;line-height:1.15}.logo{width:88px;height:88px}.pill{display:inline-block;margin-top:20px;padding:9px 14px;border:1px solid #8994a744;border-radius:30px;font-size:12px}.bar{height:60px;border-radius:12px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:${light?'#f3f3f3e8':'#202020ed'};box-shadow:0 16px 40px #0003;font-family:Arial,sans-serif;color:${light?'#1b1b1b':'#f4f4f6'}}.strip{font-size:12px;line-height:1.6;display:flex;gap:24px}.warn{color:${light?'#855500':'#ff9e1b'}}.danger{color:${light?'#b91c1c':'#ff2a2a'}}.track{width:60px;height:3px;background:${light?'#0000001f':'#ffffff1f'};margin-top:4px}.track i{display:block;height:3px;background:currentColor}.panel-area{margin-top:80px}.note{font-size:11px;margin-top:24px}
</style>${body}</html>`;
const scenes = new Map();
for (const light of [false,true]) {
 const mode=light?'light':'dark';
 scenes.set(`hero-${mode}`,{w:1000,h:820,html:shell(`<div class="hero"><div class="copy"><img class="logo" src="/assets-docs/logo${light?'-light':''}.svg"><small> YOUR LIMITS. IN SIGHT.</small><h1>Keep your next<br>session in view.</h1><p>Claude Code · Codex · Gemini<br>Usage windows and reset countdowns,<br>right on your desktop.</p><span class="pill">Windows + Linux</span><p class="note">Fictional quota data</p></div>${frame('Dot Matrix · M',340,620,{appearance:mode})}</div>`,light)});
 scenes.set(`settings-${mode}`,{w:900,h:1180,html:shell(heading('MAKE IT YOURS','A place on your desktop','Color, transparency, scale and placement — in one panel.')+`<div class="row">${frame('Your widget',340,860,{appearance:mode,fitHeight:false})}${frame('Display settings · scroll for more',340,860,{appearance:mode,fitHeight:false},{openSettings:true})}</div>`,light)});
 scenes.set(`taskbar-${mode}`,{w:1100,h:380,html:shell(heading('WINDOWS 11','Small footprint. Always in sight.','Taskbar strip · transparent style · two provider rows')+`<div class="panel-area"><div class="bar"><span>▦ &nbsp; ⌕ &nbsp; ▣ &nbsp; ▤</span><div class="strip"><div>Claude &nbsp;34% <span style="color:${light?'#626262':'#b0b0ba'}">· 2h 40m</span><br>Codex &nbsp; 8% <span style="color:${light?'#626262':'#b0b0ba'}">· 3h 28m</span></div><div>⌁ &nbsp; ◖)) &nbsp; ▰</div><div>12:00<br>01 Nov</div></div></div></div>`,light)});
}
scenes.set('sizes',{w:1550,h:1020,html:shell(heading('RESPONSIVE BY DESIGN','From a glance to the full picture','Resize the window; the layout follows. XS / S / M / L are gallery labels.')+`<div class="row">${frame('XS · 205 px',205,100)}${frame('S · 280 px',280,230)}${frame('M · 340 px',340,650)}${frame('L · 520 px',520,700)}</div>`)});
scenes.set('palettes',{w:1530,h:960,html:shell(heading('FOUR PALETTES','Find your signal','Every palette supports both light and dark appearance.')+`<div class="row">${[['Signal Orange','signal-orange','dark'],['Sakura Pink','sakura-pink','light'],['Nord','nord','dark'],['Mono Paper','mono-paper','light']].map(([name,palette,appearance])=>frame(name,340,650,{palette,appearance})).join('')}</div>`)});
scenes.set('scale',{w:1280,h:1320,html:shell(heading('SCALE INDEPENDENTLY','A comfortable reading distance','75% / 100% / 150% · same layout, different physical size')+`<div class="row">${frame('75%',255,485,{scale:75})}${frame('100%',340,650)}${frame('150%',510,975,{scale:150})}</div>`)});
// NO_SUBSCRIPTION is intentionally hidden by the real renderer; explain that state outside it.
const states = structuredClone(snapshot);
states.providers.forEach((p,i)=>{p.state=['STALE','AUTH_REQUIRED','RATE_LIMITED'][i];p.stale=i===0;if(i===1)p.windows=[];});
scenes.set('states',{w:1050,h:860,html:shell(heading('HONEST STATUS','Know when the data needs attention','Cached values stay marked; unavailable values never become zero.')+`<div class="row">${frame('Visible provider states',340,580,{}, {snapshot:states})}<div class="copy"><h1 style="font-size:24px">No subscription?</h1><span class="pill">NO_SUBSCRIPTION</span><p>The widget hides providers without an active subscription. This explanatory badge represents that state; it is not an extra widget card.</p><p>STALE = cached data<br>AUTH_REQUIRED = sign in through the provider<br>RATE_LIMITED = wait before refreshing</p></div></div>`)});
scenes.set('kde-panel',{w:1100,h:370,html:shell(heading('KDE PLASMA 6','Part of your panel','Breeze light · compact session view · mini bars')+`<div class="panel-area"><div class="bar" style="height:44px;background:#eff0f1;color:#232629;border:1px solid #bdc3c7"><span>◉ &nbsp; ▣ &nbsp; ▤</span><div class="strip"><span>CL <b>34%</b><div class="track"><i style="width:34%"></i></div></span><span>CX <b style="color:#8a6300">77%</b><div class="track" style="color:#8a6300"><i style="width:77%"></i></div></span><span>GM <b style="color:#b42323">86%</b><div class="track" style="color:#b42323"><i style="width:86%"></i></div></span><span style="color:#232629">⌁ &nbsp; 12:00</span></div></div></div>`,true)});
scenes.set('waybar',{w:1100,h:360,html:shell(heading('HYPRLAND / SWAY','Your bar, your workflow','Waybar · shared snapshot · session usage')+`<div class="panel-area"><div class="bar" style="height:32px;font-family:Mono;background:#20242d"><span>1 &nbsp; 2 &nbsp; 3 &nbsp; 4</span><span style="font-size:12px">CL 34% · 2h40 | CX 8% · 3h28 | GM 12% · 2h50 &nbsp; │ &nbsp; 12:00</span></div></div>`)});
scenes.set('social-preview',{w:1280,h:640,dpr:1,html:shell(`<div class="hero"><div class="copy" style="max-width:650px"><img class="logo" src="/assets-docs/logo.svg"><small> WINDOWS + LINUX</small><h1>AI Quota Widget</h1><p style="font-size:20px">Your AI quotas, right on your desktop.</p><span class="pill">Claude Code · Codex · Gemini</span></div>${frame('Fictional quota data',280,500,{scale:75})}</div>`)});
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
 chrome=spawn(process.env.CHROME_BIN||'google-chrome-stable',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const port = await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),20000);chrome.once('error',error=>{clearTimeout(timer);reject(error)});chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});
 const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
 const errors=[];
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);const call=pending.get(message.id);if(call){clearTimeout(call.timer);pending.delete(message.id);if(message.error)call.reject(Error(message.error.message));else call.resolve(message.result);}});
 await cdp('Page.enable');await cdp('Runtime.enable');
 await cdp('Emulation.setTimezoneOverride',{timezoneId:'UTC'});await cdp('Emulation.setLocaleOverride',{locale:'en-US'});
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-01T12:00:00Z']))}static now(){return 1793534400000}}; const raw=new URLSearchParams(location.search).get('docs');if(raw)window.__QUOTA_DOCS_FIXTURE__=JSON.parse(raw);`});
 for(const [name,scene] of scenes){
  errors.length=0;
  await cdp('Emulation.setDeviceMetricsOverride',{width:scene.w,height:scene.h,deviceScaleFactor:scene.dpr||2,mobile:false});
  await cdp('Page.navigate',{url:`${base}/scene/${name}`});
  const result=await cdp('Runtime.evaluate',{expression:`(async()=>{for(let attempt=0;attempt<150;attempt++){const frames=[...document.querySelectorAll('iframe')];if(location.pathname==='/scene/${name}'&&document.readyState==='complete'&&frames.every(f=>f.contentWindow?.__QUOTA_DOCS_READY__)){await document.fonts.ready;await Promise.all(frames.map(f=>f.contentDocument.fonts.ready));for(const f of frames){if(f.contentDocument.documentElement.classList.contains('fit-height')) f.height=Math.ceil(f.contentDocument.querySelector('#widget').getBoundingClientRect().height);}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return frames.map(f=>({cards:f.contentDocument.querySelectorAll('.provider-card').length,body:f.contentDocument.body.scrollHeight}));}await new Promise(r=>setTimeout(r,100));}throw Error('Frame readiness timed out');})()`,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails||errors.length)throw Error(`${name}: ${JSON.stringify(result.exceptionDetails||errors)}`);
  if(result.result.value.some(frame=>frame.cards!==3))throw Error(`${name}: missing provider cards`);
  const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const png=Buffer.from(capture.data,'base64');
  if(name==='social-preview'&&png.length>=1000000)throw Error('Social preview exceeds 1 MB');
  await writeFile(resolve(output,`${name}.png`),png);
  console.log(`${name}.png (${scene.w*(scene.dpr||2)} × ${scene.h*(scene.dpr||2)})`);
 }
} finally {
 if(ws)ws.close();for(const call of pending.values())clearTimeout(call.timer);
 if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([once(chrome,'exit'),new Promise(r=>setTimeout(r,3000))]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
