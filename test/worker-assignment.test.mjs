import test from 'node:test';
import assert from 'node:assert/strict';
import { solveAssignments } from '../backend/cloudflare/src/worker.js';

test('Worker creates a complete assignment and respects exclusions',()=>{
  const blocked=new Set(['1:2','2:3']);
  const result=solveAssignments([1,2,3,4,5],blocked);
  assert.equal(result.size,5);
  assert.equal(new Set(result.values()).size,5);
  for(const [giver,receiver] of result){assert.notEqual(giver,receiver);assert.ok(!blocked.has(`${giver}:${receiver}`))}
});
