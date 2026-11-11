// Offline production-renderer matrix; all snapshots are fictional.
import {readFile, writeFile} from 'node:fs/promises';
import {browser} from './browser-harness.mjs';
import {fittedGeometry, normalizeSize} from '../../app/src/sizing.js';
const sample = JSON.parse(await readFile(new URL('../../app/src/sample-snapshot.json', import.meta.url), 'utf8'));
const monitor = {name:'Synthetic laptop',x:0,y:0,width:1536,height:960,scale:1.25,primary:true,detectedTop:0,detectedBottom:44};
const selected = (key, values) => process.env[key] ? values.filter(v => process.env[key].split(',').includes(v)) : values;

// Compare text-node line boxes, including glyph overhang and readable inline gaps.
function inspectText() {
  const widget = document.querySelector('#widget'), bounds = widget.getBoundingClientRect();
  const visible = e => {
    for (let p=e;p;p=p.parentElement) {
      const s=getComputedStyle(p);
      if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.05) return false;
    }
    return true;
  };
  const leaves=[], issues=[];
  const required = '.window-top>span,.window-top b,.provider-name,.provider-heading h2,.reset,.dial-name,.dial-number,.dial-reset,.heading-reset,.ring-center strong,.ring-center small';
  const walker=document.createTreeWalker(widget,NodeFilter.SHOW_TEXT);
  for(let node;node=walker.nextNode();) {
    const e=node.parentElement;
    if(!node.textContent.trim()||!visible(e)) continue;
    const range=document.createRange();range.selectNodeContents(node);
    for(const box of range.getClientRects()) {
      if(box.width<1||box.height<1) continue;
      const r={left:box.left,right:box.right,top:box.top,bottom:box.bottom};
      const text=node.textContent.trim().slice(0,60);
      if(e.closest(required) && /…|\.{3}/.test(node.textContent)) issues.push(`truncated required text: "${text}" (literal ellipsis)`);
      for(let p=e;p&&p!==widget;p=p.parentElement) {
        const s=getComputedStyle(p), b=p.getBoundingClientRect();
        // Ellipsis is intentional horizontal shortening; measure only its painted area.
        if(s.textOverflow==='ellipsis'&&s.overflowX!=='visible') {
          if(e.closest(required) && (r.left < b.left-1 || r.right > b.right+1 || p.scrollWidth > p.clientWidth+1)) issues.push(`truncated required text: "${text}" (${p.className})`);
          r.left=Math.max(r.left,b.left);r.right=Math.min(r.right,b.right);
        }
        if(s.overflowX!=='visible'&&(r.left<b.left-2||r.right>b.right+2)) issues.push(`clipped horizontally: "${text}" (${p.className})`);
        if(s.overflowY!=='visible'&&(r.top<b.top-2||r.bottom>b.bottom+2)) issues.push(`clipped vertically: "${text}" (${p.className})`);
      }
      if(r.left<bounds.left-2||r.right>bounds.right+2||r.top<bounds.top-2||r.bottom>bounds.bottom+2) issues.push(`outside widget: "${text}"`);
      const overhang=parseFloat(getComputedStyle(e).fontSize)*.08;
      leaves.push({e,node,r:{...r,left:r.left-overhang,right:r.right+overhang},text});
    }
  }
  for(let i=0;i<leaves.length;i++) for(let j=i+1;j<leaves.length;j++) {
    const a=leaves[i], b=leaves[j];
    if(a.node===b.node) continue;
    // An exception must identify the exact intentionally layered decoration.
    if(a.e.closest('[data-overlap-ok]')===b.e.closest('[data-overlap-ok]')&&a.e.closest('[data-overlap-ok]')) continue;
    const vertical=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);
    const horizontal=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left);
    if(horizontal>0 && vertical>2) issues.push(`overlap: "${a.text}" × "${b.text}"`);
    else if(vertical > .5*Math.min(a.r.bottom-a.r.top,b.r.bottom-b.r.top) && -horizontal < 4) issues.push(`inline gap below 4px: "${a.text}" × "${b.text}"`);
  }
  if(!['circle','pill'].includes(document.documentElement.dataset.shape)) {
    const title=widget.querySelector('.app-title');
    if(!title||!visible(title)||title.getBoundingClientRect().height<1) issues.push('missing title');
  }
  const {shape,quote,quotePage}=document.documentElement.dataset;
  if(quote==='true' && (shape==='landscape' || (shape==='square' && quotePage==='true'))) {
    const providers=widget.querySelector('.provider-list'), text=widget.querySelector('.quote-text');
    if(providers && providers.getBoundingClientRect().height < bounds.height*.55-1) issues.push('usage below 55% of widget height');
    if(text && text.getBoundingClientRect().height > parseFloat(getComputedStyle(text).lineHeight)*2+1) issues.push('compact quote exceeds two lines');
  }
  return [...new Set(issues)];
}
const b=await browser();let count=0;const failures=[];
try {
  await b.cdp('Network.enable');await b.cdp('Network.setBlockedURLs',{urls:['https://*']});
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  // Prove that collisions/clipping fail, and only local decorations/ellipsis pass.
  await b.evaluate(`(() => {
    const original=document.querySelector('#widget');original.id='audit-original';
    const fixture=document.createElement('div');fixture.id='widget';
    fixture.style.cssText='position:fixed;inset:0 auto auto 0;width:300px;height:200px;font:14px/20px monospace';
    fixture.innerHTML='<span class="app-title">AI USAGE</span><div id="layered" style="position:absolute;left:10px;top:60px"><span style="position:absolute">First</span><span style="position:absolute">Second</span></div><div id="clipped" style="position:absolute;left:10px;top:100px;width:20px;height:20px;overflow:hidden;white-space:nowrap">Clipped text</div><span id="outside" style="position:absolute;left:290px;top:150px">Outside text</span>';
    document.body.append(fixture);
    try {
      const inspect=${inspectText.toString()}, issues=inspect();
      for(const kind of ['overlap:', 'clipped horizontally:', 'outside widget:']) if(!issues.some(i=>i.startsWith(kind))) throw Error('Detector missed '+kind);
      fixture.querySelector('#layered').dataset.overlapOk='test-decoration';
      fixture.querySelector('#clipped').style.textOverflow='ellipsis';
      fixture.querySelector('#clipped').className='plan';
      fixture.querySelector('#outside').hidden=true;
      if(inspect().length) throw Error('Detector rejected explicit decoration or ellipsis: '+inspect().join('; '));
      fixture.innerHTML='<span class="app-title">AI USAGE</span><div id="same" style="position:absolute;top:60px"></div>';
      fixture.querySelector('#same').append(document.createTextNode('34%'),document.createTextNode('Weekly'));
      if(!inspect().some(i=>/^(overlap:|inline gap)/.test(i))) throw Error('Detector missed adjacent text nodes in one element');
      fixture.innerHTML='<span class="app-title">AI USAGE</span><div id="siblings" style="display:flex;gap:6px;position:absolute;top:60px"><span>34%</span><span>Weekly</span></div>';
      if(!inspect().some(i=>i.startsWith('inline gap'))) throw Error('Detector missed glyph overhang in a sibling gap');
      fixture.querySelector('#siblings').style.gap='7px';
      if(inspect().length) throw Error('Detector rejected a sufficient sibling gap');
      for(const cls of ['provider-name','reset']) {
        fixture.innerHTML='<span class="app-title">AI USAGE</span><span class="'+cls+'" style="position:absolute;top:60px;width:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Required text</span>';
        if(!inspect().some(i=>i.startsWith('truncated required text:'))) throw Error('Detector accepted truncated '+cls);
      }
      fixture.innerHTML='<span class="app-title">AI USAGE</span><div class="window-top" style="display:block;position:absolute;top:60px;width:20px"><span style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Weekly</span><b style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">100%</b></div>';
      const truncated=inspect().filter(i=>i.startsWith('truncated required text:'));
      if(truncated.length!==2) throw Error('Detector accepted truncated window label or percentage');

    } finally {fixture.remove();original.id='widget';}
  })()`);
  const themes=selected('AUDIT_THEMES',await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)'));
  for(const shape of selected('AUDIT_SHAPES',['portrait','landscape','square','strip','circle','pill']))
  for(const size of selected('AUDIT_SIZES',['screen','Medium']))
  for(const quote of selected('AUDIT_QUOTES',['off','top','bottom'])) for(const extra of [false,true]) for(const theme of themes) {
    const settings={theme,shape,sizePreset:size==='screen'?'Small':'Medium',fineTune:size==='screen'?82:100,sizeMode:size==='screen'?'screen':'fixed',fitFraction:1,fitHeight:true,quoteEnabled:quote!=='off',quotePosition:quote==='bottom'?'bottom':'top',quoteMode:'mixed',featuredPosition:'top',position:'Free',showExtraWindows:extra,appearance:'dark',linux:{layer:'bottom',margin:23,monitor:monitor.name}};
    const geometry=fittedGeometry(normalizeSize(settings),3,monitor,'linux');
    await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(geometry.width),height:Math.round(geometry.height),deviceScaleFactor:1,mobile:false});
    const issues=await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__;
      await api.setWorkArea([${JSON.stringify(monitor)}],'linux');
      await api.setSettings(${JSON.stringify(settings)});
      const sample=${JSON.stringify({...sample,providers:sample.providers.slice(0,3)})};
      await api.setSnapshot({...sample,providers:sample.providers.map(p=>({...p,windows:p.windows.map(w=>({...w,resets_at:Number.isFinite(w.resets_in_minutes)?new Date(Date.now()+w.resets_in_minutes*60000).toISOString():null}))}))});
      if(${JSON.stringify(quote !== 'off')} && ['square','circle'].includes(document.documentElement.dataset.shape) && document.documentElement.dataset.quotePage!=='true') document.querySelector('.quote-toggle').click();
      await document.fonts.ready;await new Promise(r=>setTimeout(r,50));
      return (${inspectText.toString()})();
    })()`);
    count++;
    if(count%102===0) console.log(`${count} combinations checked`);
    if(issues.length) failures.push({theme,shape,size,quote,extra,issues});
  }
} finally {await b.close();}
if(process.env.AUDIT_OUTPUT) await writeFile(process.env.AUDIT_OUTPUT,JSON.stringify({count,failures},null,2)+'\n');
if(failures.length) {
  console.error(`FAIL: ${count} combinations, ${failures.length} failing combinations`);
  for(const f of failures) console.error(`${f.theme}/${f.shape}/${f.size}/quote:${f.quote}/extra:${f.extra}: ${f.issues.join(' | ')}`);
  process.exitCode=1;
} else console.log(`PASS: ${count} combinations, 0 overlaps`);
