import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareReferenceRecord, validateReferenceDraft} from './reference-records.mts';

const draft = (overrides: Partial<{
  rawText: string; fields: readonly {name: string; value: string; sourceKind: string; confirmedByUser: boolean}[];
  semanticState: string; usageKind: string | null; usageSummary: string; usageAnchorId: string | null; matchedItemId: string | null;
}> = {}) => ({
  id: null, citingPaperId: 'paper', sourceAnchorId: 'anchor', rawText: overrides.rawText ?? ' Raw reference ',
  fields: overrides.fields ?? [{name: 'title', value: 'Title', sourceKind: 'reference_text', confirmedByUser: false}],
  parseState: 'parsed', identityState: overrides.matchedItemId === undefined ? 'unverified' : 'matched_existing',
  matchedItemId: overrides.matchedItemId ?? null, semanticState: overrides.semanticState ?? 'unreviewed',
  usageKind: overrides.usageKind ?? null, usageSummary: overrides.usageSummary ?? '', usageAnchorId: overrides.usageAnchorId ?? null,
  expectedRevision: null, changeReason: 'create',
});

test('reference records preserve state and metadata validation boundaries', () => {
  assert.equal(validateReferenceDraft(draft()), null);
  assert.equal(validateReferenceDraft(draft({semanticState: 'reviewed', usageKind: 'supports', usageSummary: 'Uses result', usageAnchorId: 'anchor'})), null);
  assert.equal(validateReferenceDraft(draft({semanticState: 'reviewed'})), 'invalidStates');
  assert.equal(validateReferenceDraft(draft({fields: [
    {name: 'title', value: 'a', sourceKind: 'reference_text', confirmedByUser: false},
    {name: 'title', value: 'b', sourceKind: 'human', confirmedByUser: false},
  ]})), 'invalidMetadataFields');
});

test('reference records trim prepared values and preserve full draft snapshot', () => {
  const value = prepareReferenceRecord(draft());
  assert.equal(value.status, 'ready');
  if (value.status !== 'ready') return;
  assert.equal(value.plan.rawText, 'Raw reference');
  assert.equal(value.plan.changeReason, 'create');
  assert.equal(value.plan.usageSummary, '');
  assert.ok(value.plan.fieldsJson.includes('reference_text'));
  assert.ok(value.plan.snapshotJson.includes('Raw reference'));
});
