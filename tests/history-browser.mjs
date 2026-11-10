// Fictional snapshots only; no user files or native settings are read.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {browser} from '../docs/tools/browser-harness.mjs';
const output=process.env.HISTORY_SCREENSHOTS || '/tmp/ai-usage-a3';
await mkdir(output,{recursive:true});
const sample=JSON.parse(await readFile(new URL('../app/src/sample-providers-a1.json',import.meta.url)));
const b=await browser();
const capture=async name=>{const r=await b.cdp('Page.captureScreenshot',{format:'png'});await writeFile(`${output}/${name}.png`,Buffer.from(r.data,'base64'));};
try {
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:700,height:900,deviceScaleFactor:1,mobile:false});
  await b.navigate('/?sample=a1','window.__AI_USAGE_DEMO__');
  await b.evaluate(`__AI_USAGE_DEMO__.setSnapshot(${JSON.stringify(sample)})`);
  const themes=await b.evaluate('__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  let checks=0;
  for(const theme of themes) for(const appearance of ['light','dark']) for(const mode of ['under','card','panel']) {
    await b.evaluate(`__AI_USAGE_DEMO__.setSettings(${JSON.stringify({theme,appearance,historyMode:mode,historyEnabled:true,historyPanelOpen:false,historyMachines:true,shape:'portrait',scale:100,featuredProvider:'none'})})`);
    const result=await b.evaluate(`(async()=>{
      const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const root=document.querySelector('#providers');
      if(${JSON.stringify(mode)}==='card') {
        root.querySelector('[aria-expanded=true]')?.click();await wait();
        root.children[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();
        if(root.querySelectorAll('[aria-expanded=true]').length!==1)throw Error('Enter expands one card');
        root.children[1].dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));await wait();
        if(root.querySelectorAll('[aria-expanded=true]').length!==1 || !root.children[1].querySelector('.usage-history'))throw Error('Space switches expanded card');
        root.children[0].click();await wait();
      }
      if(${JSON.stringify(mode)}==='panel'){document.querySelector('.history-toggle').click();await wait();}
      const panel=document.querySelector('.history-panel'),scope=panel || root;
      return {sections:root.querySelectorAll('.usage-history').length,panel:!!panel,
        bars:scope.querySelectorAll('.history-bar').length,
        noGemini:!root.children[2].hasAttribute('aria-expanded'),width:panel?.getBoundingClientRect().width,
        heat:scope.querySelectorAll('.history-heat i').length};
    })()`);
    assert.equal(result.noGemini,true,`${theme} ${mode}: Gemini`);
    assert.equal(result.sections,mode==='under'?2:mode==='card'?1:0,`${theme} ${mode}`);
    assert.equal(result.panel,mode==='panel');assert.ok(result.bars>0);
    if(mode==='panel'){assert.ok(result.width>=250);assert.equal(result.heat,168);}
    if(theme==='system' && appearance==='light')await capture(mode);
    checks++;
  }
  console.log(`PASS: ${checks} theme/appearance/history combinations, Enter/Space, single expanded card, no Gemini history, charts and heatmap`);
  console.log(await b.evaluate(`(async()=>{
    const snapshot=${JSON.stringify(sample)};snapshot.providers=snapshot.providers.slice(0,2);
    await __AI_USAGE_DEMO__.setSnapshot(snapshot);
    await __AI_USAGE_DEMO__.setSettings({theme:'system',historyMode:'card',historyEnabled:true,historyPanelOpen:false});
    document.querySelector('[aria-expanded=true]')?.click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const widget=document.querySelector('#widget');
    const closed=Number(widget.dataset.usageHeight);
    document.querySelector('.provider-card').click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const expanded=Number(widget.dataset.usageHeight);
    if(!(expanded>closed))throw Error('Expanded history does not grow measured height');
    document.querySelector('[aria-expanded=true]').click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    if(Math.abs(Number(widget.dataset.usageHeight)-closed)>2)throw Error('Closed history does not restore measured height');
    const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await __AI_USAGE_DEMO__.setSettings({historyMode:'panel',position:'Top left',historyPanelOpen:true});
    if(document.querySelector('#widget').classList.contains('history-left'))throw Error('Panel direction');
    const select=document.querySelector('.history-controls select');select.value='codex';select.dispatchEvent(new Event('change'));await wait();
    if(document.querySelector('.history-heat,.history-price'))throw Error('Account-only extras');
    document.querySelector('.history-controls button').click();await wait();
    if(document.querySelectorAll('.history-panel .history-bar').length!==7)throw Error('Range');
    document.querySelector('.history-toggle').click();await wait();
    if(document.querySelector('.history-panel') || __AI_USAGE_DEMO__.getSettings().historyPanelOpen)throw Error('Close');
    await __AI_USAGE_DEMO__.setSettings({historyEnabled:false});
    if(document.querySelector('.history-toggle,.usage-history'))throw Error('Disabled history');
    return 'PASS: inward panel, provider selector, account restrictions, 7-day range, close state and disable';
  })()`));
  await b.navigate('/?settings&sample','window.__SETTINGS_READY__');
  const previews=await b.evaluate(`(()=>{document.querySelector('[data-category=appearance]').click();return ['aurora','crisp','glyph','layer','liquid-glass','pastel','pebble'].map(id=>{const el=document.querySelector('[data-theme='+id+'] .theme-preview');return {id,text:el.textContent,width:el.clientWidth,height:el.clientHeight,gradient:getComputedStyle(el).backgroundImage};});})()`);
  for(const p of previews){assert.ok(p.text.trim() && p.width>0 && p.height>0,p.id);if(p.id==='aurora')assert.notEqual(p.gradient,'none');}
  await capture('theme-previews');console.log('PASS: seven theme previews; Aurora gradient preserved');
}finally{await b.close();}
