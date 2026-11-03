import assert from 'node:assert/strict';
import {loadQuote} from '../app/src/quote.js';
let calls=0;const invoke=async()=>{calls++;throw Error('Unexpected network/IPC');};
for(const settings of [{},{quoteEnabled:false}])assert.equal((await loadQuote(settings,invoke)).status,'disabled');
assert.equal(calls,0);
console.log('Disabled quote: zero IPC/network calls');
