import { writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
const b=await browser();
try {
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:680,deviceScaleFactor:1,mobile:false});
  await b.navigate('/?settings&sample','window.__SETTINGS_READY__');
  const check=await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s),assert=(v,s)=>{if(!v)throw Error(s)};
    assert(!$('#status').textContent,'Initialization: '+$('#status').textContent);
    assert(document.querySelectorAll('[data-category]').length===6,'Categories');
    $('[data-category=appearance]').click();
    $('[data-theme="dot-matrix"]').click();
    assert($('#palette-grid .palette-option i'),'Palette colors');
    assert($('#dirty').textContent==='Unsaved changes','Dirty theme');
    const palette=$('#palette-grid .palette-option:last-child');palette.click();
    assert(paletteGridSelected(),'Palette selection');
    function paletteGridSelected(){return !!$('#palette-grid [aria-pressed=true]');}
    assert(document.querySelectorAll('[data-provider-color]').length===7,'Seven provider color pickers');
    const color=()=>document.querySelector('[data-provider-color="claude"]');
    color().value='#ffffff';color().dispatchEvent(new Event('input'));
    assert($('#dirty').textContent==='Unsaved changes','Dirty provider color');
    const codex=document.querySelector('[data-provider-color="codex"]');codex.value='#ffffff';codex.dispatchEvent(new Event('input'));
    assert($('#provider-color-warning').textContent.includes('too similar'),'Similar colors warning');
    $('#appearance').value='light';$('#appearance').dispatchEvent(new Event('change'));assert($('#provider-color-warning').textContent.includes('low background contrast'),'Low contrast warning');
    $('#appearance').value='auto';$('#appearance').dispatchEvent(new Event('change')); 
    $('#save').click();await new Promise(r=>setTimeout(r,50));
    color().value='#123456';color().dispatchEvent(new Event('input'));$('#revert').click();assert(color().value==='#ffffff','Revert saved provider color');
    color().nextElementSibling.click();assert(color().value!=='#ffffff','Reset provider color');
    const a=$('#accent');a.value='#123456';a.dispatchEvent(new Event('input'));
    a.nextElementSibling.click();assert(a.value!=='#123456','Reset palette');
    $('#save').click();await new Promise(r=>setTimeout(r,50));assert($('#dirty').textContent==='All changes saved','Save');
    $('[data-theme="terminal"]').click();$('#revert').click();assert($('[data-theme="dot-matrix"]').getAttribute('aria-pressed')==='true','Revert theme');
    $('[data-category=layout]').click();
    assert(document.querySelectorAll('[data-shape]').length===5,'Five shapes');
    $('[data-shape=landscape]').click();assert($('[data-size=Medium] small').textContent==='680 × 340 px','Landscape dimensions');assert($('#fit-height').disabled,'Fixed shape fit-height');
    $('#save').click();await new Promise(r=>setTimeout(r,50));
    $('[data-shape=square]').click();assert($('[data-size=Medium] small').textContent==='340 × 340 px','Square dimensions');
    $('#revert').click();assert($('[data-shape=landscape]').getAttribute('aria-pressed')==='true','Revert shape');
    for(const [shape,dimensions] of [['circle','340 × 340 px'],['pill','480 × 120 px']]) {
      $('[data-shape='+shape+']').click();assert($('[data-size=Medium] small').textContent===dimensions,'Round dimensions');
      assert(!$('#widget-provider-choices').hidden,'Round provider picker');
      const checks=[...document.querySelectorAll('[data-widget-provider]')];assert(checks.filter(c=>c.checked).length<=3,'Selection limit');
      const first=checks.find(c=>c.checked);if(first){first.click();assert(!document.querySelector('[data-widget-provider="'+first.dataset.widgetProvider+'"]').checked,'Selection toggle');}
    }
    $('[data-shape=portrait]').click();assert(!$('#fit-height').disabled,'Portrait fit-height');
    const sizes=[...document.querySelectorAll('[data-size]')];
    assert(sizes.map(b=>b.dataset.size).join(',')==='Small,Medium,Large,X-Large,2X-Large','Five size choices');
    for(const button of sizes){button.click();assert(button.getAttribute('aria-pressed')==='true'&&$('#scale').value==='100','Preset selection / reset');}
    $('#scale').value=90;$('#scale').dispatchEvent(new Event('input'));
    $('[data-theme="terminal"]').click();
    assert($('#scale').value==='90'&&$('[data-size="2X-Large"]').getAttribute('aria-pressed')==='true','Theme changed size');
    $('#revert').click();
    $('#place').click();
    assert(!$('#placement-actions').hidden&&!$('#map-widget').disabled,'Placement mode');
    [...document.querySelectorAll('#placement-presets button')].find(b=>b.textContent==='Center').click();
    assert(parseFloat($('#map-widget').style.left)>30,'Center position');
    $('#cancel-position').click();assert($('#placement-actions').hidden,'Cancel placement');
    const width=document.documentElement.scrollWidth;assert(width<=innerWidth,'Page overflow');
    $('[data-category=appearance]').click();
    return 'PASS: categories, palette colors/selection/reset, Save, Revert, five sizes, fine-tune preserved across themes, placement, Center, Cancel';
  })()`);
  console.log(check);
  for(const scheme of ['light','dark']) {
    await b.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
    await new Promise(r=>setTimeout(r,50));
    const png=await b.cdp('Page.captureScreenshot',{format:'png'});
    await writeFile(`docs/tools/settings-preview-${scheme}.png`,Buffer.from(png.data,'base64'));
  }
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
  const small=await b.evaluate(`(()=>{for(const button of document.querySelectorAll('[data-category]')) {button.click();if(document.documentElement.scrollWidth>innerWidth)throw Error('Page overflow: '+button.textContent);const section=document.querySelector('.settings-content');if(section.scrollWidth>section.clientWidth+1)throw Error('Content overflow: '+button.textContent);}return 'PASS: all categories at 640 × 480';})()`);console.log(small);
  // Exercise the real frontend close handler with a synthetic IPC bridge.
  // This cannot touch native settings, providers, files or OS autostart.
  await b.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const callbacks=new Map(),events=new Map();let next=0,disk={theme:'system',palette:'default'};
    const state=window.__FAKE_NATIVE__={previews:[],saves:[],hidden:0,close:async()=>{for(const [id,event]of events)if(event==='tauri://close-requested')await callbacks.get(id)({event,id,payload:{}});}};
    window.confirm=()=>{throw Error('Browser confirm is forbidden')};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:(_,id)=>events.delete(id)};
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'settings'},currentWebview:{label:'settings'}},transformCallback:callback=>{const id=++next;callbacks.set(id,callback);return id;},invoke:async(cmd,args={})=>{
      if(cmd==='load_settings')return structuredClone(disk);
      if(cmd==='get_provider_config')return {initialized:true,providers:Object.fromEntries(['claude','codex','gemini','copilot'].map(id=>[id,{enabled:true}])),disclosures:Object.fromEntries(['claude','codex','gemini','copilot'].map(id=>[id,'Synthetic provider'])),detected:{}};
      if(cmd==='get_autostart')return false;
      if(cmd==='get_desktop_info')return {platform:'linux',layerShell:true,monitors:[]};
      if(cmd==='get_placement_monitors')return {layerShell:true,monitors:[{name:'Synthetic display',width:1920,height:1080,primary:true}],widgetWidth:340,widgetHeight:600};
      if(cmd==='get_runtime_diagnostics')return {paths:{python_version:'3.x',runtime_source:'synthetic'}};
      if(cmd==='preview_settings'){await new Promise(r=>setTimeout(r,5));state.previews.push(structuredClone(args.settings));return;}
      if(cmd==='save_settings'){state.saves.push(structuredClone(args.settings));disk=structuredClone(args.settings);return;}
      if(cmd==='plugin:event|listen'){events.set(args.handler,args.event);return args.handler;}
      if(cmd==='finish_settings'){state.hidden++;return;}
      state.listenerCount=()=>events.size;
      state.reopen=async()=>{for(const [id,event]of events)if(event==='settings-reopened')await callbacks.get(id)({event,id,payload:{}});};
      if(cmd==='plugin:event|unlisten'||cmd==='plugin:window|set_title')return;
      throw Error('Unexpected synthetic IPC: '+cmd);
    }};
  })()`});
  for(const action of ['discard','save']) {
    await b.navigate('/?settings','window.__SETTINGS_READY__');
    console.log(await b.evaluate(`(async()=>{
      const $=s=>document.querySelector(s),assert=(v,s)=>{if(!v)throw Error(s)},native=window.__FAKE_NATIVE__;
      assert(!$('#status').textContent,'Native bridge initialization: '+$('#status').textContent);
      $('[data-category=layout]').click();
      $('[data-shape=circle]').click();assert(document.querySelectorAll('[data-widget-provider]:checked').length===3,'Default first three');
      assert($('[data-widget-provider=copilot]').disabled,'Fourth selection must be disabled');
      $('[data-widget-provider=claude]').click();$('[data-widget-provider=copilot]').click();
      $('[data-shape=pill]').click();assert($('[data-widget-provider=copilot]').checked&&!$('[data-widget-provider=claude]').checked,'Shared round selection');
      const scale=$('#scale');$('[data-shape=square]').click();scale.value=125;scale.dispatchEvent(new Event('input'));scale.value=150;scale.dispatchEvent(new Event('input'));
      await new Promise(r=>setTimeout(r,40));assert(native.saves.length===0,'Preview wrote to disk');assert(native.previews.at(-1).scale===150&&native.previews.at(-1).shape==='square','Preview queue lost latest value / shape');
      await native.close();assert(!$('#close-prompt').hidden&&native.hidden===0,'Dirty close not prevented');
      $('#close-cancel').click();assert($('#close-prompt').hidden&&native.hidden===0,'Cancel closed window');
      await native.close();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));assert($('#close-prompt').hidden,'Escape did not dismiss');
      if('${action}'==='discard') {
        await native.close();$('#close-discard').click();await new Promise(r=>setTimeout(r,40));assert(native.hidden===1,'Discard did not close');assert(native.previews.at(-1).scale===100&&native.previews.at(-1).shape==='portrait'&&native.saves.length===0,'Discard did not restore saved settings');
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true}));await new Promise(r=>setTimeout(r,50));assert(native.saves.length===1&&native.saves[0].scale===150&&native.saves[0].shape==='square','Ctrl+S failed');assert($('#dirty').textContent==='All changes saved','Saved state');await native.close();await new Promise(r=>setTimeout(r,40));assert(native.hidden===1,'Clean close blocked');
      }
      const count=native.listenerCount();assert(count===4,'Unexpected initial listener count');
      for(let cycle=0;cycle<4;cycle++){
        await native.reopen();await new Promise(r=>setTimeout(r,50));
        assert($('#dirty').textContent==='All changes saved'&&$('#close-prompt').hidden,'Reopened session not reset');
        assert($('#scale').value===('${action}'==='save'?'150':'100'),'Reopen failed to load persisted baseline');
        await native.close();await new Promise(r=>setTimeout(r,40));
        assert(native.listenerCount()===count,'Listeners grew on reopen');
      }
      assert(native.hidden===5,'Reused window failed to hide');
      return 'PASS: synthetic IPC ${action}, no disk writes on preview, latest-value queue, dirty close, Cancel, Esc, four reopens with four fixed listeners';
    })()`));
  }
}finally{await b.close();}
