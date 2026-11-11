// All remote content is rendered as text. Sample cards are documentation only.
export const quotePrivacy = 'Off by default. When on, AI Usage contacts en.wikiquote.org (and wikidata.org) once a day. No account or identifiers are sent.';
export const sampleQuote = {status:'ok',cards:[{quote:'While we are postponing, life speeds by.',author:'Seneca',reason:"Wikiquote's pick for November 3, 2026",source_url:'https://en.wikiquote.org/wiki/Seneca',license:'CC BY-SA 4.0'}]};
export async function loadQuote(settings, invoke) {
  if (settings.quoteEnabled !== true) return {status:'disabled',cards:[]};
  return invoke('get_quote');
}
let index=0, page=false;
let fitObserver;

function fitQuote(text, fullText, shape) {
  if (!text.isConnected || !text.clientWidth || !text.clientHeight) return;
  text.style.removeProperty('font-size');
  text.textContent = fullText;
  const originalSize = parseFloat(getComputedStyle(text).fontSize);
  const minimumSize = Math.min(originalSize, shape === 'circle' ? 9 : 11);
  const fits = () => text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth;
  // Restore the original size on every pass, including after a resize/font load.
  let size = originalSize;
  while (!fits() && size > minimumSize) {
    size = Math.max(minimumSize, size - .5);
    text.style.fontSize = `${size}px`;
  }
  if (fits()) return;
  const words = fullText.match(/\S+\s*/gu) || [];
  let low = 0, high = words.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    text.textContent = words.slice(0, middle).join('').trimEnd() + '…';
    if (fits()) low = middle;
    else high = middle - 1;
  }
  text.textContent = words.slice(0, low).join('').trimEnd() + '…';
}

function observeQuote(content, text, shape) {
  const fullText = text.textContent;
  const fit = () => fitQuote(text, fullText, shape);
  fitObserver = new ResizeObserver(fit);
  fitObserver.observe(content);
  requestAnimationFrame(fit);
  document.fonts.ready.then(fit);
}

export function renderQuote(root, settings, data, redraw, repairContrast = () => {}) {
  fitObserver?.disconnect();
  root.replaceChildren();root.hidden=settings.quoteEnabled!==true || settings.shape==='strip';
  document.documentElement.dataset.quotePosition=settings.quotePosition === 'top' ? 'top' : 'bottom';
  document.documentElement.dataset.quote=String(settings.quoteEnabled===true && settings.shape!=='strip');
  document.documentElement.dataset.quotePage=String(page&&settings.quoteEnabled===true && settings.shape!=='strip');
  if(root.hidden)return;
  const cards=data?.cards||[],card=cards[index%Math.max(1,cards.length)];
  const compact=['circle','pill','square'].includes(settings.shape);
  const toggle=document.createElement('button');toggle.className='quote-toggle';toggle.textContent=page?'Usage':'Quote';toggle.setAttribute('aria-label','Switch between usage and quote');toggle.onclick=()=>{page=!page;redraw();};toggle.hidden=!compact||settings.shape==='pill';root.append(toggle);
  const content=document.createElement('div');content.className='quote-content';root.append(content);
  const label=document.createElement('div');label.className='quote-label';label.textContent=({'reactor':'CORE / DAILY QUOTE','terminal':'> quote','retro-lcd':'[ DAILY QUOTE ]','dot-matrix':'•• DAILY QUOTE','brutalist':'DAILY QUOTE','minimal-pace':'Daily reflection','compact-strip':'QUOTE /','circular-rings':'◉ Daily quote','frosted-glass':'Daily inspiration'})[settings.theme]||'Quote of the day';content.append(label);
  const text=document.createElement('button');text.className='quote-text';text.textContent=card?.quote|| (data?.status==='offline'?'Quotes unavailable · offline':'Loading quote…');content.append(text);
  const author=document.createElement('div');author.className='quote-author';author.textContent=[card?.author||'Wikiquote',card?.work].filter(Boolean).join(' · ');author.title=author.textContent;content.append(author);
  const reason=document.createElement('div');reason.className='quote-reason';reason.textContent=(data?.status==='offline'?'Offline · ':'')+(card?.reason||'');content.append(reason);
  const attribution=document.createElement('button');attribution.className='quote-source';attribution.textContent='Wikiquote · CC BY-SA';attribution.setAttribute('aria-label','Read full quote, source and CC BY-SA 4.0 license');content.append(attribution);
  const full=()=>{
    const dialog=document.createElement('dialog');dialog.className='quote-dialog';
    const body=document.createElement('p');body.textContent=card?.quote||text.textContent;
    const by=document.createElement('p');by.textContent=[card?.author,card?.work,card?.author_description,card?.reason].filter(Boolean).join(' · ');
    const source=document.createElement('a');source.textContent='Wikiquote · CC BY-SA 4.0';
    // A remote value never becomes an arbitrary link or executable URL.
    if(/^https:\/\/en\.wikiquote\.org\/wiki\//.test(card?.source_url||'')){source.href=card.source_url;source.target='_blank';source.rel='noopener noreferrer';}
    if(settings.quoteNavigation!==false && cards.length>1) {
      for(const delta of [-1,1]) {const step=document.createElement('button');step.textContent=delta<0?'Previous quote':'Next quote';step.onclick=()=>{index=(index+delta+cards.length)%cards.length;dialog.close();redraw();};dialog.append(step);}
    }
    const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();
    dialog.append(body,by,source,close);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();repairContrast(dialog);
  };
  text.title=card?.quote||'';text.onclick=full;attribution.onclick=full;
  const nav=document.createElement('div');nav.className='quote-nav';nav.hidden=settings.quoteNavigation===false||cards.length<2;
  for(const delta of [-1,1]){const b=document.createElement('button');b.textContent=delta<0?'‹':'›';b.setAttribute('aria-label',delta<0?'Previous quote':'Next quote');b.onclick=()=>{index=(index+delta+cards.length)%cards.length;redraw();};nav.append(b);}
  content.append(nav);
  if(settings.shape==='pill') {root.replaceChildren();const b=document.createElement('button');b.className='quote-toggle';b.textContent='“';b.title=card?.quote||'Daily quote';b.setAttribute('aria-label','Read daily quote and attribution');b.onclick=full;root.append(b);}
  else observeQuote(content, text, settings.shape);
}
