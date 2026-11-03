import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedProviders, featuredProvider } from '../app/src/provider-layout.js';
const providers = ['claude','codex','gemini'].map((id,i)=>({id,windows:[{used_percent:[20,90,60][i]}]}));
test('order and visibility apply without changing snapshot',()=>{
 assert.deepEqual(orderedProviders(providers,{providerOrder:['gemini','claude'],hiddenProviders:['codex']}).map(p=>p.id),['gemini','claude']);
 assert.equal(providers[0].id,'claude');
});
test('featured auto, explicit, none, unavailable and legacy',()=>{
 assert.equal(featuredProvider(providers,{featuredProvider:'auto'}).id,'codex');
 assert.equal(featuredProvider(providers,{featuredProvider:'claude'}).id,'claude');
 assert.equal(featuredProvider(providers,{featuredProvider:'none'}),null);
 assert.equal(featuredProvider(providers,{featuredProvider:'missing'}),null);
 assert.equal(featuredProvider(providers,{},true).id,'gemini');
 assert.equal(featuredProvider([],{}),null);
});
