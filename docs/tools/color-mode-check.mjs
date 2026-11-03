// Sample actual arc pixels after SVG filters, excluding text and backgrounds.
export async function auditColorModes(b) {
 const results=[];
 const themes=await b.evaluate('window.__AI_USAGE_DEMO__.themes.map(t=>t.id)');
 for(const theme of themes){
  const saturation={};
  for(const colorMode of ['calm','vivid']){
   await b.evaluate(`(async()=>{const api=window.__AI_USAGE_DEMO__;await api.setSettings({theme:${JSON.stringify(theme)},colorMode:${JSON.stringify(colorMode)},shape:'circle',sizePreset:'Medium',fineTune:100,appearance:'dark',providerColors:{},widgetProviders:['claude','codex','gemini']});await api.setSnapshot({providers:['claude','codex','gemini'].map(id=>({id,state:'OK',windows:[{kind:'session',used_percent:65}]}))});})()`);
   const {data}=await b.cdp('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:340,height:340,scale:1}});
   saturation[colorMode]=await b.evaluate(`(async()=>{
    const img=new Image();img.src='data:image/png;base64,${data}';await img.decode();const canvas=document.createElement('canvas');canvas.width=340;canvas.height=340;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);let sum=0,count=0;
    for(const r of [151,134,117])for(let a=.2;a<3.9;a+=.03){const x=Math.round(170+r*Math.sin(a)),y=Math.round(170-r*Math.cos(a)),v=ctx.getImageData(x,y,1,1).data;const max=Math.max(...v.slice(0,3)),min=Math.min(...v.slice(0,3));if(max>50){sum+=(max-min)/max;count++;}}
    return sum/count;
   })()`);
  }
  results.push({theme,...saturation});
 }
 return {results,failures:results.filter(r=>!(r.vivid>r.calm+.08))};
}
