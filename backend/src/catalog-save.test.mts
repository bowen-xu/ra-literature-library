import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareCatalogSave, type CatalogDraft} from './catalog-save.mts';

const draft = (overrides: Partial<CatalogDraft> = {}): CatalogDraft => ({
  id: null, itemType: 'journalArticle', title: ' Title ', abstractText: ' abstract ', issuedYear: 2026,
  containerTitle: ' Journal ', conferenceName: ' Conference ', proceedingsTitle: ' Proceedings ', place: ' Place ', volume: ' 1 ', issue: ' 2 ', pages: ' 3 ', doi: '', url: ' url ', language: ' en ', bibtexKey: ' key ', rawBibtex: null,
  creators: [{familyName: ' Family ', givenName: ' Given ', literalName: ' ', role: 'author'}], tags: [' tag ', ''], sourceKind: null, ...overrides,
});

test('catalog save rejects unsupported types and empty titles', () => {
  assert.deepEqual(prepareCatalogSave({draft: draft({itemType: 'unknown'}), doi: {display: '', normalized: ''}}), {kind: 'rejected', reason: {kind: 'unsupportedType', itemType: 'unknown'}});
  assert.deepEqual(prepareCatalogSave({draft: draft({title: '  '}), doi: {display: '', normalized: ''}}), {kind: 'rejected', reason: {kind: 'emptyTitle'}});
});

test('catalog save trims fields, tags and creators while preserving provenance', () => {
  const result = prepareCatalogSave({draft: draft({sourceKind: 'bibtex'}), doi: {display: ' 10/x ', normalized: '10/x'}});
  assert.equal(result.kind, 'planned');
  if (result.kind !== 'planned') return;
  assert.equal(result.plan.item.title, 'Title');
  assert.deepEqual(result.plan.tags, ['tag']);
  assert.equal(result.plan.creators[0]?.familyName, 'Family');
  assert.equal(result.plan.doi?.normalized, '10/x');
  assert.equal(result.plan.provenance.confirmedByUser, false);
  assert.equal(result.plan.duplicates.normalizedTitle, 'title');
});
