import {auditPaletteSettings} from './palette-settings-check.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const scaleMatrix=JSON.parse(await readFile(new URL('./fixtures/scale-settings.json',import.meta.url),'utf8'));
const output=join(tmpdir(),'ai-usage-a2b','check');
await mkdir(output,{recursive:true});
const b=await browser();
try {
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:680,deviceScaleFactor:1,mobile:false});
  await b.navigate('/?settings&sample','window.__SETTINGS_READY__');
  const check=await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s),assert=(v,s)=>{if(!v)throw Error(s)};
    assert($('#status').dataset.state!=='failure','Initialization: '+$('#status').textContent);
    assert([...document.querySelectorAll('[data-category]')].map(b=>b.dataset.category).join(',')==='general,theme,colors,shape-size,display,providers,history,taskbar,about','Nine categories');
    $('[data-category=general]').click();
    assert(!$('#quote-enabled').checked,'Quote off by default');
    assert($('#category-general').textContent.includes('Off by default. When on, AI Usage contacts en.wikiquote.org (and wikidata.org) once a day. No account or identifiers are sent.'),'Quote disclosure');
    $('#quote-enabled').click();
    assert($('#quote-position').value==='bottom','Default quote position');
    $('#quote-position').value='top';$('#quote-position').dispatchEvent(new Event('change'));
    $('#quote-mode').value='mixed';$('#quote-mode').dispatchEvent(new Event('change'));
    $('#quote-navigation').click();
    $('#save').click();await new Promise(r=>setTimeout(r,50));
    $('#quote-enabled').click();$('#revert').click();assert($('#quote-enabled').checked&&$('#quote-mode').value==='mixed'&&$('#quote-position').value==='top'&&!$('#quote-navigation').checked,'Quote save/revert');
    $('[data-category=colors]').click();
    $('[data-theme="dot-matrix"]').click();
    assert($('#palette-grid .palette-option i'),'Palette colors');
    assert(/^[1-9][0-9]* unsaved changes$/.test($('#status').textContent),'Dirty theme');
    const palette=$('#palette-grid .palette-option:last-child');palette.click();
    assert(paletteGridSelected(),'Palette selection');
    function paletteGridSelected(){return !!$('#palette-grid [aria-pressed=true]');}
    assert(document.querySelectorAll('[data-provider-color]').length===12,'Twelve provider color pickers');
    const color=()=>document.querySelector('[data-provider-color="claude"]');
    color().value='#ffffff';color().dispatchEvent(new Event('input'));
    assert(/^[1-9][0-9]* unsaved changes$/.test($('#status').textContent),'Dirty provider color');
    const codex=document.querySelector('[data-provider-color="codex"]');codex.value='#ffffff';codex.dispatchEvent(new Event('input'));
    assert($('#provider-color-warning').textContent.includes('too similar'),'Similar colors warning');
    $('#appearance').value='light';$('#appearance').dispatchEvent(new Event('change'));assert($('#provider-color-warning').textContent.includes('low background contrast'),'Low contrast warning');
    $('#appearance').value='auto';$('#appearance').dispatchEvent(new Event('change')); 
    $('#save').click();await new Promise(r=>setTimeout(r,50));
    color().value='#123456';color().dispatchEvent(new Event('input'));$('#revert').click();assert(color().value==='#ffffff','Revert saved provider color');
    color().nextElementSibling.click();assert(color().value!=='#ffffff','Reset provider color');
    const a=$('#accent');a.value='#123456';a.dispatchEvent(new Event('input'));
    a.nextElementSibling.click();assert(a.value!=='#123456','Reset palette');
    $('#save').click();await new Promise(r=>setTimeout(r,50));assert($('#save').disabled&&['success','clean'].includes($('#status').dataset.state),'Save');
    $('[data-theme="terminal"]').click();$('#revert').click();assert($('[data-theme="dot-matrix"]').getAttribute('aria-pressed')==='true','Revert theme');
    $('[data-category=colors]').click();
    $('[data-category=shape-size]').click();assert(document.querySelectorAll('[data-shape]').length===5,'Five shapes');
    assert(document.querySelectorAll('.scale-presets button').length===6,'Six visible size choices');
    $('[data-category=theme]').click();$('[data-theme=reactor]').click();$('[data-category=shape-size]').click();$('[data-shape=circle]').click();
    assert(!$('#reactor-motion').closest('label').hidden&&$('#dot-count').closest('label').hidden,'Reactor motion applies to circle');
    $('[data-shape=portrait]').click();assert($('#reactor-motion').closest('label').hidden&&!$('#dot-count').closest('label').hidden,'Portrait reactor uses dot count');
    $('[data-category=theme]').click();$('[data-theme=system]').click();assert($('#dot-count').closest('label').hidden,'System does not use dot count');
    $('[data-category=theme]').click();$('[data-theme=dot-matrix]').click();

    const order=()=>[...document.querySelectorAll('[data-layout-provider]')].map(el=>el.dataset.layoutProvider);
    const original=order();
    document.querySelector('[data-layout-provider] button:last-child').click();
    assert(order()[1]===original[0],'Keyboard provider reorder');
    const first=document.querySelector('[data-layout-provider]'),last=document.querySelector('[data-layout-provider]:last-child');
    const transfer=new DataTransfer();first.dispatchEvent(new DragEvent('dragstart',{dataTransfer:transfer}));last.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,cancelable:true}));
    assert(order().at(-1)===first.dataset.layoutProvider,'Drag provider reorder');
    document.querySelector('[data-layout-provider] input').click();
    $('#featured-provider').value=original[0];$('#featured-provider').dispatchEvent(new Event('change'));
    $('#featured-position').value='top';$('#featured-position').dispatchEvent(new Event('change'));
    $('#reactor-motion').click();
    $('#save').click();await new Promise(r=>setTimeout(r,50));
    const savedOrder=order().join(',');
    $('#featured-provider').value='none';$('#featured-provider').dispatchEvent(new Event('change'));
    document.querySelector('[data-layout-provider] button:last-child').click();$('#revert').click();
    assert(order().join(',')===savedOrder&&$('#featured-provider').value===original[0]&&$('#featured-position').value==='top'&&$('#reactor-motion').checked,'Layout save/revert');

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
    for(const button of sizes.filter(b=>!b.disabled)){button.click();assert(button.getAttribute('aria-pressed')==='true'&&$('#scale').value==='100','Preset selection');}
    $('#scale').value=82;$('#scale').dispatchEvent(new Event('input'));
    $('[data-size=Large]').click();$('[data-size=Medium]').click();assert($('#scale').value==='82','Preset roundtrip preserves fine-tune');
    $('#scale').value=150;$('#scale').dispatchEvent(new Event('input'));
    assert($('[data-size="2X-Large"]').disabled&&$('[data-size="2X-Large"]').title.includes('Too big'),'Oversize preset disabled');
    const selectedSize=document.querySelector('[data-size][aria-pressed=true]').dataset.size;
    $('#scale').value=90;$('#scale').dispatchEvent(new Event('input'));
    $('[data-theme="terminal"]').click();
    assert($('#scale').value==='90'&&document.querySelector('[data-size][aria-pressed=true]').dataset.size===selectedSize,'Theme changed size');
    $('#revert').click();
    $('#place').click();
    assert(!$('#placement-actions').hidden&&!$('#map-widget').disabled,'Placement mode');
    [...document.querySelectorAll('#placement-presets button')].find(b=>b.textContent==='Center').click();
    assert(parseFloat($('#map-widget').style.left)>30,'Center position');
    $('#cancel-position').click();assert($('#placement-actions').hidden,'Cancel placement');
    const width=document.documentElement.scrollWidth;assert(width<=innerWidth,'Page overflow');
    $('[data-category=colors]').click();
    return 'PASS: categories, palette colors/selection/reset, Save, Revert, five sizes, fine-tune preserved across themes, placement, Center, Cancel';
  })()`);
  console.log(check);
  for(const scheme of ['light','dark']) {
    await b.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
    await new Promise(r=>setTimeout(r,50));
    const png=await b.cdp('Page.captureScreenshot',{format:'png'});
    if (!process.env.SKIP_AUDIT_SCREENSHOTS) await writeFile(`${output}/settings-preview-${scheme}.png`,Buffer.from(png.data,'base64'));
  }
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
  const small=await b.evaluate(`(()=>{for(const button of document.querySelectorAll('[data-category]')) {button.click();if(document.documentElement.scrollWidth>innerWidth)throw Error('Page overflow: '+button.textContent);const section=document.querySelector('.settings-content');if(section.scrollWidth>section.clientWidth+1)throw Error('Content overflow: '+button.textContent);}return 'PASS: all categories at 640 × 480';})()`);console.log(small);
  // Exercise the real frontend close handler with a synthetic IPC bridge.
  // This cannot touch native settings, providers, files or OS autostart.
  await b.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const callbacks=new Map(),events=new Map();let next=0,disk={theme:'system',palette:'default'};
    const state=window.__FAKE_NATIVE__={previews:[],saves:[],hidden:0,fail:null,close:async()=>{for(const [id,event]of events)if(event==='tauri://close-requested')await callbacks.get(id)({event,id,payload:{}});}};
    window.confirm=()=>{throw Error('Browser confirm is forbidden')};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:(_,id)=>events.delete(id)};
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'settings'},currentWebview:{label:'settings'}},transformCallback:callback=>{const id=++next;callbacks.set(id,callback);return id;},invoke:async(cmd,args={})=>{
      if(state.fail===cmd)throw Error('Synthetic serialization failure: '+cmd);
      if(cmd==='get_snapshot')return {snapshot:{providers:['claude','codex','gemini','copilot'].map(id=>({id,state:id==='copilot'?'NOT_INSTALLED':'OK'}))}};
      if(cmd==='load_settings')return structuredClone(disk);
      if(cmd==='get_provider_config')return {initialized:true,providers:Object.fromEntries(['claude','codex','gemini','copilot'].map(id=>[id,{enabled:true}])),disclosures:Object.fromEntries(['claude','codex','gemini','copilot'].map(id=>[id,'Synthetic provider'])),detected:{}};
      if(cmd==='get_autostart')return false;
      if(cmd==='get_desktop_info')return {platform:'linux',layerShell:true,monitors:[]};
      if(cmd==='get_placement_monitors')return {layerShell:true,monitors:state.disconnected?[]:[{name:'Synthetic display',width:1920,height:1080,primary:true}],widgetWidth:340,widgetHeight:600};
      if(cmd==='get_runtime_diagnostics')return {paths:{python_version:'3.x',runtime_source:'synthetic'}};
      if(cmd==='preview_settings'){await new Promise(r=>setTimeout(r,5));state.previews.push(structuredClone(args.settings));(state.previewTargets??=[]).push({id:args.widgetId,root:structuredClone(args.rootSettings)});return;}
      if(cmd==='save_settings'){state.saves.push(structuredClone(args.settings));await new Promise(r=>setTimeout(r,state.saveDelay||0));disk=structuredClone(args.settings);disk.taskbar.colorMode=disk.colorMode;disk.taskbar.dotCount=disk.dotCount;if(state.mismatch)delete disk.fineTune;return;}
      if(cmd==='plugin:event|listen'){events.set(args.handler,args.event);return args.handler;}
      if(cmd==='finish_settings'){state.hidden++;return;}
      state.listenerCount=()=>events.size;
      state.reopen=async()=>{for(const [id,event]of events)if(event==='settings-reopened')await callbacks.get(id)({event,id,payload:{}});};
      if(cmd==='plugin:event|unlisten'||cmd==='plugin:window|set_title')return;
      throw Error('Unexpected synthetic IPC: '+cmd);
    }};
  })()`});
  await auditPaletteSettings(b);
  await b.navigate('/?settings','window.__SETTINGS_READY__');
  console.log(await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s),assert=(v,s)=>{if(!v)throw Error(s)},native=window.__FAKE_NATIVE__;
    $('[data-category=colors]').click();
    assert($('[data-size=Medium] small').textContent==='340 × 746 px','Fit must exclude unavailable fourth provider');
    let verifiedRows=0;
    for(const row of ${JSON.stringify(scaleMatrix)}) {
      $('#scale').value=row.fineTune;$('#scale').dispatchEvent(new Event('input'));
      const button=$('[data-size="'+row.sizePreset+'"]');
      if(button.disabled)continue;button.click();verifiedRows++;
      await new Promise(r=>setTimeout(r,25));
      const value=native.previews.at(-1);
      for(const key of ['scale','fineTune','sizePreset','shape'])assert(value[key]===row[key],'Rust fixture mismatch: '+key+' '+JSON.stringify(row));
    }
    for(const [preset,expected] of [['Large',98.4],['Small',69.7]]) {
      $('#scale').value=82;$('#scale').dispatchEvent(new Event('input'));$('[data-size='+preset+']').click();
      $('#save').click();await new Promise(r=>setTimeout(r,50));
      assert(native.saves.at(-1).scale===expected,'Fractional save lost precision');
      await native.reopen();await new Promise(r=>setTimeout(r,30));
      $('[data-size=Medium]').click();$('#revert').click();await new Promise(r=>setTimeout(r,30));
      assert(native.previews.at(-1).scale===expected,'Fractional reopen/revert lost precision');
    }
    $('[data-size=Medium]').click();
    for(const command of ['preview_settings','save_settings','finish_settings']) {
      native.fail=command;$('#status').textContent='';
      if(command==='preview_settings'){
        $('[data-size=Large]').click();await new Promise(r=>setTimeout(r,30));
      }else if(command==='save_settings'){
        $('#save').click();await new Promise(r=>setTimeout(r,50));
        assert($('#status').dataset.state==='failure'&&!$('#save').disabled,'Failed save must remain retryable');
      }else{
        $('#revert').click();await new Promise(r=>setTimeout(r,30));await native.close();await new Promise(r=>setTimeout(r,30));
        assert(native.hidden===0,'Failed finish hid settings');
      }
      assert($('#status').textContent.includes('Synthetic serialization failure: '+command),'Missing readable IPC error: '+command);
      native.fail=null;
    }
    return 'PASS: '+verifiedRows+' enabled preset/fine-tune drafts match Rust fixtures (oversized choices disabled), fractional save/reopen/revert, three IPC errors visible, fit excludes unavailable provider';
  })()`));
  const errorPng=await b.cdp('Page.captureScreenshot',{format:'png'});
    if (!process.env.SKIP_AUDIT_SCREENSHOTS) await writeFile(join(output,'settings-error-preview.png'),Buffer.from(errorPng.data,'base64'));
  for(const action of ['discard','save']) {
    await b.navigate('/?settings','window.__SETTINGS_READY__');
    console.log(await b.evaluate(`(async()=>{
      const $=s=>document.querySelector(s),assert=(v,s)=>{if(!v)throw Error(s)},native=window.__FAKE_NATIVE__;
      assert($('#status').dataset.state!=='failure','Native bridge initialization: '+$('#status').textContent);
      $('[data-category=colors]').click();
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
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true}));await new Promise(r=>setTimeout(r,50));assert(native.saves.length===1&&native.saves[0].scale===150&&native.saves[0].shape==='square','Ctrl+S failed');assert($('#save').disabled&&['success','clean'].includes($('#status').dataset.state),'Saved state');await native.close();await new Promise(r=>setTimeout(r,40));assert(native.hidden===1,'Clean close blocked');
      }
      const count=native.listenerCount();assert(count===5,'Unexpected initial listener count');
      for(let cycle=0;cycle<4;cycle++){
        await native.reopen();await new Promise(r=>setTimeout(r,50));
        assert($('#save').disabled&&['success','clean'].includes($('#status').dataset.state)&&$('#close-prompt').hidden,'Reopened session not reset');
        assert($('#scale').value===('${action}'==='save'?'150':'100'),'Reopen failed to load persisted baseline');
        await native.close();await new Promise(r=>setTimeout(r,40));
        assert(native.listenerCount()===count,'Listeners grew on reopen');
      }
      assert(native.hidden===5,'Reused window failed to hide');
      return 'PASS: synthetic IPC ${action}, no disk writes on preview, latest-value queue, dirty close, Cancel, Esc, four reopens with five fixed listeners';
    })()`));
  }
  console.log(await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s),assert=(v,s)=>{if(!v)throw Error(s)},native=window.__FAKE_NATIVE__;
    await native.reopen();$('[data-category=colors]').click();
    const set=(id,value)=>{const el=$('#'+id);el.value=value;el.dispatchEvent(new Event('change'));};
    assert($('#size-mode').value==='fixed','Existing settings must default to fixed');
    const fixed=native.previews.at(-1)?.scale ?? 150;
    $('[data-shape=portrait]').click();
    set('size-mode','screen');set('fit-fraction','0.5');
    $('#fit-fine-tune').value=82;$('#fit-fine-tune').dispatchEvent(new Event('input'));
    set('reserved-top','0');set('reserved-bottom','20.4');
    assert(!$('.scale-presets').hidden&&!$('#fit-fraction').closest('label').hidden,'Size mode controls');
    assert($('#size-fit-warning').hidden||$('#size-fit-warning').textContent.includes('space budget'),'Screen mode limit note');
    assert($('#detected-area').textContent.includes('Detected work area 1920 × 1080'),'Detected area label');
    $('#save').click();await new Promise(r=>setTimeout(r,60));
    const saved=native.saves.at(-1);
    assert(saved.sizeMode==='screen'&&saved.fitFraction===0.5&&saved.fitFineTune===82,'Screen fields not saved');
    assert(saved.reservedTop===0&&saved.reservedBottom===20,'Zero override lost');
    assert(saved.scale===fixed,'Screen sizing changed saved fixed scale');
    await native.reopen();assert($('#size-mode').value==='screen'&&$('#reserved-top').value==='0','Screen reopen');
    set('size-mode','fixed');set('reserved-top','');$('#revert').click();
    assert($('#size-mode').value==='screen'&&$('#reserved-top').value==='0','Screen revert');
    set('reserved-top','');$('#save').click();await new Promise(r=>setTimeout(r,60));
    assert(native.saves.at(-1).reservedTop===null,'Blank Auto override lost');
    return 'PASS: screen fractions, independent fine tuning, zero/Auto reservations, fixed scale preserved, save/reopen/revert';
  })()`));
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:680,deviceScaleFactor:1,mobile:false});
  await b.evaluate("document.querySelector('#size-mode').scrollIntoView({block:'center'})");
  const screenPng=await b.cdp('Page.captureScreenshot',{format:'png'});
    if (!process.env.SKIP_AUDIT_SCREENSHOTS) await writeFile(join(output,'screen-fit-settings.png'),Buffer.from(screenPng.data,'base64'));
  // Verify all Save states against synthetic persisted state, including dropped fields.
  const screenshot=async name=>{
    const png=await b.cdp('Page.captureScreenshot',{format:'png'});
    if (!process.env.SKIP_AUDIT_SCREENSHOTS) await writeFile(`${output}/${name}.png`,Buffer.from(png.data,'base64'));
  };
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:900,deviceScaleFactor:1,mobile:false});
  for(const scheme of ['light','dark']) {
    await b.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
    await b.navigate('/?settings','window.__SETTINGS_READY__');
    console.log(await b.evaluate(`(()=>{
      const $=s=>document.querySelector(s),assert=(v,m)=>{if(!v)throw Error(m)};
      assert($('#save').disabled&&$('#revert').disabled,'Initially clean buttons');
      assert($('#status').textContent==='Changes preview live on the widget','Initial live preview status');
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true}));
      assert(window.__FAKE_NATIVE__.saves.length===0,'Clean Ctrl+S wrote settings');
      $('[data-category=colors]').click();
      const color=$('[data-provider-color=claude]');color.value='#123456';color.dispatchEvent(new Event('input'));
      color.nextElementSibling.click();assert($('#save').disabled&&$('#revert').disabled,'Color reset left an empty-object dirty state');
      return 'PASS: clean buttons, clean Ctrl+S, provider color reset returns clean';
    })()`));
    await b.evaluate(`(()=>{
      const $=s=>document.querySelector(s);
      [...document.querySelectorAll('#placement-presets button')].find(b=>b.textContent==='Bottom left').click();
      if($('#position').value!=='Bottom left'||!$('#placement-actions').hidden)throw Error('Corner preset must update legacy position without requiring placement mode');
      $('#revert').click();
    })()`);
    await screenshot(`save-clean-${scheme}`);
    await b.evaluate(`document.querySelector('[data-shape=square]').click()`);
    await screenshot(`save-dirty-${scheme}`);
    await b.evaluate(`window.__FAKE_NATIVE__.mismatch=true;document.querySelector('#save').click()`);
    await new Promise(r=>setTimeout(r,100));
    console.log(await b.evaluate(`(()=>{
      const status=document.querySelector('#status');
      if(status.dataset.state!=='failure'||!status.textContent.includes('fineTune')||document.querySelector('#save').disabled)throw Error('Dropped serde field was reported saved');
      return 'PASS: persisted mismatch names fineTune and remains retryable';
    })()`));
    await screenshot(`save-failure-${scheme}`);
    await b.evaluate(`window.__FAKE_NATIVE__.mismatch=false;window.__FAKE_NATIVE__.saveDelay=800;document.querySelector('#save').click()`);
    await new Promise(r=>setTimeout(r,100));
    await b.evaluate(`if(document.querySelector('#status').textContent!=='Saving…')throw Error('Missing saving state')`);
    await screenshot(`save-saving-${scheme}`);
    await new Promise(r=>setTimeout(r,900));
    await b.evaluate(`if(!document.querySelector('#save').disabled||!document.querySelector('#status').textContent.startsWith('✓ Saved at '))throw Error('Missing verified saved state')`);
    await screenshot(`save-success-${scheme}`);
    for(const platform of ['linux','windows']) {
      await b.navigate('/?settings&sample&platform='+platform,'window.__SETTINGS_READY__');
      const categories=await b.evaluate(`[...document.querySelectorAll('[data-category]')].filter(b=>!b.hidden).map(b=>b.dataset.category)`);
      if(categories.length!==(platform==='windows'?9:8)||categories.includes('taskbar')!==(platform==='windows'))throw Error('Platform category visibility');
      for(const id of categories) {
        await b.evaluate(`document.querySelector('[data-category=${id}]').click();document.querySelector('.settings-content').scrollTop=0`);
        await b.evaluate(`(()=>{
          const section=document.querySelector('#category-${id}');
          if(section.firstElementChild.tagName!=='H1')throw Error('Page title is not first');
          if(section.scrollWidth>section.clientWidth+1)throw Error('Page overflow: ${platform}/${id} '+section.scrollWidth+'/'+section.clientWidth);
        })()`);
        await screenshot(`${platform}-${id}-${scheme}`);
        if(platform==='linux'&&id==='theme') {
          const png=await b.cdp('Page.captureScreenshot',{format:'png'});
    if (!process.env.SKIP_AUDIT_SCREENSHOTS) await writeFile(`${output}/settings-${scheme}.png`,Buffer.from(png.data,'base64'));
        }
        if(platform==='linux'&&id==='colors') {
          await b.evaluate(`document.querySelector('#provider-colors').scrollIntoView({block:'end'})`);
          await screenshot(`theme-colors-${scheme}`);
        }
        if(platform==='linux'&&id==='shape-size') {
          await b.evaluate(`document.querySelector('#fit-screen').click()`);
          await screenshot(`screen-share-${scheme}`);
          await b.evaluate(`document.querySelector('#revert').click()`);
        }
        if(platform==='linux'&&id==='display') {
          await b.evaluate(`const details=document.querySelector('#category-display details');details.open=true;details.scrollIntoView({block:'end'})`);
          await screenshot(`position-advanced-${scheme}`);
          await b.evaluate(`document.querySelector('#category-display details').open=false`);
        }
        if(platform==='linux'&&id==='providers') {
          await b.evaluate(`document.querySelector('#featured-position').scrollIntoView({block:'end'})`);
          await screenshot(`providers-order-${scheme}`);
        }
      }
    }
  }
  console.log('PASS: all nine categories at 900 × 900 in light/dark with platform visibility; all five Save states captured');
  console.log(await b.evaluate(`(()=>{
    const $=s=>document.querySelector(s),assert=(v,m)=>{if(!v)throw Error(m)};
    $('[data-category=theme]').click();$('[data-category=theme]').click();$('[data-theme=system]').click();$('[data-category=shape-size]').click();$('[data-shape=portrait]').click();
    $('#scale').value=100;$('#scale').dispatchEvent(new Event('input'));$('[data-size=Medium]').click();$('#fit-screen').click();
    for(const shape of ['landscape','square','circle','pill']){
      $('[data-shape='+shape+']').click();
      assert($('#fit-screen').disabled&&$('#fit-screen small').textContent==='Portrait only','Fit hint '+shape);
      assert($('#size-mode').value==='screen','Stored Fit lost '+shape);
      assert($('[data-size=Medium]').getAttribute('aria-pressed')==='true','Effective preset '+shape);
      $('[data-shape=portrait]').click();assert(!$('#fit-screen').disabled&&$('#fit-screen').getAttribute('aria-pressed')==='true','Fit restoration');
    }
    $('[data-theme=compact-strip]').click();assert($('#fit-screen').disabled,'Strip Fit disabled');
    $('[data-theme=system]').click();assert($('#fit-screen').getAttribute('aria-pressed')==='true','Theme Fit restoration');
    return 'PASS: Portrait-only Fit hint, effective preset and stored Fit restored across all shapes and Strip';
  })()`));
  await b.navigate('/?settings','window.__SETTINGS_READY__');
  console.log(await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s),assert=(v,m)=>{if(!v)throw Error(m)},native=window.__FAKE_NATIVE__;
    const wait=()=>new Promise(r=>setTimeout(r,50));
    const choose=id=>{$('#widget-select').value=id;$('#widget-select').dispatchEvent(new Event('change'));};
    const change=(id,value)=>{const el=$('#'+id);el.value=value;el.dispatchEvent(new Event('change'));};
    choose('+');await wait();
    assert(!$('#widget-add').hidden,'Add form');
    assert($('#widget-new-monitor option').textContent==='Synthetic display','Main monitor must be offered');
    assert($('#widget-new-name').value==='Synthetic display','Suggested name');
    $('#widget-create').click();await wait();
    const first=$('#widget-select').value;
    assert(/^[a-z0-9-]{1,24}$/.test(first)&&first!=='main','Generated ID');
    assert(native.previewTargets.at(-1).root.widgets[0].overrides&&Object.keys(native.previewTargets.at(-1).root.widgets[0].overrides).length===0,'New widget must inherit Main');
    change('widget-name','Side display');
    $('[data-category=theme]').click();$('[data-theme=terminal]').click();
    [...document.querySelectorAll('#placement-presets button')].find(b=>b.textContent==='Bottom right').click();await wait();
    assert(native.previewTargets.at(-1).id===first,'Preview targeted wrong widget');
    assert(native.previews.at(-1).position==='Bottom right','Effective corner missing');
    assert($('#category-display .widget-reset').hidden===false,'Override reset missing');
    assert($('#reactor-motion').closest('label').textContent.includes('Shared by all widgets'),'Shared note');
    assert(!$('#featured-provider').closest('label').textContent.includes('Shared by all widgets'),'Overridable field marked shared');
    assert($('#disconnected').disabled&&$('#disconnected').value==='hide','Additional widget policy');
    $('#reactor-motion').click();await wait();
    choose('main');assert($('#reactor-motion').checked,'Shared setting did not go to root');
    assert($('#position').value==='Top right'&&$('#theme-picker [data-theme=system]').getAttribute('aria-pressed')==='true','Child changed Main');
    choose(first);assert($('#position').value==='Bottom right','Switch lost override');
    $('#category-display .widget-reset').click();await wait();
    assert($('#position').value==='Top right'&&$('#category-display .widget-reset').hidden,'Reset to Main');
    $('[data-theme=terminal]').click();
    choose('+');await wait();$('#widget-create').click();await wait();
    const second=$('#widget-select').value;
    assert(first!==second,'IDs not unique');
    choose(first);$('[data-category=history]').click();$('#history-cost').click();
    choose(second);$('[data-category=general]').click();$('#quote-enabled').click();await wait();
    const before=native.saves.length;
    assert(parseInt($('#status').textContent)>=3,'Count must cover all widgets');
    $('#save').click();await wait();
    assert(native.saves.length===before+1,'Save must write once');
    const saved=native.saves.at(-1);
    assert(saved.widgets.length===2&&saved.widgets[0].name==='Side display','Widget records missing');
    assert(saved.reactorMotion===true&&!('reactorMotion' in saved.widgets[0].overrides),'Shared field saved in override');
    assert(saved.widgets[0].overrides.theme==='terminal'&&saved.widgets[1].overrides.quoteEnabled===true,'Overrides missing');
    assert($('#save').disabled,'Honest save remains dirty: '+$('#status').textContent);
    choose(first);$('[data-category=history]').click();$('#history-models').click();
    choose(second);$('#history-heatmap').click();
    assert(parseInt($('#status').textContent)>=2,'Saved-widget changes missing from count');
    $('#revert').click();await wait();
    native.disconnected=true;choose('+');await wait();$('#widget-add-cancel').click();choose(first);
    assert(!$('#widget-monitor-status').hidden&&$('#widget-monitor-status').textContent==='Monitor not connected; hidden until it returns','Missing monitor state');
    assert($('#widget-select option:checked').classList.contains('widget-disconnected'),'Disconnected option not dimmed');
    $('[data-category=theme]').click();$('[data-theme=system]').click();await wait();
    assert(native.previewTargets.at(-1).id===first,'Disconnected widget cannot be edited');
    $('#widget-remove').click();assert(!$('#widget-remove-confirm').hidden,'Inline confirmation missing');
    $('#widget-remove-cancel').click();assert($('#widget-remove-confirm').hidden,'Remove cancel');
    $('#widget-remove').click();$('#widget-remove-yes').click();
    assert($('#widget-select').value==='main'&&!$('#widget-select option[value="'+first+'"]'),'Remove failed');
    $('#revert').click();await wait();
    assert($('#widget-select option[value="'+first+'"]').textContent.startsWith('Side display'),'Revert did not restore removal');
    assert($('#save').disabled,'Revert left dirty state');
    choose(first);assert($('#theme-picker [data-theme=terminal]').getAttribute('aria-pressed')==='true','Revert lost saved child override');
    $('#widget-remove').click();$('#widget-remove-yes').click();$('#save').click();await wait();
    assert(native.saves.at(-1).widgets.length===1,'Removal not persisted');
    choose('main');assert($('#widget-details').hidden,'Main removal must be unavailable');
    choose('+');await wait();assert($('#widget-create').disabled,'No-monitor Add must be disabled');$('#widget-add-cancel').click();
    choose(second);$('[data-category=colors]').click();
    return 'PASS: widget add/name/monitor/unique ID, targeted previews, shared fields, Reset to Main, cross-widget Save/count, disconnected edit, inline Remove/Cancel, Revert and persisted removal';
  })()`));
  const widgetPng=await b.cdp('Page.captureScreenshot',{format:'png'});
  if (!process.env.SKIP_AUDIT_SCREENSHOTS) await writeFile(join(output,'widget-picker.png'),Buffer.from(widgetPng.data,'base64'));
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  console.log(await b.evaluate(`(async()=>{
    const api=window.__AI_USAGE_DEMO__, monitor={name:'Synthetic small display',width:800,height:560,scale:1,primary:true};
    await api.setWorkArea([monitor]);
    await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[]}))});
    for(const sizeMode of ['fixed','screen']) {
      await api.setSettings({sizeMode,theme:'compact-strip',shape:'portrait',sizePreset:'2X-Large',fineTune:100,fitFineTune:100,fitFraction:1,quoteEnabled:true,linux:{margin:12}});
      for(const key of ['+','-','0']) {
        for(let i=0;i<22;i++)window.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true}));
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const scale=parseFloat(getComputedStyle(document.documentElement).fontSize)/16;
        const s=api.getSettings(), height=320+116+170, width=960;
        if(width*height*scale*scale>.35*(800-24)*(560-24)+1)throw Error('Keyboard size escaped screen coverage');
        const before=[s.sizeMode,s.sizePreset,s.fineTune,s.fitFineTune];
        await api.setSettings({theme:'system',shape:'landscape'});
        const after=api.getSettings();
        if(JSON.stringify(before)!==JSON.stringify([after.sizeMode,after.sizePreset,after.fineTune,after.fitFineTune]))throw Error('Theme/shape rewrote stored size');
        await api.setSettings({theme:'compact-strip',shape:'portrait'});
      }
    }
    return 'PASS: runtime Ctrl +/−/0 coverage and stored sizing across theme/shape changes';
  })()`));
}finally{await b.close();}
