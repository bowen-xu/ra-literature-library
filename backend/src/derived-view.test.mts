import assert from 'node:assert/strict';
import test from 'node:test';
import {decideDerivedView, validateDerived, type DerivedResearchViewDraft, type DerivedViewItem} from './derived-view.mts';

const item = (overrides: Partial<DerivedViewItem> = {}): DerivedViewItem => ({id: 'item', text: 'Synthetic comparison Ω', epistemicRole: 'synthesis', evidenceAnchorIds: ['a'], hasConflict: true, ...overrides});
const draft = (overrides: Partial<DerivedResearchViewDraft> = {}): DerivedResearchViewDraft => ({id: null, projectId: 'project', viewKind: 'taxonomy', title: 'View', scopeNote: '', inputs: [{objectKind: 'matrix_cell', objectId: 'cell', objectRevision: 1n, selectionReason: 'reason'}], items: [item()], reviewState: 'unreviewed', expectedRevision: null, changeReason: 'manual', ...overrides});

test('derived-view provenance preserves the original accepted suggestion transition', () => {
  for (const current of ['human_original', 'ai_suggestion', 'ai_accepted_after_edit']) for (const review of ['unreviewed', 'accepted', 'rejected', 'deferred']) {
    const expected = current === 'ai_suggestion' && review === 'accepted' ? 'ai_accepted_after_edit' : current;
    assert.deepEqual(decideDerivedView({kind: 'provenance', current, review}), {kind: 'provenance', value: expected});
  }
});

test('derived-view validation preserves rejection family and evidence boundaries', () => {
  assert.equal(validateDerived({kind: 'provenance', provenanceKind: 'human_original'}), 'provenance');
  assert.equal(validateDerived({kind: 'header', draft: draft({title: '  '})}), 'header');
  assert.equal(validateDerived({kind: 'input', ordinal: 0n, input: {objectKind: 'paper', objectId: 'p', objectRevision: 1n, selectionReason: ''}}), 'input');
  assert.equal(validateDerived({kind: 'coverage', ordinal: 0n, snapshot: {coverageState: 'missing'}}), 'coverage');
  const invalidItem = {kind: 'item' as const, ordinal: 0n, viewKind: 'gap_hypothesis', item: item(), allowedAnchors: ['a']};
  assert.equal(validateDerived(invalidItem), 'item');
  assert.deepEqual(decideDerivedView({kind: 'validate', input: invalidItem}), {kind: 'validated', rejection: 'item'});
  assert.equal(validateDerived({kind: 'item', ordinal: 0n, viewKind: 'taxonomy', item: item({evidenceAnchorIds: ['a', 'a']}), allowedAnchors: ['a']}), 'item');
});
