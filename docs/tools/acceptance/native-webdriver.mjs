// CI only: real Tauri windows, real IPC and isolated fictional state. No mocks.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, mkdir, readFile, writeFile, rm, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';

assert.equal(process.env.CI, 'true', 'Native acceptance is restricted to CI');
const windows = process.platform === 'win32';
if (windows) {
  const profile = process.env.USERPROFILE;
  const credentials = ['.claude/.credentials.json','.codex/auth.json','.gemini/oauth_creds.json'];
  if (profile && credentials.some(path=>existsSync(join(profile,path)))) {
    throw Error('refusing to run: real credentials present');
  }
}
const binary = resolve(`app/src-tauri/target/debug/ai-usage${windows ? '.exe' : ''}`);
const output = resolve('native-artifacts');
await mkdir(output, {recursive:true});
const root = await mkdtemp(join(tmpdir(), 'ai-usage-native-'));
const config = join(root, 'config');
const state = join(root, 'state');
const settingsPath = join(config, 'ai-usage', 'settings.json');
const ids = ['claude','codex','gemini','copilot','openrouter','deepseek','jetbrains'];
for (const dir of ['home','config/ai-usage','state','data','cache']) await mkdir(join(root, dir), {recursive:true});
await writeFile(join(state, 'config.json'), JSON.stringify({initialized:false,providers:Object.fromEntries(ids.map(id=>[id,{enabled:false}]))}));
const snapshotFixture = await readFile('app/src/sample-snapshot.json');
async function writeSnapshotFixture() {
  const temporary = join(state, 'snapshot.fixture.tmp');
  await writeFile(temporary, snapshotFixture);
  const destination = join(state, 'snapshot.json');
  const deadline = Date.now() + 2000;
  while (true) {
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
await writeSnapshotFixture();
const env = {...process.env, HOME:join(root,'home'), ...(windows ? {} : {USERPROFILE:join(root,'home')}),
  AI_USAGE_TEST_CONFIG_HOME:config, APPDATA:config, LOCALAPPDATA:join(root,'data'), XDG_CONFIG_HOME:config,
  XDG_DATA_HOME:join(root,'data'), XDG_CACHE_HOME:join(root,'cache'),
  XDG_STATE_HOME:join(root,'state'), QUOTACORE_HOME:state,
  GDK_BACKEND:'x11', XDG_SESSION_TYPE:'x11', WAYLAND_DISPLAY:'',
  AI_USAGE_SETTINGS_TEST_POSITION:'20,20'};
// Windows WebView2 requires the real USERPROFILE for its runtime data directory.
// Do not pass provider credentials inherited from the runner to the application.
for (const key of Object.keys(env)) if (/(TOKEN|SECRET|API_KEY|PASSWORD)/i.test(key)) delete env[key];
let application = binary;
if (!windows) {
  // Scope verbose WebKit/GLib diagnostics to the application, not the driver.
  application = join(root, 'application.sh');
  const quotedBinary = "'" + binary.replaceAll("'", "'\\''") + "'";
  await writeFile(application, `#!/bin/sh\nexport WEBKIT_DEBUG=Automation G_MESSAGES_DEBUG=all\nexec ${quotedBinary} "$@"\n`, {mode:0o700});
}
const driver = spawn('tauri-driver', [], {env, stdio:['ignore','pipe','pipe']});
let log = '', session, failed = false;
const appendLog = data => { log = (log + data).slice(-65536); };
driver.stdout.on('data', appendLog);
driver.stderr.on('data', appendLog);
driver.on('error', error=>{appendLog(error.stack);});
async function request(method, path, body, timeout = 30000) {
  const response = await fetch(`http://127.0.0.1:4444${path}`, {
    method, headers:{'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(timeout)
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw Error(`${method} ${path}: ${JSON.stringify(result)}`);
  return result.value;
}
const command = (method, path, body) => request(method, `/session/${session}${path}`, body);
const execute = script => command('POST', '/execute/sync', {script, args:[]});
async function asyncScript(expression) {
  const result = await command('POST', '/execute/async', {script:`const done=arguments[arguments.length-1]; Promise.resolve().then(async()=>(${expression})).then(value=>done({value}),error=>done({error:String(error)}));`,args:[]});
  assert(!result.error, result.error);
  return result.value;
}
async function waitFor(check, message) {
  const end = Date.now()+15000;
  while(Date.now()<end) { if(await check()) return; await new Promise(r=>setTimeout(r,150)); }
  throw Error(message);
}
async function screenshot(name) {
  const png = await command('GET','/screenshot');
  await writeFile(join(output,`${name}.png`),Buffer.from(png,'base64'));
}
function checkWindowRegion(shape) {
  execFileSync('powershell.exe',['-NoProfile','-Command',`$ErrorActionPreference='Stop'; $processes=@(Get-Process -Name ai-usage); if ($processes.Count -ne 1) { throw "Expected one ai-usage process, found $($processes.Count)" }; & 'docs/tools/acceptance/check-window-region.ps1' -ProcessId $processes[0].Id -Shape '${shape}'`],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
}
async function selectWindow(query) {
  await waitFor(async()=>{
    const handles = await command('GET','/window/handles');
    for(const handle of handles) {
      await command('POST','/window',{handle});
      if(await execute(`return Boolean(${query})`)) return true;
    }
    return false;
  }, `Native WebDriver cannot reach window: ${query}. Check driver.log and screenshots; Xvfb uses X11, not layer-shell.`);
}
const click = selector => execute(`const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Unavailable control: '+${JSON.stringify(selector)});el.click();`);
async function openSettings() {
  await selectWindow("document.querySelector('#gear')");
  await click('#gear');
  await selectWindow('window.__SETTINGS_READY__');
}
async function save() {
  if(await execute("return document.querySelector('#save').disabled")) {
    assert(['clean','success'].includes(await execute("return document.querySelector('#status').dataset.state")),'Save disabled for a dirty draft');
    return JSON.parse(await readFile(settingsPath,'utf8'));
  }
  await click('#save');
  await waitFor(()=>execute("return ['success','clean'].includes(document.querySelector('#status').dataset.state) && document.querySelector('#save').disabled"),'Native Save did not complete');
  return JSON.parse(await readFile(settingsPath,'utf8'));
}
async function geometry(name) {
  await new Promise(r=>setTimeout(r,350));
  await selectWindow("document.querySelector('#gear')");
  // The window manager applies the fitted height asynchronously after a save.
  for (let tries=0;tries<30;tries++) {
    if (await execute("return document.querySelector('#widget').getBoundingClientRect().bottom<=innerHeight+1")) break;
    await new Promise(r=>setTimeout(r,100));
  }
  let native, dom;
  // X11 reports a new size only after the window manager has applied it.
  for (let tries=0;tries<30;tries++) {
  native = await asyncScript(`(async()=>{
    const invoke=window.__TAURI_INTERNALS__.invoke;
    const size=await invoke('plugin:window|outer_size',{label:'main'});
    const inner=await invoke('plugin:window|inner_size',{label:'main'});
    const position=await invoke('plugin:window|outer_position',{label:'main'});
    const dpi=await invoke('plugin:window|scale_factor',{label:'main'});
    return {size,inner,position,dpi};
  })()`);
  dom = await execute(`const shell=document.querySelector('#widget').getBoundingClientRect();return {marks:document.querySelectorAll('.provider-card,.dial-value').length,shape:document.documentElement.dataset.shape,width:innerWidth,height:innerHeight,shell:shell.toJSON(),overflow:[...document.querySelectorAll('.provider-card')].filter(el=>getComputedStyle(el).visibility!=='hidden').some(el=>{const r=el.getBoundingClientRect();return r.right>shell.right+1||r.bottom>shell.bottom+1||r.left<shell.left-1||r.top<shell.top-1}),screen:{width:screen.width,height:screen.height}};`);
  if (Math.abs(native.inner.width/native.dpi-dom.width)<3 && Math.abs(native.inner.height/native.dpi-dom.height)<3 && (!['circle','square'].includes(dom.shape) || Math.abs(native.inner.width-native.inner.height)<=3)) break;
  await new Promise(r=>setTimeout(r,100));
  }
  assert(Math.abs(native.inner.width/native.dpi-dom.width)<3, `Native width disagrees with DOM viewport: ${name} ${native.inner.width}/${native.dpi} vs ${dom.width}`);
  assert(Math.abs(native.inner.height/native.dpi-dom.height)<3, `Native height disagrees with DOM viewport: ${name} ${native.inner.height}/${native.dpi} vs ${dom.height}`);
  assert(dom.marks>0,'Fictional quota marks missing; empty-window geometry is insufficient');
  assert.equal(dom.shape, name.split('-')[0]);
  if(['circle','square'].includes(dom.shape)) assert(Math.abs(native.inner.width-native.inner.height)<=3,`Fixed shape native window is not square: ${native.inner.width}x${native.inner.height}`);
  assert(!dom.overflow,'Native provider cards clipped');
  assert(dom.shell.right<=dom.width+1 && dom.shell.bottom<=dom.height+1,`Widget outside real window: ${name} shell ${dom.shell.right}x${dom.shell.bottom} in ${dom.width}x${dom.height}`);
  assert(native.size.width>0 && native.size.height>0,'Missing outer window size');
  assert(native.position.x>=-1 && native.position.y>=-1,'Widget outside screen origin');
  assert(native.position.x+native.size.width<=dom.screen.width*native.dpi+3,'Outer window exceeds screen width');
  assert(native.position.y+native.size.height<=dom.screen.height*native.dpi+3,'Outer window exceeds screen height');
  await screenshot(name);
  await writeFile(join(output,`${name}.json`),JSON.stringify({native,dom},null,2));
  return native.size;
}
async function start() {
  console.log('Starting native WebDriver session (timeout: 120 s)');
  const value=await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application}}}},120000);
  session=value.sessionId;
  console.log('Native WebDriver session established');
  await command('POST','/timeouts',{script:20000,implicit:0,pageLoad:30000});
}
try {
  await waitFor(async()=>{
    try { await request('GET','/status'); return true; }
    catch(error) { if(driver.exitCode!==null)throw Error(`tauri-driver exited with code ${driver.exitCode}; see driver.log`); return false; }
  },'tauri-driver startup timeout');
  await start();
  await selectWindow("document.querySelector('#provider-onboarding .provider-choices input')");
  assert(await execute("return [...document.querySelectorAll('#provider-onboarding input')].every(el=>!el.checked)"),'Onboarding has preselected providers');
  assert.equal(JSON.parse(await readFile(join(state,'config.json'),'utf8')).initialized,false);
  console.log('PASS: onboarding begins unchecked and uninitialized');
  await screenshot('onboarding-off');
  await click('#provider-onboarding button');
  await waitFor(async()=>JSON.parse(await readFile(join(state,'config.json'),'utf8')).initialized,'Start did not initialize provider consent');
  assert(Object.values(JSON.parse(await readFile(join(state,'config.json'),'utf8')).providers).every(p=>!p.enabled));
  // Finish collection while everything is disabled, then install display fixtures.
  await asyncScript("window.__TAURI_INTERNALS__.invoke('refresh_now')");
  await writeFile(join(state,'config.json'),JSON.stringify({initialized:true,providers:Object.fromEntries(ids.map(id=>[id,{enabled:['claude','codex','gemini'].includes(id)}]))}));
  await writeSnapshotFixture();
  await waitFor(async()=>{
    if(await execute("return document.querySelectorAll('.provider-card').length>0")) return true;
    // A startup collector may finish after refresh_now and replace the fixture.
    await writeSnapshotFixture();
    return false;
  },'Fictional snapshot was not rendered');
  let medium, small;
  for(const shape of ['portrait','landscape','square','circle','pill']) for(const preset of ['Small','Medium','Large','X-Large','2X-Large']) {
    await openSettings();
    await click('[data-category="shape-size"]');
    await click(`[data-shape="${shape}"]`);
    const unavailable=await execute(`const el=document.querySelector('[data-size="${preset}"]');return {disabled:el.disabled,title:el.title};`);
    if(unavailable.disabled) {
      assert(/fit|screen|large/i.test(unavailable.title),'Oversized preset disabled without reason');
      await screenshot(`${shape}-${preset}-disabled`);
      console.log(`PASS: ${shape}/${preset}: disabled with reason: ${unavailable.title}`);
      continue;
    }
    await click(`[data-size="${preset}"]`);
    assert.equal(await execute("return document.querySelector('#fit-screen').disabled"),shape!=='portrait');
    const disk=await save();assert.equal(disk.shape,shape);assert.equal(disk.sizePreset,preset);
    const size=await geometry(`${shape}-${preset}`);
    if(windows && ['circle','pill'].includes(shape)) {
      await new Promise(r=>setTimeout(r,100));
      checkWindowRegion(shape);
    }
    console.log(`PASS: ${shape}/${preset}: outer ${size.width}x${size.height}; disk matches`);
    if(shape==='portrait' && preset==='Medium') medium=size;
    if(shape==='portrait' && preset==='Small') small=size;
  }
  assert(medium.width>small.width,'Portrait Medium must be wider than Small');
  await openSettings();await click('[data-category="shape-size"]');await click('[data-shape="portrait"]');await click('#fit-screen');
  assert.equal((await save()).sizeMode,'screen');
  for(const fraction of ['1','0.75','0.5',String(1/3)]) {
    await selectWindow('window.__SETTINGS_READY__');
    await click(`[data-fraction="${fraction}"]`);
    assert.equal((await save()).fitFraction,Number(fraction));
    await geometry(`portrait-fit-${fraction}`);
  }
  await openSettings();await click('[data-category="theme"]');
  await execute("[...document.querySelectorAll('#palette-tools button')].find(button=>button.textContent==='New palette').click()");
  const palettes=(await save()).userPalettes;
  assert.equal(palettes?.length,1,'Custom palette did not reach disk through real IPC');
  console.log('PASS: custom palette saved through the real settings window');
  await selectWindow("document.querySelector('#gear')");
  await execute("document.querySelector('#widget').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:40,clientY:40}))");
  assert.equal(await execute("return document.querySelector('#context-menu').hidden"),false,'Context menu did not open');
  await click('#refresh');
  await execute("document.querySelector('#widget').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:40,clientY:40}))");
  await click('#menu-settings');
  await selectWindow('window.__SETTINGS_READY__');
  console.log('PASS: context menu Refresh now and Settings work natively');
  await click('[data-category="about"]');await click('#start-at-login');await save();
  assert.equal(await asyncScript("window.__TAURI_INTERNALS__.invoke('get_autostart')"),true);
  await click('#start-at-login');await save();
  assert.equal(await asyncScript("window.__TAURI_INTERNALS__.invoke('get_autostart')"),false);
  if(windows) {
    await click('[data-category="taskbar"]');await click('#taskbar-enabled');
    assert.equal((await save()).taskbar.enabled,true);
    const strip=execFileSync('powershell.exe',['-NoProfile','-File','docs/tools/acceptance/taskbar-window.ps1','-OutputPath',join(output,'taskbar-enabled.png')],{encoding:'utf8',timeout:20000});
    await writeFile(join(output,'taskbar-enabled.json'),strip);
  }
  await command('DELETE','');session=undefined;
  await start();
  await selectWindow("document.documentElement.dataset.shape==='portrait' && document.querySelector('#gear')");
  await openSettings();
  assert.equal(await execute("return document.querySelector('#fit-screen').getAttribute('aria-pressed')"),'true');
  assert.equal(JSON.parse(await readFile(settingsPath,'utf8')).sizeMode,'screen');
  await screenshot('restart-persistence');
  console.log('PASS: real onboarding, geometry, Save, restart, autostart and Windows strip');
} catch(error) {
  failed = true;
  if(session) { try { await screenshot('failure'); } catch(captureError) { appendLog(`\nScreenshot failed: ${captureError}`); } }
  throw error;
} finally {
  if(session) {
    try { await command('DELETE',''); }
    catch(error) { appendLog(`\nSession cleanup failed: ${error}`); failed=true; process.exitCode=1; }
  }
  const stopped = new Promise(resolve => {
    const timer = setTimeout(resolve, 2000);
    driver.once('close', () => { clearTimeout(timer); resolve(); });
  });
  driver.kill();
  await stopped;
  if(failed) console.error(`driver.log tail (last 8192 characters):\n${log.slice(-8192) || '(empty)'}`);
  await writeFile(join(output,'driver.log'),log);
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
