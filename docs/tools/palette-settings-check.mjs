// Run against settings-check's synthetic IPC bridge; no native app or real disk.
export async function auditPaletteSettings(b) {
  await b.navigate('/?settings','window.__SETTINGS_READY__');
  console.log(await b.evaluate(`(async()=>{
    const $=s=>document.querySelector(s),assert=(v,m)=>{if(!v)throw Error(m)};
    const click=text=>[...document.querySelectorAll('#palette-tools button')].find(b=>b.textContent===text).click();
    const settle=()=>new Promise(r=>setTimeout(r,80));
    $('[data-category=colors]').click();click('New palette');
    await settle();assert(window.__FAKE_NATIVE__.previews.at(-1).userPalettes.length===1,'User palette live IPC preview');
    $('#save').click();await settle();
    assert($('#save').disabled&&$('#status').dataset.state==='success','User palette honest Save');
    const name=$('[data-palette-name]');name.value='Unsaved';name.dispatchEvent(new Event('input'));
    $('#revert').click();assert($('[data-palette-name]').value!=='Unsaved','IPC Revert palette edits');
    click('Delete');click('Delete palette');await settle();
    assert(window.__FAKE_NATIVE__.previews.at(-1).userPalettes.length===0,'Delete preview');
    $('#save').click();await settle();assert($('#save').disabled&&$('#status').dataset.state==='success','Last palette deletion honest Save');
    assert(window.__FAKE_NATIVE__.saves.at(-1).userPalettes.length===0,'Persist deletion');
    return 'PASS: user palette IPC live preview, honest Save/Revert and last-palette deletion Save';
  })()`));
}
