// Additional production-DOM contracts for explicit layout and reduced motion.
export async function auditLayoutVariants(b) {
 return b.evaluate(`(async()=>{
  const api=window.__AI_USAGE_DEMO__,failures=[];
  const check=(ok,message)=>{if(!ok)failures.push(message)};
  const providers=['claude','codex','gemini'].map((id,i)=>({id,state:'OK',windows:[{kind:'session',used_percent:[20,90,60][i]},{kind:'weekly',used_percent:30}]}));
  for(const theme of api.themes)for(const shape of ['portrait','landscape','square','circle','pill']){
   await api.setSettings({theme:theme.id,shape,sizePreset:'Medium',fineTune:100,providerOrder:['gemini','codex','claude'],hiddenProviders:[],widgetProviders:['claude','codex','gemini'],featuredProvider:'claude',featuredPosition:'top'});
   await api.setSnapshot({providers});
   if(shape==='circle')check(document.querySelector('.dial-name').textContent==='Claude','Explicit circle featured');
   if(['portrait','square'].includes(shape)){
    const hero=shape==='square'?document.querySelector('.provider-card'):document.querySelector('.featured-provider');check(hero?.dataset.provider==='claude'&&hero===hero.parentNode.firstElementChild,'Top featured '+theme.id+' '+shape);
    await api.setSettings({featuredPosition:'bottom'});check(document.querySelector('.provider-card:last-child')?.dataset.provider==='claude','Bottom featured');
   }
   await api.setSettings({featuredProvider:'none'});check(!document.querySelector('.featured-provider'),'None featured');
   if(shape==='circle')check(document.querySelector('.dial-number').textContent==='—','None circle center');
   await api.setSettings({featuredProvider:'auto'});
   if(shape==='circle')check(document.querySelector('.dial-name').textContent==='Codex','Auto circle featured');
   await api.setSettings({hiddenProviders:['codex']});
   check(shape==='circle'?document.querySelectorAll('.dial-value').length===2:![...document.querySelectorAll('.provider-card')].some(el=>el.dataset.provider==='codex'),'Hide provider');
  }
  await api.setSettings({theme:'reactor',shape:'circle',reactorMotion:false,hiddenProviders:[],providerOrder:[]});
  check(getComputedStyle(document.querySelector('.reactor-core')).animationName==='none','Motion off by default');
  await api.setSettings({reactorMotion:true});
  check(getComputedStyle(document.querySelector('.reactor-core')).animationName==='reactor-breathe','Motion opt-in');
  await api.setSettings({reactorMotion:false});
  return failures;
 })()`);
}
