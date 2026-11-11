import {writeFile, readFile, readdir} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
const b = await browser();
try {
  await b.navigate('/?settings&sample','window.__SETTINGS_READY__');
  console.log(await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s), assert=(v,m)=>{if(!v)throw Error(m)};
    const click=text=>{const el=[...document.querySelectorAll('#palette-tools button')].find(b=>b.textContent===text);assert(el,'Missing '+text);el.click();};
    const input=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input'));};
    $('[data-category=colors]').click();
    assert($('#palette-grid').children.length===12,'12 built-ins');
    assert([...$('#palette-grid').children].filter(el=>!el.hidden).length===6,'First group');
    click('Show all'); assert([...$('#palette-grid').children].every(el=>!el.hidden),'Expand palettes');
    const show=[...document.querySelectorAll('#palette-tools button')][0];show.focus();assert(document.activeElement===show,'Keyboard focus');
    click('New palette');
    input($('[data-palette-name]'),'Custom sky');
    input($('[data-mode=dark][data-token=accent]'),'#abc');
    input($('[data-mode=light][data-token=bgCard]'),'#12345678');
    click('Export');let palettes=JSON.parse($('#palette-tools textarea').value);
    assert(palettes.length===1&&palettes[0].name==='Custom sky'&&palettes[0].dark.accent==='#abc','Edited export');
    assert(palettes[0].light.bgCard==='#12345678','Alpha color');
    $('[data-theme=terminal]').click(); assert($('#palette-grid [aria-pressed=true] span').textContent==='Custom sky','Cross-theme selection');
    input($('[data-mode=dark][data-token=textPrimary]'),palettes[0].dark.bgCard);
    assert($('.palette-warning').textContent.includes('Low contrast'),'Inline warning');
    $('#save').click();await new Promise(r=>setTimeout(r,60));assert($('#save').disabled,'Honest Save');
    input($('[data-palette-name]'),'Temporary');$('#revert').click();click('Export');
    assert(JSON.parse($('#palette-tools textarea').value)[0].name==='Custom sky','Revert edits');
    click('Duplicate');click('Export');assert(JSON.parse($('#palette-tools textarea').value).length===2,'Duplicate');
    click('Delete');assert(![...document.querySelectorAll('#palette-tools div')].find(el=>el.firstChild?.textContent==='Delete this user palette? ').hidden,'Inline confirm');
    click('Cancel');click('Export');assert(JSON.parse($('#palette-tools textarea').value).length===2,'Cancel deletion');
    click('Delete');click('Delete palette');assert($('#palette-grid [aria-pressed=true] span').textContent==='Phosphor','Delete fallback');
    const bad=structuredClone(palettes);bad[0].dark.accent='url(https://invalid.test)';
    $('#palette-tools textarea').value=JSON.stringify(bad);click('Import');
    assert($('#palette-tools [role=status]').textContent.includes('Import rejected'),'Visible import rejection');
    palettes[0].name='Imported sky';palettes[0].extra={attack:'ignored'};
    $('#palette-tools textarea').value=JSON.stringify(palettes);click('Import');click('Export');
    const output=JSON.parse($('#palette-tools textarea').value);assert(output[0].name==='Imported sky'&&!('extra' in output[0]),'Safe merge');
    assert(!document.querySelector('img[src=x]'),'Text-only names');
    $('#save').click();await new Promise(r=>setTimeout(r,60));assert($('#save').disabled,'Imported Save');
    return 'PASS: swatches, expansion, editor, cross-theme selection, low contrast, Save/Revert, duplicate, delete/cancel, export/import and hostile import';
  })()`));
  if (process.env.PALETTE_CAPTURE) {
    const png=await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(process.env.PALETTE_CAPTURE,Buffer.from(png.data,'base64'));
  }
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
  console.log(await b.evaluate(`(()=>{if(document.documentElement.scrollWidth>innerWidth||document.querySelector('.settings-content').scrollWidth>document.querySelector('.settings-content').clientWidth+1)throw Error('Editor overflow');return 'PASS: palette editor at 640 × 480';})()`));
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  console.log(await b.evaluate(`(async()=>{
    const api=window.__AI_USAGE_DEMO__,base=api.themes[0].palettes.default;
    const keys=['bgWidget','bgCard','bgTrackOff','textPrimary','textSecondary','textMuted','border','accent','severityNormal','severityWarning','severityDanger'];
    const p={id:'user-test',name:'Test',dark:Object.fromEntries(keys.map(k=>[k,base[k]])),light:Object.fromEntries(keys.map(k=>[k,base.light[k]]))};
    p.dark.bgWidget='#123';p.dark.bgCard='#12345680';p.light.bgWidget='#fefefe';
    for(const theme of api.themes)for(const appearance of ['dark','light']){
      await api.setSettings({theme:theme.id,palette:p.id,userPalettes:[p],appearance,colorMode:'vivid'});
      if(getComputedStyle(document.documentElement).getPropertyValue('--bgWidget').trim()!==(appearance==='dark'?'#123':'#fefefe'))throw Error('Custom palette did not render '+theme.id);
      if(appearance==='dark'&&getComputedStyle(document.documentElement).getPropertyValue('--bgCard').trim()!=='#12345680')throw Error('Palette alpha discarded');
    }
    p.dark.bgWidget='url(https://invalid.test)';
    await api.setSettings({theme:'system',palette:p.id,userPalettes:[p],appearance:'dark'});
    if(getComputedStyle(document.documentElement).getPropertyValue('--bgWidget').includes('url'))throw Error('Unvalidated CSS');
    if(api.getSettings().palette!=='default')throw Error('Invalid palette fallback');
    return 'PASS: custom palettes render on all 10 themes in dark/light; hostile settings fall back before CSS';
  })()`));
  const assets = 'app/dist/assets';
  const manifests = [];
  for (const name of await readdir(assets)) if (name.endsWith('.js') && (await readFile(`${assets}/${name}`,'utf8')).includes('palettes:{')) manifests.push(name);
  if (manifests.length !== 10) throw Error('Expected 10 independent palette manifest chunks');
  await b.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    let next=0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd,args={})=>{
      if(cmd==='load_settings')return {theme:'terminal',palette:'amber-cursor'};
      if(cmd==='get_monitor_scale')return 1;
      if(cmd==='get_desktop_info')return {platform:'linux',layerShell:true};
      if(cmd==='get_placement_monitors')return {monitors:[{name:'Synthetic',width:1920,height:1080,primary:true}]};
      if(cmd==='get_provider_config')return {initialized:true,providers:{}};
      if(cmd==='get_snapshot')return {snapshot:{providers:[{id:'claude',state:'OK',windows:[{kind:'session',used_percent:40}]}]}};
      if(cmd==='plugin:event|listen')return args.handler;
      if(cmd==='snapshot_rendered')window.__LAZY_READY__=true;
      return null;
    }};
  })()`});
  await b.navigate('/','window.__LAZY_READY__');
  const requested=await b.evaluate('performance.getEntriesByType("resource").map(r=>r.name.split("/").at(-1))');
  const loaded=manifests.filter(name=>requested.includes(name));
  if(loaded.length!==1)throw Error('Native widget loaded '+loaded.length+' theme manifests');
  console.log('PASS: native widget path requests only the selected theme manifest ('+loaded.length+'/10)');
} finally {await b.close();}
