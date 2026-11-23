import assert from 'node:assert/strict';
import test from 'node:test';
import {finishImportState, importJobRules, prepareBibtex} from './import-jobs.mts';
import type {CatalogDraft} from './catalog-save.mts';

const draft = (overrides: Partial<CatalogDraft> = {}): CatalogDraft => ({
  id: null, itemType: 'journalArticle', title: 'Title', abstractText: '', issuedYear: null, containerTitle: '', conferenceName: '', proceedingsTitle: '', place: '', volume: '', issue: '', pages: '', doi: '', url: '', language: '', bibtexKey: 'key', rawBibtex: null,
  creators: [], tags: [], sourceKind: null, ...overrides,
});

test('import jobs preserve empty-input and finish-state rules', () => {
  assert.deepEqual(prepareBibtex({inputs: []}), {status: 'rejected', reason: {kind: 'emptyTitle'}, message: '标题不能为空'});
  assert.equal(finishImportState(0, 0), 'completed');
  assert.equal(finishImportState(0, 1), 'failed');
  assert.equal(finishImportState(1, 1), 'completed_with_errors');
  assert.deepEqual(importJobRules().finishStates, {noFailed: 'completed', noImported: 'failed', mixed: 'completed_with_errors'});
});

test('import jobs serialize the original draft before marking the save source', () => {
  const result = prepareBibtex({inputs: [{draft: draft({title: 'Imported', sourceKind: null}), doi: {display: '', normalized: ''}}]});
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.plan.entries[0]?.inputLabel, 'key');
  assert.ok(result.plan.entries[0]?.rawInput.includes('"sourceKind":null'));
  assert.equal(result.plan.entries[0]?.save.kind, 'planned');
  if (result.plan.entries[0]?.save.kind === 'planned') assert.equal(result.plan.entries[0].save.plan.provenance.sourceKind, 'bibtex');
});
