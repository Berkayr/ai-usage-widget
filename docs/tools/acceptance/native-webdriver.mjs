// CI only: real Tauri windows, real IPC and isolated fictional state. No mocks.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';

assert.equal(process.env.CI, 'true', 'Native acceptance is restricted to CI');
const windows = process.platform === 'win32';
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
await copyFile('app/src/sample-snapshot.json', join(state, 'snapshot.json'));
const env = {...process.env, HOME:join(root,'home'), USERPROFILE:join(root,'home'),
  AI_USAGE_TEST_CONFIG_HOME:config, APPDATA:config, LOCALAPPDATA:join(root,'data'), XDG_CONFIG_HOME:config,
  XDG_DATA_HOME:join(root,'data'), XDG_CACHE_HOME:join(root,'cache'),
  XDG_STATE_HOME:join(root,'state'), QUOTACORE_HOME:state,
  GDK_BACKEND:'x11', XDG_SESSION_TYPE:'x11', WAYLAND_DISPLAY:'',
  AI_USAGE_SETTINGS_TEST_POSITION:'20,20'};
// Do not pass provider credentials inherited from the runner to the application.
for (const key of Object.keys(env)) if (/(TOKEN|SECRET|API_KEY|PASSWORD)/i.test(key)) delete env[key];
const driver = spawn('tauri-driver', [], {env, stdio:['ignore','pipe','pipe']});
let log = '', session;
driver.stdout.on('data', data=>{log+=data;});
driver.stderr.on('data', data=>{log+=data;});
driver.on('error', error=>{log+=error.stack;});
async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:4444${path}`, {
    method, headers:{'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(30000)
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
  const native = await asyncScript(`(async()=>{
    const invoke=window.__TAURI_INTERNALS__.invoke;
    const size=await invoke('plugin:window|outer_size',{label:'main'});
    const inner=await invoke('plugin:window|inner_size',{label:'main'});
    const position=await invoke('plugin:window|outer_position',{label:'main'});
    const dpi=await invoke('plugin:window|scale_factor',{label:'main'});
    return {size,inner,position,dpi};
  })()`);
  const dom = await execute(`const shell=document.querySelector('#widget').getBoundingClientRect();return {marks:document.querySelectorAll('.provider-card,.dial-value').length,shape:document.documentElement.dataset.shape,width:innerWidth,height:innerHeight,shell:shell.toJSON(),overflow:[...document.querySelectorAll('.provider-card')].filter(el=>getComputedStyle(el).visibility!=='hidden').some(el=>{const r=el.getBoundingClientRect();return r.right>shell.right+1||r.bottom>shell.bottom+1||r.left<shell.left-1||r.top<shell.top-1}),screen:{width:screen.width,height:screen.height}};`);
  assert(Math.abs(native.inner.width/native.dpi-dom.width)<3, 'Native width disagrees with DOM viewport');
  assert(Math.abs(native.inner.height/native.dpi-dom.height)<3, 'Native height disagrees with DOM viewport');
  assert(dom.marks>0,'Fictional quota marks missing; empty-window geometry is insufficient');
  assert.equal(dom.shape, name.split('-')[0]);
  if(['circle','square'].includes(dom.shape)) assert(Math.abs(native.inner.width-native.inner.height)<=3,'Fixed shape native window is not square');
  assert(!dom.overflow,'Native provider cards clipped');
  assert(dom.shell.right<=dom.width+1 && dom.shell.bottom<=dom.height+1,'Widget outside real window');
  assert(native.size.width>0 && native.size.height>0,'Missing outer window size');
  assert(native.position.x>=-1 && native.position.y>=-1,'Widget outside screen origin');
  assert(native.position.x+native.size.width<=dom.screen.width*native.dpi+3,'Outer window exceeds screen width');
  assert(native.position.y+native.size.height<=dom.screen.height*native.dpi+3,'Outer window exceeds screen height');
  await screenshot(name);
  await writeFile(join(output,`${name}.json`),JSON.stringify({native,dom},null,2));
  return native.size;
}
async function start() {
  const value=await request('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:binary}}}});
  session=value.sessionId;
  await command('POST','/timeouts',{script:20000,implicit:0,pageLoad:30000});
}
try {
  await waitFor(async()=>{
    try { await request('GET','/status'); return true; }
    catch(error) { if(driver.exitCode!==null)throw Error(log); return false; }
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
  await copyFile('app/src/sample-snapshot.json',join(state,'snapshot.json'));
  await waitFor(()=>execute("return document.querySelectorAll('.provider-card').length>0"),'Fictional snapshot was not rendered');
  let medium, large;
  for(const shape of ['portrait','landscape','square','circle','pill']) for(const preset of ['Small','Medium','Large','X-Large','2X-Large']) {
    await openSettings();
    await click('[data-category="layout"]');
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
    console.log(`PASS: ${shape}/${preset}: outer ${size.width}x${size.height}; disk matches`);
    if(shape==='portrait' && preset==='Medium') medium=size;
  }
  await openSettings();await click('[data-category="layout"]');await click('[data-shape="portrait"]');await click('[data-size="Large"]');await save();
  large=await geometry('portrait-large');
  assert(large.width>medium.width,'Size selection did not resize native outer window');
  await openSettings();await click('[data-category="layout"]');await click('#fit-screen');
  assert.equal((await save()).sizeMode,'screen');
  for(const fraction of ['1','0.75','0.5',String(1/3)]) {
    await selectWindow('window.__SETTINGS_READY__');
    await click(`[data-fraction="${fraction}"]`);
    assert.equal((await save()).fitFraction,Number(fraction));
    await geometry(`portrait-fit-${fraction}`);
  }
  await openSettings();await click('[data-category="about"]');await click('#start-at-login');await save();
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
  if(session) { try { await screenshot('failure'); } catch(captureError) { log+=`\nScreenshot failed: ${captureError}`; } }
  throw error;
} finally {
  if(session) {
    try { await command('DELETE',''); }
    catch(error) { log+=`\nSession cleanup failed: ${error}`; process.exitCode=1; }
  }
  driver.kill();
  await writeFile(join(output,'driver.log'),log);
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
