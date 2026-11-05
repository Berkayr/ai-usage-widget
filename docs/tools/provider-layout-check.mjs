// Real Settings and widget frontends, connected only by synthetic in-memory IPC.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';

const b = await browser();
try {
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', {source: `(() => {
    const ids = ['claude','codex','gemini','copilot'];
    const state = top.__LAYOUT_TEST__ ||= {
      disk: {theme:'system',shape:'portrait',featuredProvider:'auto',featuredPosition:'top',providerOrder:['codex','claude','gemini','copilot'],hiddenProviders:['copilot'],widgetProviders:['claude','codex','gemini'],quoteEnabled:false},
      snapshot: {generated_at:new Date().toISOString(),providers:ids.map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:[20,40,95,10][i]},{kind:'weekly',used_percent:15}]}))},
      listeners: new Map(), next:0, previews:[], saves:[]
    };
    state.emit = async (event,payload) => {
      for (const [id,l] of state.listeners) if (l.event===event) await l.callback({event,id,payload:structuredClone(payload)});
    };
    const callbacks = new Map();
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener:(_,id)=>state.listeners.delete(id)};
    window.__TAURI_INTERNALS__ = {
      metadata:{currentWindow:{label:location.search.includes('settings')?'settings':'main'},currentWebview:{label:'test'}},
      transformCallback:callback=>{const id=++state.next;callbacks.set(id,callback);return id;},
      invoke:async(cmd,args={})=>{
        if(cmd==='plugin:event|listen'){const id=++state.next;state.listeners.set(id,{event:args.event,callback:callbacks.get(args.handler)});return id;}
        if(cmd==='plugin:event|unlisten'){state.listeners.delete(args.eventId);return;}
        if(cmd==='load_settings')return structuredClone(state.disk);
        if(cmd==='get_snapshot')return {snapshot:structuredClone(state.snapshot)};
        if(cmd==='get_provider_config')return {initialized:true,providers:Object.fromEntries(ids.map(id=>[id,{enabled:true}])),disclosures:Object.fromEntries(ids.map(id=>[id,'Synthetic provider'])),detected:{}};
        if(cmd==='get_autostart')return false;
        if(cmd==='get_monitor_scale')return 1;
        if(cmd==='get_desktop_info')return {platform:'linux',layerShell:true,monitors:[]};
        if(cmd==='get_placement_monitors')return {layerShell:true,monitors:[{name:'Synthetic display',width:1920,height:1080,scale:1,primary:true}],widgetWidth:340,widgetHeight:600};
        if(cmd==='get_runtime_diagnostics')return {paths:{python_version:'synthetic',runtime_source:'synthetic'}};
        if(cmd==='get_quote')return {status:'ok',cards:[{quote:'A synthetic quotation for layout testing.',author:'Example Author'}]};
        if(cmd==='preview_settings'){state.previews.push(structuredClone(args.settings));await state.emit('settings-preview',args.settings);return;}
        if(cmd==='save_settings'){state.disk=structuredClone(args.settings);state.saves.push(structuredClone(state.disk));await state.emit('settings-preview',state.disk);return;}
        if(['resize_widget','fit_window_height','snapshot_rendered','plugin:event|emit','plugin:event|emit_to'].includes(cmd))return;
        throw Error('Unexpected synthetic IPC command: '+cmd);
      }
    };
  })();`});
  await b.navigate('/', 'document.querySelectorAll(".provider-card").length===3 && [...__LAYOUT_TEST__.listeners.values()].some(l=>l.event==="settings-preview")');
  await b.evaluate(`(()=>{const frame=document.createElement('iframe');frame.id='settings-frame';frame.src='/?settings';frame.style.cssText='position:fixed;left:380px;top:0;width:900px;height:850px;border:0';document.body.append(frame);})()`);
  for (let i=0;i<150;i++) {
    if (await b.evaluate('document.querySelector("iframe").contentWindow.__SETTINGS_READY__===true')) break;
    await new Promise(r=>setTimeout(r,50));
  }
  console.log(await b.evaluate(`(async()=>{
    const frame=document.querySelector('iframe'), win=frame.contentWindow, doc=frame.contentDocument;
    const $=s=>doc.querySelector(s), state=__LAYOUT_TEST__;
    const assert=(v,msg)=>{if(!v)throw Error(msg)};
    const wait=async(test)=>{for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+test);};
    const settle=async()=>{await wait(()=>state.previews.length && !$('#status').textContent.includes('failed'));await new Promise(r=>setTimeout(r,35));};
    const set=async(id,value)=>{const el=$('#'+id);el.value=value;el.dispatchEvent(new win.Event('change'));await settle();};
    const click=async(selector)=>{$(selector).click();await settle();};
    const rows=()=>[...doc.querySelectorAll('[data-layout-provider]')].map(el=>el.dataset.layoutProvider);
    const cards=()=>[...document.querySelectorAll('.provider-card')];
    const domOrder=()=>cards().map(el=>el.dataset.provider);
    await wait(()=>win.__SETTINGS_READY__);
    assert(state.saves.length===0,'Opening Settings must not save');
    assert(rows().join() === 'codex,claude,gemini,copilot','Stored order must populate Settings without snapshot-order override');
    assert(domOrder().join() === 'gemini,codex,claude','Auto must reproduce highest-usage card before stored order');
    assert($('#featured-hint').textContent.includes('Gemini selected by highest usage'),'Auto hint names Gemini');
    await click('[aria-label="Up claude"]');
    assert(rows()[0]==='claude' && state.previews.at(-1).providerOrder[0]==='claude','Draft order reaches preview before Save');
    assert(domOrder().join()==='gemini,claude,codex','Auto keeps Gemini featured while Claude moves before Codex');
    assert(state.saves.length===0,'Reorder preview must not save');
    await click('#save');await wait(()=>$('#save').disabled);
    assert(state.disk.providerOrder[0]==='claude','Claude-first order persists');
    await state.emit('settings-reopened',{});await settle();
    assert(rows()[0]==='claude','Reopened settings retain saved order');

    let checks=0;
    async function verify(shape,count,choice,position,phase){
      const hidden=[...doc.querySelectorAll('[data-layout-provider] input')].filter(el=>!el.checked).map(el=>el.closest('[data-layout-provider]').dataset.layoutProvider);
      let visible=rows().filter(id=>!hidden.includes(id));
      if(['circle','pill'].includes(shape))visible=visible.filter(id=>state.previews.at(-1).widgetProviders.includes(id)).slice(0,3);
      const hero=choice==='first'?visible[0]:choice==='auto'?visible.reduce((best,id)=>({claude:20,codex:40,gemini:95,copilot:10}[id] > ({claude:20,codex:40,gemini:95,copilot:10}[best]??-1)?id:best),null):visible.includes(choice)?choice:null;
      let expected=[...visible];
      if(hero && (shape==='square'||shape==='portrait'&&count%2)){
        expected=expected.filter(id=>id!==hero);position==='top'?expected.unshift(hero):expected.push(hero);
      }
      const expectedClass=shape==='portrait'&&count%2&&hero?[hero]:[];
      if(shape==='circle'){
        assert(cards().length===0,'Circle has no rectangular cards');
        const names={claude:'Claude',codex:'Codex',gemini:'Gemini',copilot:'Copilot'};
        assert(document.querySelector('.dial-name').textContent===(hero?names[hero]:'ALL PROVIDERS'),phase+' circle center');
        const actual=[...document.querySelectorAll('.dial-arc-label')].map(el=>el.dataset.provider);
        assert(actual.join()===visible.join(),phase+' circle label order '+actual+' / '+visible);
      }else{
        assert(domOrder().join()===expected.join(),phase+' '+shape+' DOM order '+domOrder()+' / '+expected);
      }
      assert(cards().filter(el=>el.classList.contains('featured-provider')).map(el=>el.dataset.provider).join()===expectedClass.join(),phase+' featured class');
      checks++;
    }
    window.__verifyLayouts__=async(shape)=>{
    for(const quote of [false,true])for(const count of [2,3,4]){
      await click('[data-shape='+shape+']');
      if($('#quote-enabled').checked!==quote)await click('#quote-enabled');
      for(const [i,id] of ['claude','codex','gemini','copilot'].entries()){
        const selector='[aria-label="Show '+id+'"]';if($(selector).checked!==(i<count))await click(selector);
      }
      for(const choice of ['first','auto','claude','none'])for(const position of ['top','bottom']){
        await set('featured-provider',choice);await set('featured-position',position);
        await verify(shape,count,choice,position,'preview');
        const id=rows()[0];await click('[aria-label="Down '+id+'"]');
        await verify(shape,count,choice,position,'Down preview');
        await click('[aria-label="Up '+id+'"]');
        await verify(shape,count,choice,position,'Up preview');
        const first=$('[data-layout-provider]'),last=$('[data-layout-provider]:last-child'), transfer=new win.DataTransfer();
        first.dispatchEvent(new win.DragEvent('dragstart',{dataTransfer:transfer}));last.dispatchEvent(new win.DragEvent('drop',{dataTransfer:transfer,cancelable:true}));await settle();
        await verify(shape,count,choice,position,'drag preview');
        await click('#save');await wait(()=>$('#save').disabled);
        await state.emit('settings-reopened',{});await settle();
        await verify(shape,count,choice,position,'saved and reopened');
        assert(state.disk.providerOrder.join()===rows().join(),'Saved drag order');
        assert(state.disk.featuredProvider===choice && state.disk.featuredPosition===position,'Saved featured choice and position');
      }
    }
    return 'PASS: '+shape+'; '+checks+' cumulative rendered checks; live preview, Save/reopen, quotes off/on, 2/3/4 visible (round capped at 3)';
    };
    return 'PASS: stored Codex-first order, Claude-first draft preview, Auto Gemini hero, Save and reopen';
  })()`));
  for (const shape of ['portrait','square','landscape','circle','pill']) {
    console.log(await b.evaluate(`__verifyLayouts__(${JSON.stringify(shape)})`));
  }
  console.log(await b.evaluate(`(async()=>{
    const state=__LAYOUT_TEST__,doc=document.querySelector('iframe').contentDocument,win=document.querySelector('iframe').contentWindow;
    const pause=()=>new Promise(r=>setTimeout(r,60));
    const assert=(v,msg)=>{if(!v)throw Error(msg)};
    for(const choice of [null,'unknown','gemini']){
      state.disk={...state.disk,shape:'portrait',quoteEnabled:false,featuredProvider:choice,featuredPosition:'top',providerOrder:['claude','codex','gemini','copilot'],hiddenProviders:['copilot']};
      await state.emit('settings-preview',state.disk);
      await state.emit('settings-reopened',{});await pause();
      if(choice==='gemini'){doc.querySelector('[aria-label="Show gemini"]').click();await pause();}
      const hero=document.querySelector('.featured-provider')?.dataset.provider;
      assert(hero===(choice===null?'gemini':undefined),'Legacy / unknown / hidden explicit fallback: '+choice+' => '+hero);
    }
    state.disk={...state.disk,featuredProvider:'first',hiddenProviders:['copilot']};
    await state.emit('settings-preview',state.disk);
    await state.emit('settings-reopened',{});await pause();
    assert(document.querySelector('.featured-provider')?.dataset.provider==='claude','First visible provider after reopen');
    assert(!doc.querySelector('#featured-hint').textContent.includes('No provider'),'Hint names the actual first provider');
    doc.querySelector('#featured-provider').scrollIntoView({block:'center'});
    return 'PASS: legacy, unknown, hidden explicit, first visible provider and hint';
  })()`));
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:1400,height:950,deviceScaleFactor:1,mobile:false});
  await mkdir('gorevler/provider-layout', {recursive:true});
  const shot = await b.cdp('Page.captureScreenshot', {format:'png'});
  await writeFile('gorevler/provider-layout/settings-widget.png', Buffer.from(shot.data,'base64'));
  assert.ok(await b.evaluate('__LAYOUT_TEST__.saves.length>0'));
} finally {
  await b.close();
}
