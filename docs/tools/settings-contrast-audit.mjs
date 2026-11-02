// Imported by contrast-audit.mjs. All content is synthetic local preview data.
export async function auditSettings(b) {
  const total={combinations:0,texts:0,failures:[]};
  for(const scheme of ['light','dark'])for(const hostile of [false,true]) {
    await b.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
    await b.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:680,deviceScaleFactor:1,mobile:false});
    await b.navigate('/?settings&sample','window.__SETTINGS_READY__');
    const result=await b.evaluate(`(async()=>{
      const hostile=${hostile};
      if(hostile) {
        // Substitute CSS system keywords before computing styles, simulating
        // GTK's light ButtonFace paired with white ButtonText on dark Canvas.
        // This also catches reintroduction of keywords in authored CSS.
        const colors={ButtonFace:'#c0c0c0',ButtonText:'#ffffff',Canvas:'#1e1e1e',CanvasText:'#eeeeee',Highlight:'#3584e4',HighlightText:'#ffffff',GrayText:'#aaaaaa'};
        const replace=value=>value.replace(/\\b(ButtonFace|ButtonText|CanvasText|Canvas|HighlightText|Highlight|GrayText)\\b/gi,m=>colors[Object.keys(colors).find(k=>k.toLowerCase()===m.toLowerCase())]);
        const style=document.createElement('style');style.textContent=':where(button,input,select,option){background:ButtonFace;color:ButtonText}';document.head.prepend(style);
        const rewrite=rules=>{for(const rule of rules){if(rule.cssRules)rewrite(rule.cssRules);if(rule.style)for(const key of [...rule.style]){const value=rule.style.getPropertyValue(key),next=replace(value);if(next!==value)rule.style.setProperty(key,next,rule.style.getPropertyPriority(key));}}};
        for(const sheet of document.styleSheets)rewrite(sheet.cssRules);
        for(const el of document.querySelectorAll('[style]'))for(const key of [...el.style])el.style.setProperty(key,replace(el.style.getPropertyValue(key)));
        if(style.sheet.cssRules[0].style.backgroundColor!=='rgb(192, 192, 192)')throw Error('Hostile system color fixture inactive');
      }
      const rgb=s=>{const c=document.createElement('canvas').getContext('2d',{willReadFrequently:true});c.fillStyle=s;c.fillRect(0,0,1,1);const a=[...c.getImageData(0,0,1,1).data];return [...a.slice(0,3),a[3]/255]};
      const lum=c=>c.slice(0,3).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const failures=[];let texts=0,combinations=0,disabled=0;
      for(const category of document.querySelectorAll('[data-category]')) {
        category.click();
        // The browser has no native platform bridge. Expose the Linux-specific
        // controls as a synthetic layer-shell fixture so they are audited too.
        if(category.dataset.category==='desktop'){document.querySelector('#desktop-layer').hidden=false;document.querySelector('#desktop-layer-unavailable').hidden=true;}
        // Audit both clean (disabled Revert) and dirty controls, including hover.
        for(const state of ['clean','dirty','hover']) {
          document.querySelector('#revert').click();
          if(state!=='clean'){const range=document.querySelector('#scale');range.value=125;range.dispatchEvent(new Event('input'));}
          if(document.querySelector('#revert').disabled!==(state==='clean'))throw Error('Revert disabled state mismatch');
          let hover;
          if(state==='hover'){hover=document.createElement('style');hover.textContent='button:not(:disabled):not(.primary):not([aria-selected=true]){background:var(--hover)}';document.head.append(hover);}
          combinations++;
          await document.fonts.ready;
          for(const el of document.querySelectorAll('body *')) {
            if(!([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||el.matches('select,input:not([type=checkbox]):not([type=range]):not([type=color])')))continue;
            if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden'||el.closest('[hidden]')||el.tagName==='OPTION')continue;
            const layers=[];let opacity=1;
            for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);layers.unshift(rgb(s.backgroundColor));opacity*=Number(s.opacity);}
            let bg=[128,128,128];for(const c of layers)bg=bg.map((v,i)=>c[i]*c[3]+v*(1-c[3]));
            const style=getComputedStyle(el),fg=rgb(style.color),alpha=fg[3]*opacity,ink=fg.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));
            const ratio=(Math.max(lum(ink),lum(bg))+.05)/(Math.min(lum(ink),lum(bg))+.05),off=el.matches(':disabled')||!!el.closest(':disabled'),threshold=off?3:4.5;
            texts++;if(off)disabled++;
            if(ratio<threshold)failures.push({category:category.dataset.category,state,text:el.textContent.trim().slice(0,50)||el.id,ratio:+ratio.toFixed(3),threshold});
          }
          hover?.remove();
        }
      }
      if(!disabled)throw Error('No disabled controls audited');
      return {combinations,texts,failures};
    })()`);
    total.combinations+=result.combinations;total.texts+=result.texts;total.failures.push(...result.failures.map(f=>({scheme,hostile,...f})));
  }
  console.log(`Settings: ${total.combinations} combinations, ${total.texts} texts, ${total.failures.length} below threshold`);
  return total;
}
