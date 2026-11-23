import assert from 'node:assert/strict';
import test from 'node:test';
import {dispatchCatalog} from './catalog-dispatch.mts';

test('catalog dispatcher routes migrated operations and echoes the input', () => {
  const input = {kind: 'trashMany', itemIds: ['b', 'a', 'b']};
  const result = dispatchCatalog({operation: 'prepareLiteratureLifecycle', input});
  assert.equal(result.operation, 'prepareLiteratureLifecycle'); assert.deepEqual(result.input, input); assert.deepEqual(result.result, {status: 'ready', request: input, trashItemIds: ['a', 'b']});
  const evidence = dispatchCatalog({operation: 'validateEvidenceWrite', input: {kind: 'stance', stance: 'supports'}}); assert.deepEqual(evidence.result, {rejection: null});
});

test('catalog dispatcher rejects unknown and not-yet-migrated operations explicitly', () => {
  assert.throws(() => dispatchCatalog({operation: 'unknown', input: {}}), /literature_catalog_operation_invalid/);
  const prepared = dispatchCatalog({operation: 'prepareMetadata', input: {kind: 'confirm', input: {itemId: 'paper', fieldNames: ['title']}}});
  assert.equal(prepared.operation, 'prepareMetadata'); assert.equal((prepared.result as any).kind, 'confirm');
  const reading = dispatchCatalog({operation: 'prepareReadingUnit', input: {kind: 'list', projectId: null, paperId: 'paper'}});
  assert.equal(reading.operation, 'prepareReadingUnit'); assert.deepEqual(reading.result, {status: 'ready', plan: {kind: 'list', projectId: null, paperId: 'paper'}});
  const context = dispatchCatalog({operation: 'projectContextMetadata', input: {paperId: 'paper', base: null, creators: [], identifiers: []}});
  assert.equal(context.operation, 'projectContextMetadata'); assert.deepEqual(context.result, {status: 'projected', bodyJson: '{"creators":[],"identifiers":[]}'});
  const derived = dispatchCatalog({operation: 'decideDerivedView', input: {kind: 'provenance', current: 'ai_suggestion', review: 'accepted'}});
  assert.equal(derived.operation, 'decideDerivedView'); assert.deepEqual(derived.result, {kind: 'provenance', value: 'ai_accepted_after_edit'});
  const semantic = dispatchCatalog({operation: 'prepareSemanticIndex', input: {stage: 'activate', status: 'building', pending: 0n}});
  assert.equal(semantic.operation, 'prepareSemanticIndex'); assert.deepEqual(semantic.result, {kind: 'flag', value: true});
  const duplicate = dispatchCatalog({operation: 'prepareDuplicateMerge', input: {candidateId: 'candidate', survivorItemId: 'left', leftItemId: 'left', rightItemId: 'right'}});
  assert.equal(duplicate.operation, 'prepareDuplicateMerge'); assert.equal((duplicate.result as any).mergedItemId, 'right');
  const pdf = dispatchCatalog({operation: 'decodePdfImportCandidate', input: {rawInput: '/tmp/Paper.pdf'}});
  assert.equal(pdf.operation, 'decodePdfImportCandidate'); assert.equal((pdf.result as any).candidate.draft.title, 'Paper');
  const selected = dispatchCatalog({operation: 'selectUnreviewedFields', input: {resourceId: 'r', resourceRevision: 1, pendingFieldIds: ['a', 'b', 'a'], protectedFieldIds: ['b'], reviewedFieldIds: []}});
  assert.deepEqual((selected.result as any).selectedFieldIds, ['a', 'a']);
  const planned = dispatchCatalog({operation: 'plan', input: {kind: 'list', query: '2026'}});
  assert.deepEqual(planned.result, {kind: 'search', ftsQuery: '{title creators} : "2026"*', year: 2026});
  const bibliography = dispatchCatalog({operation: 'bibliographySearch', input: {phase: 'prepare', query: ' DOI '}});
  assert.deepEqual(bibliography.result, {kind: 'needle', needle: '%doi%'});
  const duplicates = dispatchCatalog({operation: 'projectDuplicateCandidates', input: {rows: [[{kind: 'text', value: 'id'}, {kind: 'text', value: 'left'}, {kind: 'text', value: 'Left'}, {kind: 'text', value: 'right'}, {kind: 'text', value: 'Right'}, {kind: 'text', value: 'reason'}, {kind: 'text', value: '0000000000000000'}]]}});
  assert.equal((duplicates.result as any)[0].confidenceBits.asString(), '0000000000000000');
  const trace = dispatchCatalog({operation: 'decidePaperRetrievalTrace', input: {paperId: 'paper', query: 'question', row: null}});
  assert.deepEqual(trace.result, {input: {paperId: 'paper', query: 'question', row: null}, decision: {status: 'rejected', reason: 'not_found'}});
  const importJobs = dispatchCatalog({operation: 'projectImportJobs', input: {kind: 'cancel', affectedRows: 1n}});
  assert.deepEqual(importJobs.result, {status: 'success', result: {kind: 'done'}});
});
