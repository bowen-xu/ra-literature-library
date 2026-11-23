/** Central catalog operation dispatcher for the migrated literature backend. */

import {requireCatalogOperation, type CatalogOperation} from './catalog-protocol.mts';
import {prepareBrowserCapture, type BrowserCaptureInput} from './browser-capture.mts';
import {decideEvidenceMatrix, type MatrixValidationInput} from './evidence-matrix.mts';
import {decideEvidenceWrite, type EvidenceWriteInput} from './evidence-write.mts';
import {prepareBibtex} from './import-jobs.mts';
import {prepareLifecycle, type LifecycleRequest} from './literature-lifecycle.mts';
import {prepareNalAnnotationLink, planNalAnnotation, type NalAnnotationRequest, type NalAnnotationSnapshot, type NalAnnotation} from './nal-annotation.mts';
import {prepareNalQuerySave, projectNalQueryRow, validateNalQueryContent, type NalContent} from './nal-query.mts';
import {evaluatePaperPreparation, type PaperPreparationInput} from './paper-context-prepare.mts';
import {evaluate as evaluatePaperContextPreview, type PaperContextPreviewInput} from './paper-context-preview.mts';
import {prepareReferenceRecord, type ReferenceRecordDraft} from './reference-records.mts';
import {prepareTrashCleanup} from './trash-cleanup.mts';
import {prepareConceptRetrieval, type ConceptRetrievalInput} from './concept-retrieval-prepare.mts';
import {prepareMetadata} from './metadata.mts';

export interface CatalogDispatchRequest {readonly operation: string; readonly input: unknown}
export interface CatalogDispatchResult {readonly operation: CatalogOperation; readonly input: unknown; readonly result: unknown}

/**
 * Route only operations whose pure TypeScript producer has landed. The
 * remaining operation names are rejected explicitly so a host cannot silently
 * report a fake successful result while the later migration batches are open.
 */
export function dispatchCatalog(request: CatalogDispatchRequest): CatalogDispatchResult {
  const operation = requireCatalogOperation(request.operation);
  let result: unknown;
  switch (operation) {
    case 'prepareBrowserCapture': result = prepareBrowserCapture(request.input as BrowserCaptureInput); break;
    case 'prepareLiteratureLifecycle': result = prepareLifecycle(request.input as LifecycleRequest); break;
    case 'prepareTrashCleanup': result = prepareTrashCleanup(); break;
    case 'validateEvidenceWrite': result = decideEvidenceWrite(request.input as EvidenceWriteInput); break;
    case 'validateEvidenceMatrix': result = decideEvidenceMatrix(request.input as MatrixValidationInput); break;
    case 'prepareReferenceRecord': result = prepareReferenceRecord(request.input as ReferenceRecordDraft); break;
    case 'prepareBibtex': result = prepareBibtex(request.input as {readonly inputs: readonly any[]}); break;
    case 'prepareNalQuerySave': result = prepareNalQuerySave(request.input as NalContent); break;
    case 'readNalQueries': result = projectNalQueryRow(request.input as {revision: number; definitionsJson: string; cacheJson: string | null; legacyImported: boolean}); break;
    case 'validateNalAnnotation': result = {kind: (validateNalAnnotationRequest(request.input as NalAnnotationRequest) === null ? 'valid' : 'invalidRequest')}; break;
    case 'prepareNalAnnotation': {const input = request.input as {request: NalAnnotationRequest; snapshot: NalAnnotationSnapshot}; result = planNalAnnotation(input.request, input.snapshot); break;}
    case 'prepareConceptRetrieval': result = prepareConceptRetrieval(request.input as ConceptRetrievalInput); break;
    case 'prepareMetadata': result = prepareMetadata(request.input); break;
    case 'preparePaperContext': result = dispatchPaperContext(request.input as PaperContextDispatchInput); break;
    default: throw new Error(`literature_catalog_operation_unimplemented:${operation}`);
  }
  return {operation, input: structuredClone(request.input), result};
}


type PaperContextDispatchInput = PaperPreparationInput | PaperContextPreviewInput;
function dispatchPaperContext(input: PaperContextDispatchInput): unknown {
  return 'kind' in input && ['header', 'preflight', 'snapshot'].includes(input.kind)
    ? evaluatePaperContextPreview(input as PaperContextPreviewInput)
    : evaluatePaperPreparation(input as PaperPreparationInput);
}

function validateNalAnnotationRequest(request: NalAnnotationRequest): 'invalidRequest' | null {
  return request.targetKind === 'concept' || request.targetKind === 'statement' ? (request.targetId.trim() !== '' && request.title.trim() !== '' ? null : 'invalidRequest') : 'invalidRequest';
}
