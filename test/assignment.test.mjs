import test from 'node:test';import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const {solveAssignments}=await import('../server.mjs');
test('creates a complete derangement',()=>{for(let n=2;n<20;n++){const ids=Array.from({length:n},(_,i)=>i+1);const result=solveAssignments(ids);assert.equal(result.size,n);assert.equal(new Set(result.values()).size,n);for(const [a,b] of result)assert.notEqual(a,b)}});
test('honors exclusions',()=>{const blocked=new Set(['1:2','1:3','2:1']);const result=solveAssignments([1,2,3,4],blocked);assert.ok(result);for(const [a,b] of result)assert.ok(!blocked.has(`${a}:${b}`))});
test('returns null for impossible constraints',()=>{assert.equal(solveAssignments([1,2],new Set(['1:2'])),null)});
