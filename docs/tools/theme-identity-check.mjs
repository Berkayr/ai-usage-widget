import {pairwise} from './pairwise.mjs';
import {auditPaletteIdentity} from './palette-identity-check.mjs';
import { auditLayoutVariants } from './layout-variants.mjs';
import { auditQuotes } from './quote-check.mjs';
// Measure signature layouts on the production renderer; all inputs are fictional.
import { writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
import { shapes, sizePresets, widgetHeight, widgetWidth } from '../../app/src/sizing.js';
const b=await browser();
const rows=[],circleCaptures=[],similarityWarnings=[];
try {
  await b.cdp('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  const palettes = await auditPaletteIdentity(b); if(palettes.failures.length) { console.table(palettes.failures); process.exitCode=1; }
  const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  for(const theme of themes) for(const {shape,sizePreset,count,appearance} of pairwise({shape:shapes.filter(s=>!process.env.AUDIT_SHAPES||process.env.AUDIT_SHAPES.split(',').includes(s)),sizePreset:Object.keys(sizePresets),count:[1,2,3,4,5,6],appearance:['dark','light']})) for(const page of (shape==='square'&&count>4?[0,1]:[0])) {
    const settings={shape,theme,sizePreset,fineTune:100,fitHeight:true,appearance};
    const scale=sizePresets[sizePreset]/100;
    await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(widgetWidth(settings,count)*scale),height:Math.ceil(widgetHeight(settings,count)*scale)+10,deviceScaleFactor:1,mobile:false});
    const result=await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__;
      await api.setSettings(${JSON.stringify(settings)});
      await api.setSnapshot({providers:Array.from({length:${count}},(_,i)=>({id:['claude','codex','gemini'][i%3],plan:'DEMO',state:'OK',windows:[{kind:'session',used_percent:i%2?34:100,resets_at:new Date(Date.now()+9600000).toISOString()},{kind:'weekly',used_percent:62,resets_at:new Date(Date.now()+144000000).toISOString()}]}))});
      if (document.querySelectorAll('.shape-pages button').length) {document.querySelectorAll('.shape-pages button')[${page}].click();await new Promise(r=>requestAnimationFrame(r));}
      await document.fonts.ready;
      const shape=${JSON.stringify(shape)},theme=${JSON.stringify(theme)},failures=[],metrics={};
      if(['circle','pill'].includes(shape)) {
        const shell=document.querySelector('.widget').getBoundingClientRect(),cx=shell.left+shell.width/2,cy=shell.top+shell.height/2,radius=shell.width/2;
        const check=(ok,msg)=>{if(!ok)failures.push(msg)};
        check(document.querySelectorAll(shape==='circle'?'.dial-arc-label':'.provider-card').length===(shape==='circle'&&${count}===1?2:Math.min(3,${count})),'Selected provider count');
        const walker=document.createTreeWalker(document.querySelector('.widget'),NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node=walker.currentNode,el=node.parentElement;
          if(!node.textContent.trim())continue;
          const range=document.createRange();range.selectNodeContents(node);
          for(const r of range.getClientRects()) {
            if(!r.width||!r.height)continue;
            check(parseFloat(getComputedStyle(el).fontSize)>=9,'Text below 9px');
            check(r.left>=shell.left-1&&r.right<=shell.right+1&&r.top>=shell.top-1&&r.bottom<=shell.bottom+1,'Text outside shell');
            if(shape==='circle'&&el.closest('.dial-safe')) {const half=shell.width/(2*Math.SQRT2);check(r.left>=cx-half&&r.right<=cx+half&&r.top>=cy-half&&r.bottom<=cy+half,'Text outside inner square');}
            if(shape==='circle') for(const x of [r.left,r.right])for(const y of [r.top,r.bottom])check(Math.hypot(x-cx,y-cy)<=radius+1,'Text outside circle');
            else for(const x of [r.left,r.right])for(const y of [r.top,r.bottom]) {const end=Math.max(shell.left+shell.height/2,Math.min(x,shell.right-shell.height/2));check(Math.hypot(x-end,y-cy)<=shell.height/2+1,'Text outside pill');}
          }
        }
        for(const el of document.querySelectorAll(shape==='circle'?'.dial-safe>*':'.provider-card'))check(el.scrollWidth<=el.clientWidth+2&&el.scrollHeight<=el.clientHeight+2,'Content overflow');
        if(shape==='circle') {check(document.querySelectorAll('.dial-track').length===(${count}===1?2:Math.min(3,${count})),'Dial tracks');check(document.querySelector('.dial-number').textContent==='100%','Highest usage');}
        if(shape==='circle') {
          const value=document.querySelector('.dial-value'),pattern=document.querySelector('.dial-pattern'),number=document.querySelector('.dial-number');
          const expected={reactor:[9,'butt','9 1',600],system:[6,'round',null,800],brutalist:[12,'butt',null,900],'circular-rings':[13,'round',null,700],'dot-matrix':[7,'round','.1 3',800],'retro-lcd':[9,'butt','1.3 .7',500],terminal:[4,'butt','1 1',400],'frosted-glass':[8,'round',null,800],'minimal-pace':[2,'butt',null,300],'compact-strip':[5,'square',null,800]}[theme];
          metrics.circleSignature={width:parseFloat(getComputedStyle(value).strokeWidth),cap:getComputedStyle(value).strokeLinecap,pattern:pattern.getAttribute('stroke-dasharray'),weight:Number(getComputedStyle(number).fontWeight)};
          check(JSON.stringify(Object.values(metrics.circleSignature))===JSON.stringify(expected),'Circle theme signature');
          check(!document.querySelector('.dial-legend'),'Center list removed');
          const textBoxes=[];
          const walker=document.createTreeWalker(document.querySelector('.widget'),NodeFilter.SHOW_TEXT);
          while(walker.nextNode()){const n=walker.currentNode;if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);for(const r of range.getClientRects())if(r.width&&r.height)textBoxes.push(r);}
          for(let i=0;i<textBoxes.length;i++)for(let j=i+1;j<textBoxes.length;j++){const a=textBoxes[i],b=textBoxes[j];check(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=.5||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=.5,'Circle text boxes intersect');}
          check(getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.documentElement).backgroundColor==='rgba(0, 0, 0, 0)','Transparent circle canvas');
        } else {
          const large=document.documentElement.dataset.largeShape==='true';
          check([...document.querySelectorAll('.window-bottom')].every(el=>large||!el.getClientRects().length),'Pill hides resets before plans');
          check([...document.querySelectorAll('.plan')].every(el=>!el.getClientRects().length),'Pill spends space on both quota windows instead of plans');
          // Text ranges catch glyph collisions even if flex wrappers look separated.
          for(const card of document.querySelectorAll('.provider-card')) {
            const texts=[],walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
            while(walker.nextNode()) {if(!walker.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(walker.currentNode);for(const box of r.getClientRects())if(box.width&&box.height)texts.push(box);}
            for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++) {
              const a=texts[i],b=texts[j];check(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=.5||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=.5,'Pill text boxes intersect');
            }
            for(const top of card.querySelectorAll('.window-top')) {const label=top.querySelector('span'),value=top.querySelector('b');if(label.getClientRects().length)check(value.getBoundingClientRect().left-label.getBoundingClientRect().right>=3.5,'Pill label/value gap');}
          }
        }
        return {metrics,failures};
      }

      const check=(ok,message)=>{if(!ok)failures.push(message)};
      const rect=el=>el.getBoundingClientRect();
      const cards=[...document.querySelectorAll('.provider-card')];
      const widget=rect(document.querySelector('.widget'));
      const list=document.querySelector('.provider-list');
      check(cards.length===(shape==='square'?Math.min(4,${count}-${page}*4):${count}),'Provider count');
      // Measure painted content, not stretched layout wrappers: text ranges and
      // actual meters/rings. Padding and borders count towards trailing space.
      const contentBottom=card=>{
        const bottoms=[];
        const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node=walker.currentNode;
          if(!node.textContent.trim())continue;
          const range=document.createRange();range.selectNodeContents(node);
          for(const r of range.getClientRects())if(r.width&&r.height)bottoms.push(r.bottom);
        }
        for(const el of card.querySelectorAll('.meter,.segments,.dot-bar,.ring-display')) {
          const r=rect(el);if(r.width&&r.height)bottoms.push(r.bottom);
        }
        return Math.max(rect(card).top,...bottoms);
      };
      metrics.maxCardBottomSpaceRatio=0;
      for(const card of cards) {
        const cr=rect(card),s=getComputedStyle(card);
        check(card.scrollWidth<=card.clientWidth+2,'Card horizontal overflow');
        check(card.scrollHeight<=card.clientHeight+2,'Card vertical overflow');
        check(cr.left>=widget.left&&cr.right<=widget.right+1&&cr.bottom<=widget.bottom+1,'Card outside shell');
        const windows=card.querySelector('.windows');
        const bottomSpace=Math.max(0,cr.bottom-contentBottom(card));
        const ratio=bottomSpace/cr.height;
        metrics.maxCardBottomSpaceRatio=Math.max(metrics.maxCardBottomSpaceRatio,ratio);
        if(shape==='square') {
          check(getComputedStyle(list).gridTemplateColumns.split(' ').length===1,'Square full-width rows');
          check(!card.querySelector('.ring-display')?.getClientRects().length,'Square hides decorative rings');
          for(const q of card.querySelectorAll('.quota-window')) {
            const top=rect(q.querySelector('.window-top')),meter=rect(q.querySelector('.meter,.segments,.dot-bar')),qr=rect(q);
            check(Math.abs((top.top+meter.bottom)/2-(qr.top+qr.bottom)/2)<2,'Square centers quota text and meter');
          }
        } else check(bottomSpace<=cr.height*.25+1,'Card content bottom space >25%');
        if(theme==='brutalist'&&shape!=='square') {
          const ratio=parseFloat(getComputedStyle(card.querySelector('.window-top b')).fontSize)/parseFloat(s.fontSize);
          metrics.displayRatio=ratio;check(ratio>=2.2,'Brutalist display size');
          check(getComputedStyle(card.querySelector('.window-top')).textTransform==='uppercase','Uppercase quota label');
        }
        if(shape==='portrait'&&['brutalist','circular-rings'].includes(theme)) {
          check(getComputedStyle(list).gridTemplateColumns.split(' ').length===2,'Two provider columns');
          if(cards.length>1)check(Math.abs(rect(cards[0]).top-rect(cards[1]).top)<1&&rect(cards[1]).left>rect(cards[0]).right-1,'Providers must share a row');
        }
        if(theme==='circular-rings'&&shape!=='square') {
          const ring=card.querySelector('.ring-display'),r=rect(ring);
          metrics.ringRatio=r.width/cr.width;
          const svg=rect(ring.querySelector('svg'));
          check(shape==='portrait'?r.width>=cr.width*.45:Math.min(svg.width,svg.height)>=Math.min(cr.width,cr.height)*.55,'Large ring');
          if(shape==='portrait')check(Math.abs(r.width-r.height)<1,'Round ring');
          check(rect(card.querySelector('.ring-center strong')).width>0,'Visible ring percentage');
          check(card.querySelectorAll('.ring-track').length===2,'Concentric window rings');
          const tracks=[...ring.querySelectorAll('.ring-track')];
          const radius=(Math.min(...tracks.map(t=>t.r.baseVal.value))-parseFloat(getComputedStyle(tracks[0]).strokeWidth)/2)*Math.min(svg.width,svg.height)/160;
          const cx=svg.left+svg.width/2,cy=svg.top+svg.height/2;
          for(const text of card.querySelectorAll('.ring-center strong,.ring-center small')) {
            const tr=rect(text);if(!tr.width||!tr.height)continue;
            const farthest=Math.hypot(Math.max(Math.abs(tr.left-cx),Math.abs(tr.right-cx)),Math.max(Math.abs(tr.top-cy),Math.abs(tr.bottom-cy)));
            metrics.maxRingTextRadiusRatio=Math.max(metrics.maxRingTextRadiusRatio||0,farthest/radius);
            check(farthest<=radius+.5,'Ring center text outside inner circle');
          }
        }
        if(['frosted-glass','retro-lcd'].includes(theme)) {
          const q=[...windows.children].map(rect);
          check(q.length===2&&Math.abs(q[0].top-q[1].top)<1&&q[1].left>=q[0].right,'Two quota columns');
          check(getComputedStyle(windows).gridTemplateColumns.split(' ').length===2,'Quota grid');
        }
        if(theme==='system')check(card.querySelectorAll('.meter').length===2,'Continuous meters');
        if(theme==='dot-matrix')check(card.querySelectorAll('.dot-bar').length===2,'Dot meters');
        if(theme==='minimal-pace')check(card.querySelectorAll('.pace').length===2,'Pace labels');
        if(shape==='strip')check(getComputedStyle(list).flexDirection==='row','Horizontal strip');
      }
      if(shape!=='portrait') for(const el of document.querySelectorAll('.widget *')) {
        if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||!el.getClientRects().length)continue;
        const r=rect(el);if(!r.width||!r.height)continue;
        check(parseFloat(getComputedStyle(el).fontSize)>=9,'Text below 9px');
      }
      if(shape==='square'&&cards.length%2===1) {
        const last=cards.at(-1),lr=rect(last),pr=rect(list);
        check(Math.abs(lr.width-pr.width)<2,'Odd square card must fill row');
        if(theme==='circular-rings'&&shape!=='square') {
          const ring=rect(last.querySelector('.ring-display')),secondary=rect(last.querySelector('.quota-window:last-child'));
          check(secondary.width>0&&secondary.left>=ring.right-1,'Odd square ring and secondary metric side by side');
        } else {
          const q=[...last.querySelectorAll('.quota-window')].map(rect);
          check(q.length===2&&q[0].width>0&&q[1].width>0&&Math.abs(q[0].top-q[1].top)<1&&q[1].left>=q[0].right-1,'Odd square metrics side by side');
        }
      }
      const listRect=rect(list);
      const lastCardBottom=Math.max(...cards.map(card=>rect(card).bottom));
      const listBottomSpace=Math.max(0,listRect.bottom-lastCardBottom);
      metrics.listBottomSpaceRatio=listBottomSpace/rect(cards.at(-1)).height;
      check(listBottomSpace<=rect(cards.at(-1)).height*.25+1,'Space below last card >25%');
      if(theme==='terminal') {
        for(const name of ['header','footer']) {
          const el=document.querySelector('.'+name),r=rect(el),s=getComputedStyle(el);
          check(r.left>=widget.left&&r.right<=widget.right&&r.top>=widget.top&&r.bottom<=widget.bottom,'Terminal frame bounds');
          check(s.borderLeftWidth==='0px'&&s.borderRightWidth==='0px','Terminal side borders');
          for(const text of el.querySelectorAll('span,button,.app-title')) {
            const range=document.createRange();range.selectNodeContents(text);
            for(const tr of range.getClientRects())check(tr.left>=r.left-1&&tr.right<=r.right+1&&tr.top>=r.top+parseFloat(s.borderTopWidth)-1&&tr.bottom<=r.bottom-parseFloat(s.borderBottomWidth)+1,'Terminal text crosses frame');
          }
        }
      }
      return {metrics,failures};
    })()`);
    if(shape==='circle'&&sizePreset==='Medium'&&count===3&&appearance==='dark') {
      const png=await b.cdp('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:340,height:340,scale:1}});
      circleCaptures.push({theme,data:png.data,signature:result.metrics.circleSignature});
    }
    rows.push({shape,theme,sizePreset,count,page,appearance,...result});
  }
  // Endpoint labels must remain collision-free at nearby and boundary usages.
  for(const theme of themes)for(const sizePreset of Object.keys(sizePresets))for(const appearance of ['dark','light'])for(const values of [[30,31,32],[0,0,0],[99,100,100]]) {
    const result=await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__;await api.setSettings({shape:'circle',theme:${JSON.stringify(theme)},sizePreset:${JSON.stringify(sizePreset)},fineTune:100,appearance:${JSON.stringify(appearance)}});
      await api.setSnapshot({providers:['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:${JSON.stringify(values)}[i]}]}))});await document.fonts.ready;
      const labels=[...document.querySelectorAll('.dial-arc-label')],failures=[];
      if(labels.length!==3)failures.push('Missing endpoint labels');
      const boxes=labels.map(el=>el.getBoundingClientRect()),shell=document.querySelector('.widget').getBoundingClientRect(),cx=shell.left+shell.width/2,cy=shell.top+shell.height/2;
      const center=[];
      for(const el of document.querySelectorAll('.dial-safe>*'))for(const n of el.childNodes)if(n.nodeType===3&&n.textContent.trim()) {
        const range=document.createRange();range.selectNodeContents(n);center.push(...range.getClientRects());
      }
      for(let i=0;i<boxes.length;i++){
        const a=boxes[i];
        for(const x of [a.left,a.right])for(const y of [a.top,a.bottom])if(Math.hypot(x-cx,y-cy)>shell.width/2+1)failures.push('Badge outside circle');
        for(const b of [...boxes.slice(i+1),...center])if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)failures.push('Endpoint label collision');
      }
      return {failures};
    })()`);
    rows.push({shape:'circle',theme,sizePreset,appearance,values,...result});
  }
  // Compare actual rendered pixels as well as structural signatures.
  for(let i=0;i<circleCaptures.length;i++)for(let j=i+1;j<circleCaptures.length;j++) {
    const a=circleCaptures[i],c=circleCaptures[j];
    const difference=await b.evaluate(`(async()=>{
      const pixels=async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=340;canvas.height=340;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,340,340).data;};
      const a=await pixels(${JSON.stringify(a.data)}),b=await pixels(${JSON.stringify(c.data)});let sum=0;for(let k=0;k<a.length;k++)sum+=Math.abs(a[k]-b[k]);return sum/a.length;
    })()`);
    if(difference<3)similarityWarnings.push({themes:[a.theme,c.theme],meanChannelDifference:difference});
  }
  if(similarityWarnings.length)console.warn('Visually similar circles:',similarityWarnings);
  const failures=rows.filter(r=>r.failures.length);
  await writeFile('docs/tools/theme-identity-results.json',JSON.stringify({rows,failures,similarityWarnings},null,2)+'\n');
  console.log(`${rows.length} theme/size/provider/appearance combinations; ${failures.length} identity failures`);
  if(failures.length){console.table(failures);process.exitCode=1;}
  const layoutFailures=await auditLayoutVariants(b);console.log('Layout variants:',layoutFailures);if(layoutFailures.length)process.exitCode=1;
  await b.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.evaluate(`(async()=>{await window.__AI_USAGE_DEMO__.setSettings({theme:'reactor',shape:'circle',reactorMotion:true});if(getComputedStyle(document.querySelector('.reactor-core')).animationName!=='none')throw Error('Reduced motion');await window.__AI_USAGE_DEMO__.setSettings({reactorMotion:false});})()`);
  await b.cdp('Emulation.setEmulatedMedia',{features:[]});
  await auditQuotes(b);
} finally { await b.close(); }
