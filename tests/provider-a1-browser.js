// Run with Playwright's code runner; the app Vite server must be on port 5173.
async (page) => {
  const themes = ['system', 'dot-matrix', 'brutalist', 'circular-rings', 'compact-strip', 'reactor', 'retro-lcd', 'frosted-glass', 'terminal', 'minimal-pace'];
  const shapes = {portrait:[519,1800], landscape:[1200,450], square:[700,700], pill:[1600,300], strip:[1600,400]};
  const failures = [];
  let checks = 0;
  for (const theme of themes) for (const [shape, [width,height]] of Object.entries(shapes)) {
    for (const count of [2,3,4,5]) for (const mode of shape === 'portrait' ? ['', '&fit', '&fit&extra'] : ['']) {
      await page.setViewportSize({width, height:mode ? 900 : height});
      await page.goto(`http://127.0.0.1:5173/_test-providers.html?theme=${theme}&shape=${shape}&count=${count}${mode}`, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.a1Ready, null, {polling:100});
      const result = await page.evaluate(async () => {
        const root = document.querySelector('#providers');
        const {fitUsage} = await import('/usage-fit.js');
        const heights = () => [...root.children].map(c => c.getBoundingClientRect().height);
        const before = heights();
        // Repeated observer passes must converge rather than grow the cards.
        for (let i=0; i<3; i++) fitUsage(root);
        const after = heights();
        return {before, after, logos:root.querySelectorAll('.provider-logo').length,
          text:root.innerText, subscription:!!root.querySelector('.status-badge.no_subscription')};
      });
      checks++;
      if (result.logos !== count || Math.max(...result.after)-Math.min(...result.after)>1 ||
          result.after.some((h,i) => Math.abs(h-result.before[i])>1) ||
          count === 5 && (!result.text.includes('No subscription found') || !result.text.includes('No balance data') || !result.subscription)) {
        failures.push({theme,shape,count,mode,result});
      }
    }
  }
  // The same measured height drives native resizing and this simulated work area.
  let fitChecks = 0;
  let constrainedChecks = 0;
  for (const theme of themes) for (const width of [280,420,519]) for (const count of [2,3,4,5]) for (const extra of ['', '&extra']) {
    await page.setViewportSize({width,height:300});
    await page.goto(`http://127.0.0.1:5173/_test-providers.html?theme=${theme}&shape=portrait&count=${count}&fit${extra}`, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.a1Ready, null, {polling:100});
    for (const availableHeight of [300,3000]) {
      const target = await page.evaluate(async limit => {
        const {fittedUsageHeight} = await import('/usage-fit.js');
        return fittedUsageHeight(document.querySelector('#widget'), limit);
      }, availableHeight);
      await page.setViewportSize({width,height:Math.ceil(target)});
      const result = await page.evaluate(async () => {
        const root = document.querySelector('#providers');
        const widget = root.closest('.widget');
        const {fitUsage,fittedUsageHeight} = await import('/usage-fit.js');
        fitUsage(root);
        const before = fittedUsageHeight(widget);
        for (let i=0;i<3;i++) fitUsage(root);
        const cards = [...root.children];
        return {natural:fittedUsageHeight(widget),before,widget:widget.getBoundingClientRect().height,
          heights:cards.map(c=>c.getBoundingClientRect().height),
          scrolling:cards.map(c=>c.scrollHeight>c.clientHeight),
          clipped:cards.some(c=>[...c.querySelectorAll('.quota-window,.empty-window,.balance-row,.ring-center')].some(el=>el.getBoundingClientRect().bottom>c.getBoundingClientRect().bottom+1)),
          scrollbar:cards.map(c=>({width:getComputedStyle(c,'::-webkit-scrollbar').width,
            color:getComputedStyle(c,'::-webkit-scrollbar-thumb').backgroundColor,
            expected:getComputedStyle(c).getPropertyValue('--border').trim()})),
          listOverflow:root.scrollHeight>root.clientHeight+1};
      });
      fitChecks++;
      const enough = result.natural <= availableHeight;
      if (!enough) constrainedChecks++;
      if (Math.max(...result.heights)-Math.min(...result.heights)>1 || Math.abs(result.natural-result.before)>1 ||
          Math.abs(result.widget-Math.min(result.natural,availableHeight))>1 || result.listOverflow ||
          enough && (result.scrolling.some(Boolean) || result.clipped) ||
          result.scrollbar.some(s=>s.width!=='6px'||s.color==='rgba(0, 0, 0, 0)')) {
        failures.push({theme,width,count,extra,availableHeight,result});
      }
    }
  }
  const choices = await page.evaluate(async () => {
    const {mountProviders} = await import('/themes/shared/providers.js');
    const ids=['claude','codex','gemini','copilot','openrouter','deepseek','jetbrains','zai','moonshot','siliconflow','openai_admin','anthropic_admin'];
    const parent=document.createElement('section');document.body.append(parent);
    const config={providers:Object.fromEntries(ids.map(id=>[id,{enabled:true}])),disclosures:Object.fromEntries(ids.map(id=>[id,'Fictional setup description'])),detected:{copilot:true}};
    const results=[];
    for(const initialized of [false,true]) {
      mountProviders(parent,{...config,initialized},async()=>{});
      results.push({initialized,logos:parent.querySelectorAll('.provider-logo').length,detected:parent.textContent.includes('GitHub Copilot (detected)'),checked:parent.querySelectorAll('input:checked').length});
    }
    parent.remove();return results;
  });
  if(choices.some(c=>c.logos!==12||!c.detected||c.checked!==(c.initialized?12:0))) failures.push({choices});
  return {checks,fitChecks,constrainedChecks,choices,failureCount:failures.length,failures:failures.slice(0,12)};
}
