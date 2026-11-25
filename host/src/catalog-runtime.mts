/** File-backed catalog runtime bridge for the literature trace host. */

import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CatalogOutputSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/catalog/output.js';
import type {CatalogOutput} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/catalog/output.js';
import {dispatchCatalog} from '../../backend/src/catalog-dispatch.mts';
import {catalogResultHandle, type SnapshotRef} from '../../backend/src/literature-trace-protocol.mts';
import type {CatalogOperation} from '../../backend/src/catalog-protocol.mts';
import type {LiteratureTraceHostHandlers} from './literature-trace-host.mts';

export class CatalogRuntimeError extends Error {
  readonly code: 'invalid_handle' | 'input_mismatch' | 'io' | 'dispatch';
  constructor(code: 'invalid_handle' | 'input_mismatch' | 'io' | 'dispatch', message: string) {super(message); this.name = 'CatalogRuntimeError'; this.code = code;}
}

/**
 * The pure backend dispatcher retains its `{operation,input,result}` envelope
 * for diagnostics and unit tests.  The stdio host, however, is a wire adapter:
 * Core decodes the file payload with `CatalogOutputSerde`, whose tagged union
 * carries the operation-specific output kind and field names.  Keep that
 * protocol conversion here, at the host boundary, instead of making Core
 * understand an implementation-only dispatcher envelope.
 */
export function catalogOutput(operation: string, input: unknown, result: unknown): {readonly kind: string; readonly [key: string]: unknown} {
  const output = (() => {
    switch (operation as CatalogOperation) {
      case 'bibliographySearch': return {kind: 'bibliographySearch', decision: result};
      case 'planBibliographyCandidates': return {kind: 'bibliographyCandidates', plan: result};
      case 'plan': return {kind: 'plan', plan: result};
      case 'select': return {kind: 'selection', ids: result};
      case 'project': return {kind: 'projection', outcome: result};
      case 'prepareSave': return {kind: 'savePlan', outcome: result};
      case 'readNalQueries': return {kind: 'nalQueries', outcome: result};
      case 'prepareNalQuerySave': return {kind: 'nalQuerySavePlan', outcome: result};
      case 'prepareNalBootstrapProbes': return {kind: 'nalBootstrapProbes', outcome: result};
      case 'prepareNalBootstrap': return {kind: 'nalBootstrapPlan', outcome: result};
      case 'validateNalAnnotation': return {kind: 'nalAnnotationValidation', outcome: result};
      case 'prepareNalAnnotation': return {kind: 'nalAnnotationPreparation', outcome: result};
      case 'prepareNalMutation': return {kind: 'nalMutationPreparation', outcome: result};
      case 'projectDuplicateCandidates': return {kind: 'duplicateCandidates', items: result};
      case 'projectMergeOperations': return {kind: 'mergeOperations', items: result};
      case 'prepareDuplicateDecision': return {kind: 'duplicateDecisionPreparation', outcome: result};
      case 'finishDuplicateDecision': return {kind: 'duplicateDecisionCompletion', outcome: result};
      case 'prepareDuplicateUndo': return {kind: 'duplicateUndoPreparation', outcome: result};
      case 'prepareDuplicateMerge': return {kind: 'duplicateMergePreparation', outcome: result};
      case 'prepareLiteratureLifecycle': return {kind: 'literatureLifecyclePreparation', outcome: result};
      case 'prepareTrashCleanup': return {kind: 'trashCleanupPreparation', outcome: result};
      case 'prepareMetadata': return {kind: 'metadataPreparation', outcome: result};
      case 'prepareBibtex': return {kind: 'bibtexPreparation', outcome: result};
      case 'projectImportJobs': return {kind: 'importJobsProjection', outcome: result};
      case 'doiPreview': return {kind: 'doiPreview', outcome: result};
      case 'prepareReferenceRecord': return {kind: 'referenceRecordPreparation', outcome: result};
      case 'validateEvidenceMatrix': return {kind: 'evidenceMatrixValidation', decision: result};
      case 'decideDerivedView': return {kind: 'derivedViewDecision', decision: result};
      case 'validateEvidenceWrite': return {kind: 'evidenceWriteDecision', decision: result};
      case 'prepareLiteratureAttachment': return {kind: 'literatureAttachmentPreparation', outcome: result};
      case 'preparePdfImportHeader': return {kind: 'pdfImportHeaderPreparation', outcome: result};
      case 'decodePdfImportCandidate': return {kind: 'pdfImportCandidateDecoded', outcome: result};
      case 'prepareResearchConcept': return {kind: 'researchConceptPreparation', outcome: result};
      case 'prepareReadingUnit': return {kind: 'readingUnitPreparation', outcome: result};
      case 'validateStructured': return {kind: 'structuredValidation', outcome: result};
      case 'selectUnreviewedFields': return {kind: 'unreviewedFields', selection: result};
      case 'validateEditableTemplate': return {kind: 'editableTemplate', outcome: result};
      case 'preparePaperContext': return {kind: 'paperContext', outcome: result};
      case 'decidePaperRetrievalTrace': return {kind: 'paperRetrievalTrace', outcome: result};
      case 'prepareConceptRetrieval': return {kind: 'conceptRetrieval', outcome: result};
      case 'prepareSemanticIndex': return {kind: 'semanticIndex', outcome: result};
      case 'projectContextMetadata': return {kind: 'contextMetadata', outcome: result};
      case 'projectAnalysisHistory': return {kind: 'analysisHistory', outcome: result};
      case 'decideAnalysisWorkflow': return {kind: 'analysisWorkflow', outcome: result};
      case 'prepareBrowserCapture': return {kind: 'browserCapture', input, preparation: result};
      case 'projectReadingHistory': return {kind: 'readingHistory', input, decision: result};
      case 'preparePaperConfirmation': return {kind: 'paperConfirmation', outcome: result};
      default: throw new CatalogRuntimeError('dispatch', `literature_catalog_output_operation_invalid:${operation}`);
    }
  })();
  return output;
}

export class FileBackedCatalogRuntime {
  private readonly root: string;
  constructor(root: string) {this.root = root;}

  async readJson<T>(input: SnapshotRef): Promise<T> {
    let bytes: Uint8Array;
    try {bytes = await readFile(this.safePath(input.relativeHandle));}
    catch (cause) {if (cause instanceof CatalogRuntimeError) throw cause; throw new CatalogRuntimeError('io', 'literature_catalog_input_unavailable');}
    if (bytes.byteLength !== input.byteSize || digest(bytes) !== input.sha256) throw new CatalogRuntimeError('input_mismatch', 'literature_catalog_input_mismatch');
    try {return JSON.parse(new TextDecoder().decode(bytes)) as T;}
    catch {throw new CatalogRuntimeError('input_mismatch', 'literature_catalog_input_invalid_json');}
  }

  async dispatch(operation: string, input: SnapshotRef, output: SnapshotRef): Promise<SnapshotRef> {
    const value = await this.readJson<unknown>(input);
    let result: unknown;
    try {
      const dispatched = dispatchCatalog({operation, input: dispatchInput(operation, value)});
      result = catalogOutput(dispatched.operation, dispatched.input, dispatched.result);
    } catch (cause) {throw new CatalogRuntimeError('dispatch', cause instanceof Error ? cause.message : String(cause));}
    let resultBytes: Uint8Array;
    try {resultBytes = CatalogOutputSerde.encode(result as CatalogOutput);} catch (cause) {
      throw new CatalogRuntimeError('dispatch', cause instanceof Error ? cause.message : String(cause));
    }
    try {await writeFile(this.safePath(output.relativeHandle), resultBytes);} catch (cause) {if (cause instanceof CatalogRuntimeError) throw cause; throw new CatalogRuntimeError('io', 'literature_catalog_result_unavailable');}
    return {...output, byteSize: resultBytes.byteLength, sha256: digest(resultBytes)};
  }

  private safePath(relativeHandle: string): string {
    if (relativeHandle.length === 0 || path.isAbsolute(relativeHandle) || relativeHandle.includes('\\') || relativeHandle.split('/').some(part => part === '..' || part === '')) throw new CatalogRuntimeError('invalid_handle', 'literature_catalog_handle_invalid');
    const root = path.resolve(this.root), resolved = path.resolve(root, relativeHandle);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new CatalogRuntimeError('invalid_handle', 'literature_catalog_handle_invalid');
    return resolved;
  }
}

/** The wire `CatalogInput` is a tagged envelope.  The pure backend dispatcher
 * intentionally consumes the operation payload itself, so unwrap that envelope
 * only at this host boundary.  Keeping this adapter here preserves the backend
 * functions' direct test and reuse contract while matching the Core protocol. */
function dispatchInput(operation: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const envelope = value as Record<string, unknown>;
  // The unit-tested backend dispatcher also accepts the already-unwrapped
  // payload.  Only apply the wire adapter when the tagged kind identifies the
  // value as a CatalogInput envelope; otherwise preserve that direct payload.
  if (envelope.kind !== operation) return value;
  switch (operation) {
    case 'plan': return fieldOrValue(envelope, 'request');
    case 'select': return fieldOrValue(envelope, 'selection');
    case 'readNalQueries': return fieldOrValue(envelope, 'row');
    case 'prepareNalQuerySave': return fieldOrValue(envelope, 'content');
    case 'prepareNalBootstrapProbes': return fieldOrValue(envelope, 'source');
    case 'validateNalAnnotation': return fieldOrValue(envelope, 'request');
    case 'prepareLiteratureLifecycle': return fieldOrValue(envelope, 'request');
    case 'projectDuplicateCandidates':
    case 'projectMergeOperations': return envelope.rows;
    case 'preparePdfImportHeader': return {candidates: envelope.candidates};
    case 'decodePdfImportCandidate': return {rawInput: envelope.rawInput};
    case 'prepareTrashCleanup': return {};
    default:
      if (Object.hasOwn(envelope, 'input')) return envelope.input;
      if (Object.hasOwn(envelope, 'request')) return envelope.request;
      return envelope;
  }
}

function fieldOrValue(envelope: Record<string, unknown>, field: string): unknown {return Object.hasOwn(envelope, field) ? envelope[field] : envelope;}

function digest(bytes: Uint8Array): string {return createHash('sha256').update(bytes).digest('hex');}
export function newCatalogRequestIdentity(): {readonly instanceId: string; readonly requestId: string} {return {instanceId: randomUUID(), requestId: randomUUID()};}

export function createFileBackedCatalogHandler(runtime: FileBackedCatalogRuntime): LiteratureTraceHostHandlers['catalog'] {
  return (operation, input) => runtime.dispatch(operation, input, {
    relativeHandle: catalogResultHandle(input.requestId), byteSize: 1, sha256: '0'.repeat(64),
    packageKey: input.packageKey, instanceId: input.instanceId, requestId: input.requestId,
  });
}
