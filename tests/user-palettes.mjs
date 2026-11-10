import test from 'node:test';
import assert from 'node:assert/strict';
import {paletteTokens, validateUserPalettes, paletteChoices, selectedPalette, opaqueColor, appearancePalette} from '../app/src/user-palettes.js';
const colors = Object.fromEntries(paletteTokens.map(k => [k,'#abc']));
const palette = () => ({id:'user-test',name:'My palette',dark:{...colors},light:{...colors}});
test('palette JSON round trip drops every unknown key and supports both appearances', () => {
  const p = palette(); p.unknown = '<script>'; p.dark.evil = {url:'bad'};
  assert.deepEqual(validateUserPalettes(JSON.parse(JSON.stringify([p]))), [palette()]);
  for (const color of ['#aBc','#AABBcc','#12345678']) {
    p.light.accent = color; assert.equal(validateUserPalettes([p])[0].light.accent, color);
  }
});
test('Unicode names count characters without splitting surrogate pairs', () => {
  const p = palette();p.name='🌿'.repeat(40);assert.equal(validateUserPalettes([p])[0].name,p.name);
});
test('imports reject hostile colors, names, ids, missing data and collection abuse', () => {
  for (const color of ['red','#abcd','#123456;url(x)','#123456\n','var(--x)','url(https://invalid.test)','#１２３',null,{}]) {
    const p = palette(); p.dark.accent = color; assert.throws(() => validateUserPalettes([p]));
  }
  for (const name of ['<img src=x onerror=alert(1)>','', 'a'.repeat(41),'x\n','x\u0085', '\ud800']) {
    const p = palette(); p.name = name; assert.throws(() => validateUserPalettes([p]));
  }
  for (const id of ['__proto__','constructor','default','user-','user-x;']) {
    const p = palette();p.id=id;assert.throws(() => validateUserPalettes([p]));
  }
  for (const value of [null,{},[{}],[palette(),palette()],Array(51).fill(palette())]) assert.throws(() => validateUserPalettes(value));
  const p = palette();delete p.light.textMuted;assert.throws(() => validateUserPalettes([p]));
});
test('user choices work on every theme; deletion and malformed settings fall back safely', () => {
  const theme = {palettes:{default:{name:'Default',accent:'#123456'}}};
  const settings = {palette:'user-test',userPalettes:[palette()]};
  assert.equal(selectedPalette(theme,settings).accent,'#abc');
  assert.deepEqual(Object.keys(paletteChoices(theme,settings)),['default','user-test']);
  assert.equal(selectedPalette(theme,{...settings,userPalettes:[]}),theme.palettes.default);
  settings.userPalettes[0].dark.accent = 'url(bad)';
  assert.equal(selectedPalette(theme,settings),theme.palettes.default);
  assert.equal(opaqueColor('#abc'),'#aabbcc');
  assert.equal(opaqueColor('#00000080','#ffffff'),'#7f7f7f');
});
test('every theme ships at least two palettes with valid dark/light color tokens', async () => {
  const {readdir,readFile} = await import('node:fs/promises');
  const root = new URL('../app/src/themes/',import.meta.url);
  for (const entry of await readdir(root,{withFileTypes:true})) {
    if (!entry.isDirectory() || entry.name === 'shared') continue;
    const theme = JSON.parse(await readFile(new URL(entry.name+'/theme.json',root),'utf8'));
    assert.ok(Object.keys(theme.palettes).length >= 2,theme.id);
    for (const p of Object.values(theme.palettes)) {
      const copy = {id:'user-example',name:p.name,dark:Object.fromEntries(paletteTokens.map(k=>[k,p[k]])),light:{...p,...p.light}};
      assert.equal(validateUserPalettes([copy]).length,1);
    }
  }
});

test('built-in alpha tokens stay intact; only custom palettes normalize RGB/alpha', () => {
 const base={...colors,bgTrackOff:'#0000001a',light:{...colors}};
 assert.equal(appearancePalette(base,'dark').bgTrackOff,'#0000001a');
 assert.equal(appearancePalette(base,'dark',true).bgWidget,'#aabbcc');
 assert.match(appearancePalette(base,'dark',true).bgTrackOff,/^#[a-f0-9]{6}$/);
});
