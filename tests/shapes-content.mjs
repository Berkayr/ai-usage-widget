import assert from 'node:assert/strict';
import {countdown} from '../app/src/themes/dot-matrix/render.js';
import {dialStyles,renderRound} from '../app/src/themes/shared/round.js';
assert.equal(countdown(new Date(Date.now()-60000).toISOString()),'Awaiting refresh');
assert.equal(countdown(null),'RESET UNKNOWN');
const snapshot={providers:[{id:'claude',state:'OK',windows:[{kind:'session',used_percent:21,resets_at:new Date(Date.now()-60000).toISOString()},{kind:'weekly',used_percent:33}]}]};
for(const theme of Object.keys(dialStyles)){
 const root={innerHTML:''};
 renderRound(root,snapshot,{shape:'circle',theme,featuredProvider:'claude',colorMode:'calm'});
 assert.match(root.innerHTML,/Weekly 33%/);
 assert.match(root.innerHTML,/Awaiting refresh/);
 assert.ok(!root.innerHTML.includes('dial-elapsed'));
}
console.log('PASS: expired resets await refresh; all 10 circle themes retain Weekly and omit elapsed ticks');
