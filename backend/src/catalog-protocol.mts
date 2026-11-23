/** Finite catalog operation set ported from workbench-native-sdk/catalog.rs. */
export const CATALOG_CAPABILITY_ID = 'literature.catalog-read';
export const CATALOG_CAPABILITY_VERSION = 1;

export const CATALOG_OPERATIONS = [
  'bibliographySearch', 'planBibliographyCandidates', 'plan', 'select', 'project', 'prepareSave',
  'readNalQueries', 'prepareNalQuerySave', 'prepareNalBootstrapProbes', 'prepareNalBootstrap',
  'validateNalAnnotation', 'prepareNalAnnotation', 'prepareNalMutation', 'projectDuplicateCandidates',
  'projectMergeOperations', 'prepareDuplicateDecision', 'finishDuplicateDecision', 'prepareDuplicateUndo',
  'prepareDuplicateMerge', 'prepareLiteratureLifecycle', 'prepareTrashCleanup', 'prepareMetadata',
  'prepareBibtex', 'projectImportJobs', 'doiPreview', 'prepareReferenceRecord', 'validateEvidenceMatrix',
  'decideDerivedView', 'validateEvidenceWrite', 'prepareLiteratureAttachment', 'preparePdfImportHeader',
  'decodePdfImportCandidate', 'prepareResearchConcept', 'prepareReadingUnit', 'validateStructured',
  'selectUnreviewedFields', 'validateEditableTemplate', 'preparePaperContext', 'decidePaperRetrievalTrace',
  'prepareConceptRetrieval', 'prepareSemanticIndex', 'projectContextMetadata', 'projectAnalysisHistory',
  'decideAnalysisWorkflow', 'prepareBrowserCapture', 'projectReadingHistory', 'preparePaperConfirmation',
] as const;

export type CatalogOperation = typeof CATALOG_OPERATIONS[number];

const operations = new Set<string>(CATALOG_OPERATIONS);
export function isCatalogOperation(value: unknown): value is CatalogOperation {
  return typeof value === 'string' && operations.has(value);
}

export function requireCatalogOperation(value: unknown): CatalogOperation {
  if (!isCatalogOperation(value)) throw new Error('literature_catalog_operation_invalid');
  return value;
}

export function validateCatalogCapability(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('literature_catalog_capability_invalid');
  const row = value as Record<string, unknown>;
  if (row.id !== CATALOG_CAPABILITY_ID || row.version !== CATALOG_CAPABILITY_VERSION) throw new Error('literature_catalog_capability_invalid');
}
