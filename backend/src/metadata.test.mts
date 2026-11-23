import assert from 'node:assert/strict';
import test from 'node:test';
import {confirmMetadataFields, diffMetadata, metadataDerivationPolicy, prepareMetadata, prepareMetadataPatch, type CatalogDraft, type MetadataItem} from './metadata.mts';

const draft = (overrides: Partial<CatalogDraft> = {}): CatalogDraft => ({id: null, itemType: 'journalArticle', title: 'Title', abstractText: '', issuedYear: null, containerTitle: '', conferenceName: '', proceedingsTitle: '', place: '', volume: '', issue: '', pages: '', doi: '', url: '', language: '', bibtexKey: '', rawBibtex: null, creators: [], tags: [], sourceKind: 'user', ...overrides});

test('metadata patches preserve type/title/DOI and trim creator/tag values', () => {
  assert.deepEqual(prepareMetadataPatch({fieldName: 'itemType', value: 'unknown'}, null), {status: 'rejected', error: {kind: 'unsupportedType', itemType: 'unknown'}});
  assert.deepEqual(prepareMetadataPatch({fieldName: 'title', value: '  Title  '}, null), {status: 'ready', patch: {fieldName: 'title', value: 'Title'}, doi: null});
  assert.deepEqual(prepareMetadataPatch({fieldName: 'doi', value: 'raw'}, {display: '10/x', normalized: '10/x'}), {status: 'ready', patch: {fieldName: 'doi', value: '10/x'}, doi: {display: '10/x', normalized: '10/x'}});
  assert.deepEqual(prepareMetadataPatch({fieldName: 'tags', value: [' a ', '', 'b']}, null), {status: 'ready', patch: {fieldName: 'tags', value: ['a', 'b']}, doi: null});
});

test('metadata confirmation and diffs preserve field order and user provenance', () => {
  assert.deepEqual(confirmMetadataFields(['title', 'doi', 'title']), ['doi', 'title']); assert.deepEqual(confirmMetadataFields([]), {kind: 'invalidFields', reason: '至少选择一个字段'});
  const current = {...draft({title: 'Old'}), metadataSources: [{fieldName: 'title', confirmedByUser: true}]} as MetadataItem;
  assert.deepEqual(diffMetadata(current, draft({title: 'New'}), '', ''), [{fieldName: 'title', currentValue: 'Old', candidateValue: 'New', userConfirmed: true}]);
  assert.deepEqual(metadataDerivationPolicy(), {titleRule: 'unicodeLowercase', doiReason: 'doi', doiConfidence: 1, titleReason: 'normalized_title_year', titleConfidence: 0.72});
});

test('metadata fullApply and fieldsApply preserve candidate provenance and complete-diff review', () => {
  const candidate = draft({title: 'Candidate', sourceKind: 'external'}), current = {...draft({title: 'Current'}), id: 'item', metadataSources: []} as MetadataItem;
  const full = prepareMetadata({kind: 'fullApply', input: {candidateId: 'candidate', header: {itemId: 'item', sourceKind: 'doi', sourceReference: 'ref', importResultId: null}, candidate, candidateNormalizedDoi: '10/x', draft: candidate, doi: {display: '10/x', normalized: '10/x'}}});
  assert.equal(full.kind, 'fullApply'); if (full.kind === 'fullApply') {assert.equal(full.plan.save.kind, 'planned'); assert.equal(full.plan.fieldSources[0]?.provenance.sourceKind, 'doi');}
  const fields = prepareMetadata({kind: 'fieldsApply', input: {candidateId: 'candidate', header: {itemId: 'item', sourceKind: 'doi', sourceReference: 'ref', importResultId: null}, candidate, current, candidateDoi: {display: '10/x', normalized: '10/x'}, currentNormalizedDoi: '', decisions: [{fieldName: 'doi', choice: 'candidate'}, {fieldName: 'title', choice: 'candidate'}], candidateTrust: 'trusted'}});
  assert.equal(fields.kind, 'fieldsApply'); if (fields.kind === 'fieldsApply') {assert.equal((fields.outcome as any).status, 'ready'); assert.equal((fields.outcome as any).decisions[0].provenance.confirmedByUser, true);}
  const incomplete = prepareMetadata({kind: 'fieldsApply', input: {candidateId: 'candidate', header: {itemId: 'item', sourceKind: 'doi', sourceReference: null, importResultId: null}, candidate, current, candidateDoi: {display: '10/x', normalized: '10/x'}, currentNormalizedDoi: '', decisions: [], candidateTrust: 'reviewable'}});
  assert.equal((incomplete as any).outcome.status, 'rejected');
});
