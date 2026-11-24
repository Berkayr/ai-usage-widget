// Stable identities are shared by every shape and the settings preview.
export const providerIds=['claude','codex','gemini','copilot','openrouter','deepseek','jetbrains','zai','moonshot','siliconflow','openai_admin','anthropic_admin'];
export function providerIndex(provider, fallback=0) {
  const id = String(provider?.baseId || String(provider?.id || '').split('~')[0]).toLowerCase();
  const index=providerIds.indexOf(id);
  return index<0 ? fallback%providerIds.length : index;
}
export const identityPatterns=['','6 2','1 2','8 2 1 2','3 3','1 1 4 1','8 4','1 4 1','2 3 2','3 1 3','4 2','5 2'];
export const identityColor=index=>`var(--provider-${index})`;
export const validColor=value=>/^#[0-9a-f]{6}$/i.test(value||'');
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
const hex=values=>'#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const linear=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
const lum=c=>linear(c).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export const colorContrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
export function colorDistance(a,b) {
 const lab=c=>{const v=linear(c),xyz=[[.4124564,.3575761,.1804375],[.2126729,.7151522,.072175],[.0193339,.119192,.9503041]].map((row,i)=>row.reduce((s,n,k)=>s+n*v[k],0)/[.95047,1,1.08883][i]).map(n=>n>216/24389?Math.cbrt(n):(24389/27*n+16)/116);return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];};
 const x=lab(a),y=lab(b);return Math.hypot(...x.map((v,i)=>v-y[i]));
}
export function defaultProviderColors(background) {
 const seeds=lum(background)>.179?['#a44325','#00745c','#245acb','#8a309d','#725600','#006b82','#ac245e','#8a4b00','#276a3d','#7540a0','#b03c58','#006d70']:['#f09a75','#56d6ac','#78aaff','#dd96eb','#dac04d','#57d6ee','#ff85af','#ffc36e','#8cdda1','#cf9aff','#ff9a9a','#75ded4'];
 return seeds.map(seed=>{const target=lum(background)>.179?0:255;for(let i=0;i<=100;i++){const c=hex(rgb(seed).map(v=>v+(target-v)*i/100));if(colorContrast(c,background)>=4.7)return c;}return seed;});
}
export function providerColors(settings,background) {
 return defaultProviderColors(background).map((color,i)=>validColor(settings.providerColors?.[providerIds[i]])?settings.providerColors[providerIds[i]]:color);
}
export function providerColorWarnings(settings,background) {
 const colors=providerColors(settings,background),warnings=[];
 colors.forEach((c,i)=>{if(colorContrast(c,background)<4.5)warnings.push(`${providerIds[i]}: low background contrast`);for(let j=0;j<i;j++)if(colorDistance(c,colors[j])<20)warnings.push(`${providerIds[j]} / ${providerIds[i]}: colors are too similar`);});
 return warnings;
}
