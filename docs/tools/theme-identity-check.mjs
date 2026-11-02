// Measure signature layouts on the production renderer; all inputs are fictional.
import { writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
import { sizePresets, widgetHeight, widgetWidth } from '../../app/src/sizing.js';
const b=await browser();
const rows=[];
try {
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
  for(const theme of themes) for(const sizePreset of Object.keys(sizePresets)) for(const count of [1,2,3,5,6]) for(const appearance of ['dark','light']) {
    const settings={theme,sizePreset,fineTune:100,fitHeight:true,appearance};
    const scale=sizePresets[sizePreset]/100;
    await b.cdp('Emulation.setDeviceMetricsOverride',{width:Math.round(widgetWidth(settings,count)*scale),height:Math.ceil(widgetHeight(settings,count)*scale)+10,deviceScaleFactor:1,mobile:false});
    const result=await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__;
      await api.setSettings(${JSON.stringify(settings)});
      await api.setSnapshot({providers:Array.from({length:${count}},(_,i)=>({id:['claude','codex','gemini'][i%3],plan:'DEMO',state:'OK',windows:[{kind:'session',used_percent:34,resets_at:new Date(Date.now()+9600000).toISOString()},{kind:'weekly',used_percent:62,resets_at:new Date(Date.now()+144000000).toISOString()}]}))});
      await document.fonts.ready;
      const theme=${JSON.stringify(theme)},failures=[],metrics={};
      const check=(ok,message)=>{if(!ok)failures.push(message)};
      const rect=el=>el.getBoundingClientRect();
      const cards=[...document.querySelectorAll('.provider-card')];
      const widget=rect(document.querySelector('.widget'));
      const list=document.querySelector('.provider-list');
      check(cards.length===${count},'Provider count');
      for(const card of cards) {
        const cr=rect(card),s=getComputedStyle(card);
        check(card.scrollWidth<=card.clientWidth+2,'Card horizontal overflow');
        check(card.scrollHeight<=card.clientHeight+2,'Card vertical overflow');
        check(cr.left>=widget.left&&cr.right<=widget.right+1&&cr.bottom<=widget.bottom+1,'Card outside shell');
        const windows=card.querySelector('.windows');
        if(theme==='brutalist') {
          const ratio=parseFloat(getComputedStyle(card.querySelector('.window-top b')).fontSize)/parseFloat(s.fontSize);
          metrics.displayRatio=ratio;check(ratio>=2.2,'Brutalist display size');
          check(getComputedStyle(card.querySelector('.window-top')).textTransform==='uppercase','Uppercase quota label');
        }
        if(['brutalist','circular-rings'].includes(theme)) {
          check(getComputedStyle(list).gridTemplateColumns.split(' ').length===2,'Two provider columns');
          if(cards.length>1)check(Math.abs(rect(cards[0]).top-rect(cards[1]).top)<1&&rect(cards[1]).left>rect(cards[0]).right-1,'Providers must share a row');
        }
        if(theme==='circular-rings') {
          const ring=card.querySelector('.ring-display'),r=rect(ring);
          metrics.ringRatio=r.width/cr.width;
          check(r.width>=cr.width*.45,'Ring diameter >=45% of card');
          check(Math.abs(r.width-r.height)<1,'Round ring');
          check(rect(card.querySelector('.ring-center strong')).width>0,'Visible ring percentage');
          check(card.querySelectorAll('.ring-track').length===2,'Concentric window rings');
        }
        if(['frosted-glass','retro-lcd'].includes(theme)) {
          const q=[...windows.children].map(rect);
          check(q.length===2&&Math.abs(q[0].top-q[1].top)<1&&q[1].left>=q[0].right,'Two quota columns');
          check(getComputedStyle(windows).gridTemplateColumns.split(' ').length===2,'Quota grid');
        }
        if(theme==='system')check(card.querySelectorAll('.meter').length===2,'Continuous meters');
        if(theme==='dot-matrix')check(card.querySelectorAll('.dot-bar').length===2,'Dot meters');
        if(theme==='minimal-pace')check(card.querySelectorAll('.pace').length===2,'Pace labels');
        if(theme==='compact-strip')check(getComputedStyle(list).flexDirection==='row','Horizontal strip');
      }
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
    rows.push({theme,sizePreset,count,appearance,...result});
  }
  const failures=rows.filter(r=>r.failures.length);
  await writeFile('docs/tools/theme-identity-results.json',JSON.stringify({rows,failures},null,2)+'\n');
  console.log(`${rows.length} theme/size/provider/appearance combinations; ${failures.length} identity failures`);
  if(failures.length){console.table(failures);process.exitCode=1;}
} finally {await b.close();}
