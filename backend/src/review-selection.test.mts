import assert from 'node:assert/strict';
import test from 'node:test';
import {selectUnreviewedFields} from './review-selection.mts';

test('structured review selection preserves pending order and duplicates', () => {
  assert.deepEqual(selectUnreviewedFields(
    ['title', 'protected', 'title', 'reviewed', 'tail'],
    ['protected'],
    ['reviewed'],
  ), ['title', 'title', 'tail']);
});
