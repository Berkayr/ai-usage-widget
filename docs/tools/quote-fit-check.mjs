// Offline production-renderer matrix. All quotes/providers are fictional.
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browser} from './browser-harness.mjs';
import {shapes, sizePresets, widgetWidth, widgetHeight} from '../../app/src/sizing.js';

const b = await browser();
let count = 0, truncated = 0;
try {
  // Block external requests, including accidental fixture regressions.
  await b.cdp('Network.enable');
  await b.cdp('Network.setBlockedURLs', {urls:['https://*','http://en.wikiquote.org/*']});
  await b.navigate('/?sample', 'window.__AI_USAGE_DEMO__');
  const themes = await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  for (const theme of themes.filter(t=>!process.env.AUDIT_THEMES || process.env.AUDIT_THEMES.split(',').includes(t))) for (const shape of shapes) for (const sizePreset of Object.keys(sizePresets)) {
    const settings = {theme,shape,sizePreset,fineTune:100,quoteEnabled:true,quoteNavigation:true,fitHeight:true};
    const scale = sizePresets[sizePreset] / 100;
    await b.cdp('Emulation.setDeviceMetricsOverride', {width:Math.round(widgetWidth(settings,3)*scale),height:Math.ceil(widgetHeight(settings,3)*scale)+10,deviceScaleFactor:1,mobile:false});
    const result = await b.evaluate(`(async()=>{
      const api = window.__AI_USAGE_DEMO__;
      await api.setSettings(${JSON.stringify(settings)});
      await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:34},{kind:'weekly',used_percent:62}]}))});
      const frame = () => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const rect = el => el.getBoundingClientRect();
      let truncated = 0, count = 0;
      for (const appearance of ['dark','light']) for (const length of [40,200,600,2000]) {
        await api.setSettings({appearance});
        const quote = 'Fictional words about quiet thought and patient work. '.repeat(40).slice(0,length);
        const card = {quote,author:'Example Author',work:'An Invented Book (1933)',author_description:'Fictional essayist',reason:'A fictional daily selection',source_url:'https://en.wikiquote.org/wiki/Example'};
        await api.setQuote({status:'ok',cards:[card,{...card,quote:'Another fictional quote.'}]});
        await document.fonts.ready; await frame();
        if (['square','circle'].includes(${JSON.stringify(shape)}) && document.documentElement.dataset.quotePage !== 'true') {
          document.querySelector('.quote-toggle').click(); await frame();
        }
        if (${JSON.stringify(shape)} === 'strip') {
          if (!document.querySelector('#quote').hidden || document.querySelector('#quote').children.length) throw Error('Strip quote must be hidden');
          count++; continue;
        }
        const shell = rect(document.querySelector('#widget'));
        const fail = message => {throw Error(${JSON.stringify(`${theme}/${shape}/${sizePreset}`)}+'/'+appearance+'/'+length+': '+message)};
        if (${JSON.stringify(shape)} === 'pill') {
          document.querySelector('.quote-toggle').click();
        } else {
          const text = document.querySelector('.quote-text'), content = document.querySelector('.quote-content');
          if (text.scrollHeight > text.clientHeight || text.scrollWidth > text.clientWidth) fail('text overflow');
          if (content.scrollHeight > content.clientHeight || content.scrollWidth > content.clientWidth) fail('content overflow');
          const fontSize = parseFloat(getComputedStyle(text).fontSize);
          if (fontSize < (${JSON.stringify(shape)} === 'circle' ? 9 : 11)-.01) fail('font below floor');
          const fittedSize = text.style.fontSize;
          text.style.removeProperty('font-size');
          const originalSize = parseFloat(getComputedStyle(text).fontSize);
          text.style.fontSize = fittedSize;
          if (fontSize > originalSize+.01) fail('text enlarged');
          const shown = text.textContent;
          if (shown !== quote) {
            truncated++;
            if (!shown.endsWith('…')) fail('missing explicit ellipsis');
            const prefix = shown.slice(0,-1);
            if (!quote.startsWith(prefix) || (prefix && !/\\s/.test(quote[prefix.length]||''))) fail('not cut at word boundary');
          }
          if (length === 40 && (shown !== quote || Math.abs(fontSize-originalSize)>.01)) fail('short quote changed');
          const visible = [...content.children].filter(el=>getComputedStyle(el).display!=='none' && !el.hidden);
          const boxes = visible.map(el=>({el,r:rect(el)}));
          for (const {el,r} of boxes) {
            const c = rect(content);
            if (r.left<c.left-1 || r.right>c.right+1 || r.top<c.top-1 || r.bottom>c.bottom+1) fail(el.className+' outside content');
            if (r.left<shell.left-1 || r.right>shell.right+1 || r.top<shell.top-1 || r.bottom>shell.bottom+1) fail('outside widget');
          }
          for (let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
            const a=boxes[i].r,b=boxes[j].r;
            if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) fail(boxes[i].el.className+' overlaps '+boxes[j].el.className);
          }
          const q=rect(document.querySelector('#quote'));
          for(const provider of document.querySelectorAll('.provider-card')) {
            if(getComputedStyle(provider).visibility==='hidden') continue;
            const p=rect(provider);
            if(Math.min(p.right,q.right)-Math.max(p.left,q.left)>1 && Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top)>1) fail('provider overlap');
          }
          text.click();
        }
        const dialog=document.querySelector('.quote-dialog');
        if(!dialog?.open || dialog.querySelector('p').textContent!==quote) fail('full text inaccessible');
        dialog.close();
        const after=rect(document.querySelector('#widget'));
        if(Math.abs(shell.height-after.height)>.1) fail('shell height changed');
        count++;
      }
      return {count,truncated};
    })()`);
    count += result.count; truncated += result.truncated;
    if (sizePreset === '2X-Large' && shape === 'pill') console.log(`${theme}: ${count} cases passed`);
  }
  // Reproduce the reported scale, then resize the same content without a redraw.
  await b.cdp('Emulation.setDeviceMetricsOverride', {width:279,height:786,deviceScaleFactor:1,mobile:false});
  await b.evaluate(`(async()=>{
    const api=window.__AI_USAGE_DEMO__;
    await api.setSettings({theme:'brutalist',shape:'portrait',sizePreset:'Medium',fineTune:82,appearance:'dark'});
    await api.setQuote({status:'ok',cards:[{quote:'Fictional words about quiet thought and patient work. '.repeat(4),author:'Example Author',work:'An Invented Book (1933)',author_description:'Fictional essayist',reason:'A fictional daily selection'}]});
    await document.fonts.ready;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const t=document.querySelector('.quote-text'), c=document.querySelector('.quote-content');
    if(t.textContent.endsWith('…'))throw Error('Reported 200-character case should fit in full');
    c.style.width='65%';
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(t.scrollHeight>t.clientHeight || t.scrollWidth>t.clientWidth)throw Error('Resize overflow');
    c.style.removeProperty('width');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  })()`);
  const png = await b.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  const previewPath = join(tmpdir(), 'ai-usage-quote-fit.png');
  await writeFile(previewPath, Buffer.from(png.data,'base64'));
  console.log(`${count} quote-fit cases passed; ${truncated} explicitly truncated; reported 82% case and resize passed. Preview: ${previewPath}`);
} finally { await b.close(); }
