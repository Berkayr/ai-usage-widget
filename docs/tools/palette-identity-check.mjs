// Palette changes must preserve each theme's structural signature.
export async function auditPaletteIdentity(b) {
  const total = {combinations:0,failures:[]};
  const themes = await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>({id:t.id,palettes:Object.keys(t.palettes)}))');
  for (const theme of themes) for (const shape of ['portrait','landscape','square','circle','pill']) {
    const result = await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__, failures=[];
      await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:64},{kind:'weekly',used_percent:80}]}))});
      const signature=()=>[...document.querySelectorAll('.provider-card,.meter,.dot-bar,.ring-display,.dial-value,.dial-number,.segments,.pace')].map(el=>{const s=getComputedStyle(el);return [el.className.baseVal??el.className,s.fontFamily,s.fontWeight,s.borderRadius,s.strokeWidth,s.strokeLinecap,el.getAttribute('stroke-dasharray')];});
      let count=0; const baselines = new Map();
      for(const palette of ${JSON.stringify(theme.palettes)})for(const appearance of ['dark','light'])for(const colorMode of ['calm','vivid','mono']){
        await api.setSettings({theme:${JSON.stringify(theme.id)},shape:${JSON.stringify(shape)},palette,appearance,colorMode,quoteEnabled:false,sizePreset:'Medium',fineTune:100});
        const value=JSON.stringify(signature()), key=appearance+':'+colorMode;
        if(!baselines.has(key))baselines.set(key,value);
        if(value!==baselines.get(key))failures.push({palette,appearance,colorMode,message:'Palette changed theme structure'});
        if(!document.querySelector('.provider-card,.dial-value'))failures.push({palette,message:'Missing renderer'});
        count++;
      }
      return {combinations:count,failures};
    })()`);
    total.combinations += result.combinations;
    total.failures.push(...result.failures.map(f=>({theme:theme.id,shape,...f})));
  }
  await b.evaluate(`window.__AI_USAGE_DEMO__.setSettings({theme:'system',shape:'portrait',palette:'default',appearance:'dark',colorMode:'calm',sizePreset:'Medium',fineTune:100})`);
  console.log(`${total.combinations} palette/theme/shape/appearance/mode identity combinations; ${total.failures.length} failures`);
  return total;
}
