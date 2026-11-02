// Measure signature layouts on the production renderer; all inputs are fictional.
import { writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
import { shapes, sizePresets, widgetHeight, widgetWidth } from '../../app/src/sizing.js';
const b=await browser();
const rows=[];
try {
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  for(const shape of shapes) for(const theme of themes) for(const sizePreset of Object.keys(sizePresets)) for(const count of [1,2,3,4,5,6]) for(const appearance of ['dark','light']) for(const page of (shape==='square'&&count>4?[0,1]:[0])) {
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
        check(bottomSpace<=cr.height*.25+1,'Card content bottom space >25%');
        if(theme==='brutalist') {
          const ratio=parseFloat(getComputedStyle(card.querySelector('.window-top b')).fontSize)/parseFloat(s.fontSize);
          metrics.displayRatio=ratio;check(ratio>=2.2,'Brutalist display size');
          check(getComputedStyle(card.querySelector('.window-top')).textTransform==='uppercase','Uppercase quota label');
        }
        if(shape==='portrait'&&['brutalist','circular-rings'].includes(theme)) {
          check(getComputedStyle(list).gridTemplateColumns.split(' ').length===2,'Two provider columns');
          if(cards.length>1)check(Math.abs(rect(cards[0]).top-rect(cards[1]).top)<1&&rect(cards[1]).left>rect(cards[0]).right-1,'Providers must share a row');
        }
        if(theme==='circular-rings') {
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
        if(shape==='portrait'&&theme==='compact-strip')check(getComputedStyle(list).flexDirection==='row','Horizontal strip');
      }
      if(shape!=='portrait') for(const el of document.querySelectorAll('.widget *')) {
        if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||!el.getClientRects().length)continue;
        const r=rect(el);if(!r.width||!r.height)continue;
        check(parseFloat(getComputedStyle(el).fontSize)>=9,'Text below 9px');
      }
      if(shape==='square'&&cards.length%2===1) {
        const last=cards.at(-1),lr=rect(last),pr=rect(list);
        check(Math.abs(lr.width-pr.width)<2,'Odd square card must fill row');
        if(theme==='circular-rings') {
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
    rows.push({shape,theme,sizePreset,count,page,appearance,...result});
  }
  const failures=rows.filter(r=>r.failures.length);
  await writeFile('docs/tools/theme-identity-results.json',JSON.stringify({rows,failures},null,2)+'\n');
  console.log(`${rows.length} theme/size/provider/appearance combinations; ${failures.length} identity failures`);
  if(failures.length){console.table(failures);process.exitCode=1;}
} finally {await b.close();}
