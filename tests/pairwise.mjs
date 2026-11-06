import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pairwise} from '../docs/tools/pairwise.mjs';
test('covering array keeps every pair, including false and numeric values',()=>{
  const factors={theme:['a','b','c'],shape:['round','square'],size:[85,100,200],quote:[false,true]};
  const rows=pairwise(factors), entries=Object.entries(factors);
  for(const [a,values] of entries) for(const value of values) assert(rows.some(row=>row[a]===value));
  entries.forEach(([a,values],i)=>entries.slice(i+1).forEach(([b,others])=>{
    for(const value of values)for(const other of others)assert(rows.some(row=>row[a]===value&&row[b]===other),`${a}/${b}`);
  }));
  assert.deepEqual(rows,pairwise(factors));
  assert(rows.length<36);
});
