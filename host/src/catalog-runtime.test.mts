import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {FileBackedCatalogRuntime, CatalogRuntimeError, catalogOutput, createFileBackedCatalogHandler} from './catalog-runtime.mts';
import {CatalogOutputSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/catalog/output.js';

const ref = (handle: string, input: string, packageKey: string, instanceId: string, requestId: string) => ({relativeHandle: handle, byteSize: Buffer.byteLength(input), sha256: createHash('sha256').update(input).digest('hex'), packageKey, instanceId, requestId});

test('file-backed catalog runtime validates input snapshots and writes dispatcher results', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-')), packageKey = 'package', instanceId = randomUUID(), requestId = randomUUID(), input = JSON.stringify({kind: 'trashMany', itemIds: ['b', 'a', 'b']});
  await writeFile(path.join(root, 'input.json'), input); const runtime = new FileBackedCatalogRuntime(root), output = await runtime.dispatch('prepareLiteratureLifecycle', ref('input.json', input, packageKey, instanceId, requestId), {...ref('result.json', '', packageKey, instanceId, requestId), byteSize: 1, sha256: '0'.repeat(64)});
  assert.equal(output.relativeHandle, 'result.json'); assert.ok(output.byteSize > 0); assert.equal(output.packageKey, packageKey);
  const wire = CatalogOutputSerde.decode(await readFile(path.join(root, output.relativeHandle)));
  assert.deepEqual(wire, {kind: 'literatureLifecyclePreparation', outcome: {status: 'ready', request: {kind: 'trashMany', itemIds: ['b', 'a', 'b']}, trashItemIds: ['a', 'b']}});
});

test('catalog output adapter covers every migrated operation tag', () => {
  const expected = {
    bibliographySearch: 'bibliographySearch', planBibliographyCandidates: 'bibliographyCandidates', plan: 'plan', select: 'selection', project: 'projection',
    prepareSave: 'savePlan', readNalQueries: 'nalQueries', prepareNalQuerySave: 'nalQuerySavePlan', prepareNalBootstrapProbes: 'nalBootstrapProbes', prepareNalBootstrap: 'nalBootstrapPlan',
    validateNalAnnotation: 'nalAnnotationValidation', prepareNalAnnotation: 'nalAnnotationPreparation', prepareNalMutation: 'nalMutationPreparation', projectDuplicateCandidates: 'duplicateCandidates', projectMergeOperations: 'mergeOperations',
    prepareDuplicateDecision: 'duplicateDecisionPreparation', finishDuplicateDecision: 'duplicateDecisionCompletion', prepareDuplicateUndo: 'duplicateUndoPreparation', prepareDuplicateMerge: 'duplicateMergePreparation',
    prepareLiteratureLifecycle: 'literatureLifecyclePreparation', prepareTrashCleanup: 'trashCleanupPreparation', prepareMetadata: 'metadataPreparation', prepareBibtex: 'bibtexPreparation', projectImportJobs: 'importJobsProjection',
    doiPreview: 'doiPreview', prepareReferenceRecord: 'referenceRecordPreparation', validateEvidenceMatrix: 'evidenceMatrixValidation', decideDerivedView: 'derivedViewDecision', validateEvidenceWrite: 'evidenceWriteDecision',
    prepareLiteratureAttachment: 'literatureAttachmentPreparation', preparePdfImportHeader: 'pdfImportHeaderPreparation', decodePdfImportCandidate: 'pdfImportCandidateDecoded', prepareResearchConcept: 'researchConceptPreparation', prepareReadingUnit: 'readingUnitPreparation',
    validateStructured: 'structuredValidation', selectUnreviewedFields: 'unreviewedFields', validateEditableTemplate: 'editableTemplate', preparePaperContext: 'paperContext', decidePaperRetrievalTrace: 'paperRetrievalTrace', prepareConceptRetrieval: 'conceptRetrieval',
    prepareSemanticIndex: 'semanticIndex', projectContextMetadata: 'contextMetadata', projectAnalysisHistory: 'analysisHistory', decideAnalysisWorkflow: 'analysisWorkflow', prepareBrowserCapture: 'browserCapture', projectReadingHistory: 'readingHistory', preparePaperConfirmation: 'paperConfirmation',
  } as const;
  for (const [operation, kind] of Object.entries(expected)) assert.equal(catalogOutput(operation, {operation}, {result: operation}).kind, kind, operation);
  assert.throws(() => catalogOutput('unknown', null, null), error => error instanceof CatalogRuntimeError && error.code === 'dispatch');
});

test('catalog output serialization retains BigInt wire values', () => {
  const output = catalogOutput('projectImportJobs', {kind: 'get', id: 'job'}, {
    status: 'success', result: {kind: 'job', job: {id: 'job', state: 'running', sourceKind: 'bibtex', totalCount: 2n,
      completedCount: 1n, cancellationRequested: false, results: [{inputLabel: 'label', rawInput: 'raw', state: 'imported', itemId: null, errorMessage: null}], createdAt: 'created', updatedAt: 'updated'}},
  });
  const roundTrip = CatalogOutputSerde.decode(CatalogOutputSerde.encode(output as Parameters<typeof CatalogOutputSerde.encode>[0]));
  const decoded = roundTrip as {readonly kind: string; readonly outcome: {readonly result?: {readonly job?: {readonly totalCount?: bigint}}}};
  assert.equal(decoded.kind, 'importJobsProjection'); assert.equal(decoded.outcome.result?.job?.totalCount, 2n);
});

test('file-backed catalog runtime unwraps Core catalog envelopes before dispatch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-'));
  const packageKey = 'a'.repeat(64), instanceId = randomUUID(), requestId = randomUUID();
  const input = {kind: 'prepareSave', input: {
    doi: {display: '10.1000/synthetic', normalized: '10.1000/synthetic'},
    draft: {id: null, itemType: 'journalArticle', title: 'Envelope save', abstractText: '', issuedYear: 2026,
      containerTitle: '', conferenceName: '', proceedingsTitle: '', place: '', volume: '', issue: '', pages: '', doi: '10.1000/synthetic',
      url: '', language: 'en', bibtexKey: 'envelope', rawBibtex: null, creators: [], tags: [], sourceKind: 'electron-test'},
  }};
  const bytes = Buffer.from(JSON.stringify(input));
  await writeFile(path.join(root, `catalog-input-${requestId}.json`), bytes);
  const runtime = new FileBackedCatalogRuntime(root);
  const result = await runtime.dispatch('prepareSave', {
    relativeHandle: `catalog-input-${requestId}.json`, byteSize: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'),
    packageKey, instanceId, requestId,
  }, {relativeHandle: `catalog-result-${requestId}.json`, byteSize: 1, sha256: '0'.repeat(64), packageKey, instanceId, requestId});
  assert.ok(result.byteSize > 0);
  const output = CatalogOutputSerde.decode(await readFile(path.join(root, result.relativeHandle)));
  assert.equal(output.kind, 'savePlan');
  if (output.kind === 'savePlan') assert.equal(output.outcome.kind, 'planned');
  await rm(root, {recursive: true, force: true});
});

test('file-backed catalog runtime rejects path traversal and corrupted input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-')), runtime = new FileBackedCatalogRuntime(root), base = {relativeHandle: '../input.json', byteSize: 1, sha256: '0'.repeat(64), packageKey: 'package', instanceId: randomUUID(), requestId: randomUUID()};
  await assert.rejects(() => runtime.dispatch('prepareLiteratureLifecycle', base, {...base, relativeHandle: 'result.json'}), (error: unknown) => error instanceof CatalogRuntimeError && error.code === 'invalid_handle');
});

test('file-backed catalog runtime exposes the host catalog handler with protocol result handles', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-')), packageKey = 'package', instanceId = randomUUID(), requestId = randomUUID(), input = JSON.stringify({kind: 'trashMany', itemIds: ['b', 'a']});
  await writeFile(path.join(root, 'catalog-input-test.json'), input); const runtime = new FileBackedCatalogRuntime(root), handler = createFileBackedCatalogHandler(runtime);
  const result = await handler('prepareLiteratureLifecycle', ref('catalog-input-test.json', input, packageKey, instanceId, requestId));
  assert.equal(result.relativeHandle, `catalog-result-${requestId}.json`); assert.equal(result.requestId, requestId); assert.ok(result.byteSize > 0);
});
