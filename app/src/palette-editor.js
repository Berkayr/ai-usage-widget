import {paletteTokens, validateUserPalettes, userPalettes, selectedPalette, opaqueColor} from './user-palettes.js';
import {contrast, rgba} from './text-contrast.js';

export function paletteEditor(getDraft, getTheme, update) {
  const labels = {bgWidget:'Widget background',bgCard:'Card background',bgTrackOff:'Track',textPrimary:'Primary text',textSecondary:'Secondary text',textMuted:'Muted text',border:'Border',accent:'Accent',severityNormal:'Normal status',severityWarning:'Warning',severityDanger:'Danger'};
  const element = document.createElement('div');
  element.id = 'palette-tools';
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  const editor = document.createElement('div');
  const transfer = document.createElement('textarea');
  transfer.setAttribute('aria-label', 'Palette JSON');
  transfer.rows = 6;
  transfer.placeholder = 'Paste a JSON array of user palettes here';
  const actions = document.createElement('div');
  actions.className = 'palette-actions';
  const button = (label, handler, target = actions) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label; el.onclick = handler;
    target.append(el); return el;
  };
  let expanded = false, editing = false, renderedId = null, deleteId = null;
  const selected = () => userPalettes(getDraft()).find(p => p.id === getDraft().palette);
  const show = button('Show all', () => { expanded = !expanded; update(); });
  function create() {
    const draft = getDraft(), list = userPalettes(draft);
    if (list.length >= 50) { message.textContent = 'You can store at most 50 user palettes.'; return; }
    const source = selectedPalette(getTheme(), draft);
    const p = {id:'user-' + crypto.randomUUID(), name:[...(source.name + ' copy')].slice(0,40).join('')};
    for (const mode of ['dark','light']) {
      const values = {...source, ...source[mode]};
      p[mode] = Object.fromEntries(paletteTokens.map(key => [key, values[key]]));
    }
    draft.userPalettes = validateUserPalettes([...list,p]);
    draft.palette = p.id; draft.accent = null; draft.background = null;
    editing = true; message.textContent = ''; update();
  }
  button('New palette', create);
  button('Duplicate', create);
  const edit = button('Edit palette', () => { editing = !editing; renderedId = null; update(); });
  const confirm = document.createElement('div');
  confirm.hidden = true; confirm.textContent = 'Delete this user palette? ';
  const remove = button('Delete', () => { deleteId = getDraft().palette; confirm.hidden = false; });
  button('Delete palette', () => {
    const draft = getDraft();
    if (!deleteId || draft.palette !== deleteId) return;
    draft.userPalettes = userPalettes(draft).filter(p => p.id !== deleteId);
    draft.palette = Object.keys(getTheme().palettes)[0];
    confirm.hidden = true; editing = false; update();
  }, confirm);
  button('Cancel', () => { confirm.hidden = true; }, confirm);
  button('Export', () => {
    transfer.value = JSON.stringify(userPalettes(getDraft()), null, 2);
    message.textContent = 'User palettes exported below.';
  });
  button('Import', () => {
    try {
      const incoming = validateUserPalettes(JSON.parse(transfer.value));
      const draft = getDraft(), merged = new Map(userPalettes(draft).map(p => [p.id,p]));
      for (const p of incoming) merged.set(p.id,p);
      draft.userPalettes = validateUserPalettes([...merged.values()]);
      if (incoming.length) {draft.palette = incoming[0].id; draft.accent = null; draft.background = null;}
      editing = true; renderedId = null; message.textContent = 'Palettes imported. Save to keep changes.'; update();
    } catch (e) { message.textContent = 'Import rejected: ' + e.message; }
  });
  element.append(actions, confirm, message, editor, transfer);
  function warnings(p) {
    const low = [];
    for (const mode of ['dark','light']) {
      const values = p[mode], paper = opaqueColor(values.bgWidget, mode === 'light' ? '#ffffff' : '#000000');
      const card = opaqueColor(values.bgCard, paper);
      for (const key of ['textPrimary','textSecondary','textMuted','accent','severityWarning','severityDanger']) {
        for (const bg of [paper,card]) if (contrast(rgba(opaqueColor(values[key],bg)), rgba(bg)) < 4.5) {low.push(`${mode} ${key}`);break;}
      }
    }
    editor.querySelector('.palette-warning').textContent = low.length ? 'Low contrast: ' + low.join(', ') + '. Preview may improve text readability.' : 'Text and accents meet 4.5:1 contrast on both surfaces.';
  }
  function render() {
    show.textContent = expanded ? 'Show fewer' : 'Show all';
    show.setAttribute('aria-expanded', String(expanded));
    const p = selected();
    if (deleteId !== getDraft().palette) { confirm.hidden = true; deleteId = null; }
    edit.disabled = remove.disabled = !p;
    editor.hidden = !p || !editing;
    if (!p) { confirm.hidden = true; renderedId = null; return; }
    if (!editing) return;
    if (renderedId !== p.id) {
      editor.replaceChildren(); renderedId = p.id;
      const label = document.createElement('label'); label.textContent = 'Palette name';
      const name = document.createElement('input'); name.maxLength = 80; name.dataset.paletteName = '';
      name.oninput = () => {
        const draft = getDraft(), list = userPalettes(draft), item = list.find(v => v.id === draft.palette);
        item.name = name.value;
        try {draft.userPalettes = validateUserPalettes(list); message.textContent = ''; update();}
        catch (e) {message.textContent = e.message;}
      };
      label.append(name); editor.append(label);
      for (const mode of ['dark','light']) {
        const group = document.createElement('fieldset');
        const legend = document.createElement('legend'); legend.textContent = mode === 'dark' ? 'Dark' : 'Light'; group.append(legend);
        for (const key of paletteTokens) {
          const row = document.createElement('label'); row.className = 'palette-token'; row.textContent = labels[key];
          const color = document.createElement('input'); color.type = 'color'; color.setAttribute('aria-label', `${mode} ${key} color`);
          const hex = document.createElement('input'); hex.type = 'text'; hex.setAttribute('aria-label', `${mode} ${key} hex`);
          hex.dataset.mode = mode; hex.dataset.token = key;
          function change(value) {
            const draft = getDraft(), list = userPalettes(draft), item = list.find(v => v.id === draft.palette);
            item[mode][key] = value;
            try {draft.userPalettes = validateUserPalettes(list); message.textContent = ''; hex.removeAttribute('aria-invalid'); update();}
            catch (e) {hex.setAttribute('aria-invalid','true'); message.textContent = e.message;}
          }
          color.oninput = () => change(color.value); hex.oninput = () => change(hex.value);
          row.append(color,hex); group.append(row);
        }
        editor.append(group);
      }
      const warning = document.createElement('p'); warning.className = 'palette-warning'; warning.setAttribute('role','status'); editor.append(warning);
    }
    const name = editor.querySelector('[data-palette-name]');
    if (document.activeElement !== name) name.value = p.name;
    for (const hex of editor.querySelectorAll('[data-token]')) {
      const value = p[hex.dataset.mode][hex.dataset.token];
      if (document.activeElement !== hex) hex.value = value;
      hex.previousElementSibling.value = opaqueColor(value);
    }
    warnings(p);
  }
  return {element, render, get expanded() {return expanded;}};
}
