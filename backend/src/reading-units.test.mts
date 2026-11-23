import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareReadingUnit, validateReadingUnitDraft, type StructuredReadingUnitDraft} from './reading-units.mts';

const draft = (overrides: Partial<StructuredReadingUnitDraft> = {}): StructuredReadingUnitDraft => ({
  id: null, projectId: null, paperId: 'paper', unitKind: 'other', title: ' Title ', body: ' Body ',
  epistemicRole: 'working_note', anchorId: null, evidenceStance: null, evidenceRationale: ' rationale ',
  expectedRevision: null, changeReason: null, ...overrides,
});

test('reading-unit preparation preserves list filters and normalizes manual saves', () => {
  assert.deepEqual(prepareReadingUnit({kind: 'list', projectId: ' project ', paperId: null}), {status: 'ready', plan: {kind: 'list', projectId: ' project ', paperId: null}});
  const result = prepareReadingUnit({kind: 'save', draft: draft()});
  assert.deepEqual(result, {status: 'ready', plan: {kind: 'save', draft: draft(), title: 'Title', body: 'Body', evidenceStance: 'context', evidenceRationale: 'rationale', rules: {
    provenanceKind: 'human_original', objectKind: 'reading_unit', editorKind: 'human', changeReason: 'manual_save', initialRevision: 1n, newExpectedRejection: null,
  }}});
});

test('reading-unit preparation preserves rejection order and new expected-revision protection', () => {
  assert.equal(validateReadingUnitDraft(draft({body: '   ', unitKind: 'bad', epistemicRole: 'bad'})), 'emptyBody');
  assert.equal(validateReadingUnitDraft(draft({title: 'x'.repeat(241)})), 'titleTooLong');
  assert.equal(validateReadingUnitDraft(draft({unitKind: 'bad'})), 'unitKind');
  assert.equal(validateReadingUnitDraft(draft({epistemicRole: 'bad'})), 'epistemicRole');
  assert.equal(validateReadingUnitDraft(draft({evidenceStance: 'bad'})), 'evidenceStance');
  const input = {kind: 'save' as const, draft: draft({expectedRevision: 3n})};
  assert.deepEqual(prepareReadingUnit(input), {status: 'ready', plan: {kind: 'save', draft: input.draft, title: 'Title', body: 'Body', evidenceStance: 'context', evidenceRationale: 'rationale', rules: {
    provenanceKind: 'human_original', objectKind: 'reading_unit', editorKind: 'human', changeReason: 'manual_save', initialRevision: 1n, newExpectedRejection: 'newExpectedRevision',
  }}});
  const invalid = {kind: 'save' as const, draft: draft({body: ''})};
  assert.deepEqual(prepareReadingUnit(invalid), {status: 'rejected', input: invalid, reason: 'emptyBody'});
});
