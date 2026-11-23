import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareDuplicateUndo, projectDuplicateCandidates, projectMergeOperations} from './duplicate-projections.mts';

const text = (value: string) => ({kind: 'text', value} as const);
const integer = (value: bigint | number) => ({kind: 'integer', value: BigInt(value)} as const);

test('duplicate projections preserve exact row fields and f64 wire bits', () => {
  const candidate = projectDuplicateCandidates({rows: [[text('id'), text('left'), text('Left'), text('right'), text('Right'), text('reason'), text('3fe70a3d70a3d70a')]]});
  assert.equal(candidate[0]?.confidenceBits.asString(), '3fe70a3d70a3d70a');
  assert.equal(candidate[0]?.confidenceBits.toF64(), 0.72);
  assert.deepEqual(projectMergeOperations({rows: [[text('op'), text('survivor'), text('S'), text('merged'), text('M'), text('applied'), text('time')]]}), [{id: 'op', survivorItemId: 'survivor', survivorTitle: 'S', mergedItemId: 'merged', mergedTitle: 'M', state: 'applied', createdAt: 'time'}]);
  assert.throws(() => projectDuplicateCandidates({rows: [[integer(1), text('left'), text('Left'), text('right'), text('Right'), text('reason'), text('0000000000000000')]]}), /duplicateCandidates/);
});

test('duplicate undo preserves snapshot hash, ordered contains deltas and nested NAL data', () => {
  const snapshot = {
    classification: {
      beforeMemberships: [{itemId: 'item', collectionId: 'before'}], afterMemberships: [{itemId: 'item', collectionId: 'before'}, {itemId: 'item', collectionId: 'after'}],
      beforeAssignments: [{itemId: 'item', relationId: 'same'}], afterAssignments: [{itemId: 'item', relationId: 'same'}, {itemId: 'item', relationId: 'new'}],
      nal: {before: [{id: 'old'}], after: [{id: 'old'}, {id: 'new'}, {id: 'new'}], before_annotations: [{id: 'old-note'}], after_annotations: [{id: 'old-note'}, {id: 'new-note'}]},
    },
  };
  const json = JSON.stringify(snapshot), result = prepareDuplicateUndo(json);
  assert.equal(result.snapshotSha256.length, 64);
  assert.deepEqual(result.classification?.deleteMemberships, [{itemId: 'item', collectionId: 'after'}]);
  assert.deepEqual(result.classification?.deleteAssignments, [{itemId: 'item', relationId: 'new'}]);
  assert.deepEqual(result.classification?.nal?.deleteStatementIds, ['new', 'new']);
  assert.deepEqual(result.classification?.nal?.deleteAnnotationIds, ['new-note']);
  assert.equal(result.classification?.expectedAssignmentsJson, JSON.stringify(snapshot.classification.afterAssignments));
  assert.throws(() => prepareDuplicateUndo('{bad'), /duplicate undo/);
});
