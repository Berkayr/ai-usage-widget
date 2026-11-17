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
        noGemini:!root.children[2].hasAttribute('aria-expanded'),selection:panel?.querySelector('select').value,width:panel?.getBoundingClientRect().width,
        heat:scope.querySelectorAll('.history-heat i').length};
    })()`);
    assert.equal(result.noGemini,true,`${theme} ${mode}: Gemini`);
    assert.equal(result.sections,mode==='under'?2:mode==='card'?1:0,`${theme} ${mode}`);
    assert.equal(result.panel,mode==='panel');assert.ok(result.bars>0);
    if(mode==='panel'){assert.ok(result.width>=250);assert.equal(result.selection,'all');assert.equal(result.heat,0);}
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
    const closed=widget.getBoundingClientRect().height;
    document.querySelector('.provider-card').click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const expanded=widget.getBoundingClientRect().height;
    if(expanded<closed)throw Error('Expanded history shrinks the widget');
    const history=document.querySelector('.usage-history');
    if(!history || history.getBoundingClientRect().height<=0)throw Error('Expanded history must remain available inside its card');
    document.querySelector('[aria-expanded=true]').click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    if(Math.abs(widget.getBoundingClientRect().height-closed)>2)throw Error('Closed history changes the shared outer height');
    const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await __AI_USAGE_DEMO__.setSettings({historyMode:'panel',position:'Top left',historyPanelOpen:true});
    if(document.querySelector('#widget').classList.contains('history-left'))throw Error('Panel direction');
    const select=document.querySelector('.history-controls select');select.value='codex';select.dispatchEvent(new Event('change'));await wait();
    if(document.querySelector('.history-heat,.history-price'))throw Error('Account-only extras');
    [...document.querySelectorAll('.history-controls button')].find(b=>b.textContent==='7 days').click();await wait();
    if(document.querySelectorAll('.history-panel .history-bar').length!==7)throw Error('Range');
    document.querySelector('.history-toggle').click();await wait();
    if(document.querySelector('.history-panel') || __AI_USAGE_DEMO__.getSettings().historyPanelOpen)throw Error('Close');
    await __AI_USAGE_DEMO__.setSettings({historyMode:'panel',historyPanelOpen:true});await wait();
    const choose=async id=>{const s=document.querySelector('.history-controls select');s.value=id;s.dispatchEvent(new Event('change'));await wait();};
    await choose('claude');
    if(document.querySelectorAll('.history-heat i').length!==168)throw Error('Local heatmap remains available');
    document.querySelector('.history-controls button').click();await wait();
    if(document.querySelectorAll('.history-panel .history-bar').length!==new Date().getHours()+1)throw Error('Local hourly Today');
    await choose('all');
    document.querySelector('.history-controls button').click();await wait();
    const allBars=[...document.querySelectorAll('.history-panel .history-bar')];
    if(allBars.length!==new Date().getHours()+1)throw Error('All tools Today hourly bars: '+allBars.length+' vs '+(new Date().getHours()+1));
    if(allBars.some(bar=>bar.querySelectorAll('i').length!==1))throw Error('Account history must not enter hourly stacks');
    const legend=[...document.querySelectorAll('.history-panel .history-legend span')].map(el=>el.textContent).join(' | ');
    if(!legend.includes('OpenAI Codex ·') || !/(No data yet today|· partial)/.test(legend))throw Error('Account Today explanation remains visible');
    await choose('codex');
    snapshot.providers=${JSON.stringify(sample.providers.slice(0,3))};
    snapshot.providers.find(p=>p.id==='codex').history.daily=[];
    await __AI_USAGE_DEMO__.setSnapshot(snapshot);await wait();
    if(!document.querySelector('.history-today').textContent.includes('No data yet today'))throw Error('Missing account Today must be unknown');
    const now=new Date(), date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    snapshot.providers.find(p=>p.id==='codex').history.daily=[{date,tokens:0}];
    await __AI_USAGE_DEMO__.setSnapshot(snapshot);await wait();
    if(document.querySelector('.history-today').textContent!=='0 tokens today')throw Error('Known account zero');
    await __AI_USAGE_DEMO__.setSettings({historyEnabled:false});
    if(document.querySelector('.history-toggle,.usage-history,.history-total'))throw Error('Disabled history');
    return 'PASS: inward panel, provider selector, account restrictions, 7-day range, close state and disable';
  })()`));
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:1229,height:768,deviceScaleFactor:1.25,mobile:false});
  await b.evaluate(`(async()=>{
    const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const snapshot=${JSON.stringify(sample)};snapshot.providers=snapshot.providers.slice(0,3);
    await __AI_USAGE_DEMO__.setSnapshot(snapshot);
    await __AI_USAGE_DEMO__.setWorkArea([{name:'fixture',primary:true,x:0,y:36,width:1229,height:732,detectedTop:36,scale:1.25}]);
    await __AI_USAGE_DEMO__.setSettings({theme:'brutalist',shape:'portrait',quoteEnabled:true,historyEnabled:true,historyPanelOpen:true,linux:{margin:18},position:'Top right',scale:100});
    // The browser hosts the native window at its work-area origin plus margin.
    const app=document.querySelector('#app');app.style.position='absolute';app.style.top='54px';app.style.left='18px';app.style.maxWidth='1193px';app.style.height='696px';
    await wait();
  })()`);
  for(const mode of ['under','card','panel']) {
    const result=await b.evaluate(`(async()=>{
      const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      await __AI_USAGE_DEMO__.setSettings({historyMode:${JSON.stringify(mode)},historyPanelOpen:true});await wait();
      if(${JSON.stringify(mode)}==='panel' && !document.querySelector('.history-panel')){document.querySelector('.history-toggle')?.click();await wait();}
      if(${JSON.stringify(mode)}==='card' && !document.querySelector('[aria-expanded=true]')){document.querySelector('.provider-card').click();await wait();}
      if(${JSON.stringify(mode)}==='panel') {
        const select=document.querySelector('.history-controls select');if(select.value!=='all'){select.value='all';select.dispatchEvent(new Event('change'));await wait();}
        document.querySelector('.history-controls button')?.click();await wait();
        if(document.querySelector('.history-controls select').value!=='all')throw Error('All tools selection');
        if(!document.querySelector('.history-controls [aria-pressed=true]').textContent.includes('Today'))throw Error('Today range');
        if(document.querySelectorAll('.history-panel .history-bar').length!==new Date().getHours()+1)throw Error('Today hourly bars in fit scenario');
      }
      const widget=document.querySelector('#widget'),r=widget.getBoundingClientRect(),doc=document.scrollingElement;
      const cards=[...document.querySelectorAll('.provider-card')];
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,overflow:doc.scrollHeight>doc.clientHeight || doc.scrollWidth>doc.clientWidth,
        cards:cards.map(c=>{const h=c.querySelector('.provider-heading').getBoundingClientRect(),r=c.getBoundingClientRect();return {top:h.top,bottom:h.bottom,cardTop:r.top,cardBottom:r.bottom,width:r.width,listWidth:document.querySelector('#providers').clientWidth};}),
        histories:[...document.querySelectorAll('.usage-history,.history-body')].map(h=>({height:h.clientHeight,scroll:h.scrollHeight,overflow:getComputedStyle(h).overflowY}))};
    })()`);
    assert.ok(result.x>=18 && result.y>=54 && result.right<=1211.1 && result.bottom<=750.1,`${mode}: ${JSON.stringify(result)}`);
    assert.equal(result.overflow,false,mode);
    for(const card of result.cards)assert.ok(card.top>=card.cardTop && card.bottom<=card.cardBottom,`${mode}: visible heading ${JSON.stringify(result)}`);
    for(const card of result.cards)assert.ok(Math.abs(card.width-card.listWidth)<2,`${mode}: full width cards`);
    if(mode==='card')assert.ok(result.histories.some(h=>h.scroll>h.height),'Expanded history scrolls internally');
    for(const h of result.histories){assert.ok(h.height>0,`${mode}: visible history ${JSON.stringify(result)}`);assert.equal(h.overflow,'auto');}
    await capture(`brutalist-fit-${mode}`);
  }
  console.log('PASS: 1229×768 with y=36 panel reservation, margins, Brutalist, quote, three providers and all history modes');
  await b.navigate('/?settings&sample','window.__SETTINGS_READY__');
  const previews=await b.evaluate(`(()=>{document.querySelector('[data-category=theme]').click();return ['aurora','crisp','glyph','layer','liquid-glass','pastel','pebble'].map(id=>{const el=document.querySelector('[data-theme='+id+'] .theme-preview');return {id,text:el.textContent,width:el.clientWidth,height:el.clientHeight,gradient:getComputedStyle(el).backgroundImage};});})()`);
  for(const p of previews){assert.ok(p.text.trim() && p.width>0 && p.height>0,p.id);if(p.id==='aurora')assert.notEqual(p.gradient,'none');}
  await capture('theme-previews');console.log('PASS: seven theme previews; Aurora gradient preserved');
}finally{await b.close();}
