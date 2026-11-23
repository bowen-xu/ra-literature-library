import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planNalAnnotation,
  prepareNalAnnotationLink,
  validateNalAnnotationRequest,
} from './nal-annotation.mts';

const annotation = (overrides: Partial<{id: string; targetKind: string; targetId: string; notePageId: string}> = {}) => ({
  id: overrides.id ?? 'annotation',
  targetKind: overrides.targetKind ?? 'concept',
  targetId: overrides.targetId ?? 'concept-1',
  notePageId: overrides.notePageId ?? 'page-1',
});

test('NAL annotation validates target kind, identity bytes, title and scalar length', () => {
  assert.equal(validateNalAnnotationRequest({targetKind: 'concept', targetId: 'id', title: 'title'}), null);
  assert.equal(validateNalAnnotationRequest({targetKind: 'other', targetId: 'id', title: 'title'}), 'invalidRequest');
  assert.equal(validateNalAnnotationRequest({targetKind: 'concept', targetId: ' ', title: 'title'}), 'invalidRequest');
  assert.equal(validateNalAnnotationRequest({targetKind: 'concept', targetId: 'id', title: ' \u0000 '}), null);
  assert.equal(validateNalAnnotationRequest({targetKind: 'concept', targetId: 'id', title: 'x'.repeat(301)}), 'invalidRequest');
});

test('NAL annotation reuses first matching identity and preserves raw create title', () => {
  const existing = annotation({id: 'first'});
  assert.deepEqual(planNalAnnotation({targetKind: 'concept', targetId: 'concept-1', title: 'new'}, {
    annotations: [existing, annotation({id: 'second'})], targetExists: false,
  }), {kind: 'existing', annotation: existing});
  assert.deepEqual(planNalAnnotation({targetKind: 'concept', targetId: 'concept-2', title: ' raw title '}, {
    annotations: [], targetExists: true,
  }), {kind: 'create', targetKind: 'concept', targetId: 'concept-2', title: ' raw title '});
  assert.equal(planNalAnnotation({targetKind: 'statement', targetId: 'missing', title: 'title'}, {
    annotations: [], targetExists: false,
  }), 'targetMissing');
});

test('NAL annotation link rejects identity conflicts before active-note reads', () => {
  assert.deepEqual(prepareNalAnnotationLink(annotation({id: ' '}), []), {
    kind: 'rejectedBeforeLoad', reason: 'invalidAnnotationId',
  });
  assert.deepEqual(prepareNalAnnotationLink(annotation(), [annotation({notePageId: 'different'})]), {
    kind: 'afterLoadRejected', annotations: [annotation({notePageId: 'different'})], reason: 'identityConflict',
  });
  assert.deepEqual(prepareNalAnnotationLink(annotation({id: 'new'}), [annotation({id: 'other', notePageId: 'different'})]), {
    kind: 'afterLoadRejected', annotations: [annotation({id: 'other', notePageId: 'different'})], reason: 'targetConflict',
  });
});

test('NAL annotation link keeps the original invalid target decision', () => {
  assert.deepEqual(prepareNalAnnotationLink(annotation({id: 'new', targetKind: 'other'}), []), {
    kind: 'readActive', annotations: [], target: {kind: 'invalidTargetKind'},
  });
  assert.deepEqual(prepareNalAnnotationLink(annotation({id: 'new'}), []), {
    kind: 'readActive', annotations: [], target: {kind: 'concept', id: 'concept-1'},
  });
});
