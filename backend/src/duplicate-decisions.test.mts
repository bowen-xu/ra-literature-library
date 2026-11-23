import assert from 'node:assert/strict';
import test from 'node:test';
import {finishDuplicateDecision, prepareDuplicateDecision, prepareDuplicateMerge, sourceDuplicateItemId} from './duplicate-decisions.mts';

test('duplicate decision preparation preserves the finite decisions and post-write row gate', () => {
  const request = {candidateId: 'candidate', decision: 'keep_both'};
  assert.deepEqual(prepareDuplicateDecision(request), {kind: 'ready', request});
  assert.deepEqual(prepareDuplicateDecision({...request, decision: 'unknown'}), {kind: 'rejected', error: {code: 'invalid_input', message: '不支持的文献类型：unknown'}});
  assert.deepEqual(finishDuplicateDecision({request, affectedRows: 1n}), {kind: 'applied'});
  assert.deepEqual(finishDuplicateDecision({request, affectedRows: 0n}), {kind: 'rejected', error: {code: 'not_found', message: '找不到文献或附件'}});
});

test('duplicate merge preparation preserves left-first endpoint selection, including identical endpoints', () => {
  assert.equal(sourceDuplicateItemId('left', 'right', 'left'), 'right');
  assert.equal(sourceDuplicateItemId('left', 'right', 'right'), 'left');
  assert.equal(sourceDuplicateItemId('same', 'same', 'same'), 'same');
  assert.deepEqual(prepareDuplicateMerge({candidateId: 'candidate', survivorItemId: 'left', leftItemId: 'left', rightItemId: 'right'}), {status: 'ready', input: {candidateId: 'candidate', survivorItemId: 'left', leftItemId: 'left', rightItemId: 'right'}, mergedItemId: 'right', operationState: 'applied', createdReadingState: false});
  assert.deepEqual(prepareDuplicateMerge({candidateId: 'candidate', survivorItemId: 'other', leftItemId: 'left', rightItemId: 'right'}), {status: 'rejected', reason: 'notFound'});
});
