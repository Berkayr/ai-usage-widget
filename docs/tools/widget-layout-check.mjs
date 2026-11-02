// Uses the production render path with synthetic snapshots; never opens native UI.
import { writeFile } from 'node:fs/promises';
import { browser } from './browser-harness.mjs';
const b=await browser();
try {
  await b.navigate('/?sample','window.__AI_USAGE_DEMO__');
  // The previous unbounded fit rules must fail the same viewport assertion.
  await b.cdp('Emulation.setDeviceMetricsOverride',{width:340,height:400,deviceScaleFactor:1,mobile:false});
  console.log(await b.evaluate(`(async()=>{
    const api=window.__AI_USAGE_DEMO__;
    await api.setSettings({theme:'system',fitHeight:true});
    await api.setSnapshot({providers:Array.from({length:12},(_,i)=>({id:'demo-'+i,state:'OK',windows:[{kind:'session',used_percent:33}]}))});
    const legacy=document.createElement('style');legacy.textContent='.fit-height .widget{height:auto;max-height:none}.fit-height .provider-list{overflow:visible;flex:none;contain:none}';document.head.append(legacy);
    const broken=document.querySelector('.footer').getBoundingClientRect().bottom>innerHeight;
    legacy.remove();if(!broken)throw Error('Legacy overflow fixture did not reproduce');
    return 'PASS: regression assertion rejects previous unbounded fit layout';
  })()`));
  for(const width of [160,340])for(const height of [400,960]) {
    await b.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    console.log(await b.evaluate(`(async()=>{
      const api=window.__AI_USAGE_DEMO__,assert=(v,s)=>{if(!v)throw Error(s)},$=s=>document.querySelector(s);
      const snapshot={generated_at:new Date().toISOString(),providers:Array.from({length:12},(_,i)=>({id:'synthetic-'+i,label:'Provider '+(i+1),state:'OK',windows:[{kind:'session',used_percent:33},{kind:'weekly',used_percent:42}]}))};
      for(const fitHeight of [true,false]) {
        await api.setSettings({theme:'system',appearance:'dark',fitHeight});
        for(const value of [null,{providers:[]},snapshot,{providers:[]},snapshot]) {
          await api.setSnapshot(value,!value);
          assert(document.querySelectorAll('#widget').length===1,'Duplicate widget');
          const cards=document.querySelectorAll('.provider-card'),empty=document.querySelectorAll('.no-data');
          assert(cards.length===((value?.providers?.length)||0),'Card count');
          assert(empty.length===(cards.length?0:1),'Empty state and cards coexist');
          if(!cards.length)continue;
          const list=$('#providers');list.scrollTop=0;
          const header=$('.header').getBoundingClientRect(),first=cards[0].getBoundingClientRect(),box=list.getBoundingClientRect(),footer=$('.footer').getBoundingClientRect();
          assert(header.bottom<=first.top+.5,'Header overlaps first card');
          assert(box.bottom<=footer.top+.5,'List overlaps footer');
          assert(footer.bottom<=innerHeight+.5,'Footer outside viewport');
          assert(list.scrollHeight>list.clientHeight,'Long content is not scrollable');
          list.scrollTop=list.scrollHeight;
          assert(list.scrollTop>0,'Cannot reach long content');
          assert($('.header').getBoundingClientRect().bottom<=box.top+.5,'Header moved into list');
          const last=cards[cards.length-1].getBoundingClientRect();
          assert(last.bottom<=box.bottom+.5&&last.bottom>box.top,'Last card inaccessible');
          list.scrollTop=0;
        }
        // Replacing a long snapshot must also release the old scroll extent.
        await api.setSnapshot({providers:[snapshot.providers[0]]});
        assert($('#providers').scrollTop===0,'Stale scroll position');
        assert(!$('.no-data'),'Empty state on short snapshot');
      }
      await api.setSettings({fitHeight:true});await api.setSnapshot(snapshot,true);
      assert(!$('.no-data'),'noData flag overrode existing providers');
      return 'PASS: ${width} × ${height}, fit on/off, empty ↔ cards, header/footer bounds, scroll to last card';
    })()`));
    if(width===340&&height===960){const png=await b.cdp('Page.captureScreenshot',{format:'png'});await writeFile('docs/tools/widget-layout-preview.png',Buffer.from(png.data,'base64'));}
  }
}finally{await b.close();}
