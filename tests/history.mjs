import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatTokens,formatMoney,hasHistory,splitMachines,dailySeries,bars,panelOnLeft,historyGeometry} from '../app/src/history.js';
test('history number and price formatting',()=>{
  assert.equal(formatTokens(72000000),'72M'); assert.equal(formatTokens(2500000000),'2.50B');
  assert.equal(formatTokens(0),'0'); assert.equal(formatTokens(NaN),'0');
  assert.equal(formatMoney(2.5),'$2.50');assert.equal(formatMoney(125.9),'$126');
});
test('only records with history and two distinct computers qualify',()=>{
  assert.equal(hasHistory({id:'gemini'}),false);assert.equal(hasHistory({history:{scope:'account',daily:[]}}),true);
  assert.equal(splitMachines({machines:[{id:'a'}]},true),false);
  assert.equal(splitMachines({machines:[{id:'a'},{id:'a'}]},true),false);
  assert.equal(splitMachines({machines:[{id:'a'},{id:'b'}]},false),false);
  assert.equal(splitMachines({machines:[{id:'a'},{id:'b'}]},true),true);
});
test('account gaps stay unknown while local log gaps are zero',()=>{
  const h={scope:'account',daily:[{date:'2026-10-31',tokens:100},{date:'2026-11-02',tokens:900}]};
  const rows=dailySeries(h,3,new Date(2026,10,1));
  assert.deepEqual(rows.map(r=>r.date),['2026-10-30','2026-10-31','2026-11-01']);
  assert.deepEqual(rows.map(r=>r.tokens),[null,100,null]);
  const html=bars(h,3,false,new Date(2026,10,1)); assert.match(html,/No data/); assert.match(html,/height:100%/); assert.doesNotMatch(html,/NaN|Infinity/);
  const local=dailySeries({scope:'local',daily:[{date:'2026-10-31',tokens:0}]},3,new Date(2026,10,1));
  assert.deepEqual(local.map(r=>r.tokens),[0,0,0]);
  const mixed=dailySeries({scope:'account',daily:[{date:'2026-10-30',tokens:0},{date:'2026-10-31',tokens:null},{date:'2026-11-01',tokens:12}]},3,new Date(2026,10,1));
  assert.deepEqual(mixed.map(r=>r.tokens),[0,null,12]);
  assert.match(bars({scope:'account',daily:[]},7),/No data/);
});
test('stacked chart preserves totals and escapes labels',()=>{
  const h={machines:[{id:'a'},{id:'b'}],daily:[{date:'2026-11-01',tokens:100,by_machine:{a:20,b:60}}]};
  assert.match(bars(h,1,true,new Date(2026,10,1)),/flex:20/);
  assert.match(bars(h,1,true,new Date(2026,10,1)),/flex:60/);
  assert.match(bars({scope:'local',daily:[]},7),/height:0%/);
});
test('panel opens inward at either edge and follows free placement',()=>{
  assert.equal(panelOnLeft({position:'Top right'}),true);assert.equal(panelOnLeft({position:'Bottom left'}),false);
  assert.equal(panelOnLeft({position:'Free',placement:{xRatio:.8}}),true);assert.equal(panelOnLeft({position:'Free',placement:{x_ratio:.2}}),false);
});

test('panel reserves visible space even when a strip exceeds the screen',()=>{
  assert.deepEqual(historyGeometry(340,1000),{panel:360,width:700});
  assert.deepEqual(historyGeometry(1580,776),{panel:360,width:776});
  const small=historyGeometry(340,300);assert.equal(small.width,300);assert.equal(small.panel,150);
});
