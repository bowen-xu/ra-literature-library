import type {
  ConceptAlgorithmRun,
  ConceptEvolutionEvent,
  PaperFoundationSimilarity,
  SharedFoundationConcept,
} from "@research-assistant/core/knowledge";

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? value as number : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined | null {
  return value === undefined ? null : string(value);
}

function optionalInteger(value: unknown): number | undefined | null {
  return value === undefined ? null : integer(value);
}

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): Values[number] | undefined {
  return typeof value === "string" && values.includes(value)
    ? value as Values[number] : undefined;
}

function list<T>(value: unknown, decode: (item: unknown) => T | undefined): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const decoded = value.map(decode);
  return decoded.some((item) => item === undefined) ? undefined : decoded as readonly T[];
}

function evolutionEvent(value: unknown): ConceptEvolutionEvent | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const ordinal = integer(data.ordinal); const conceptId = string(data.conceptId);
  const conceptRevision = integer(data.conceptRevision); const conceptLabel = string(data.conceptLabel);
  const paperId = string(data.paperId); const paperTitle = string(data.paperTitle);
  const issuedYear = optionalInteger(data.issuedYear); const assertionId = string(data.assertionId);
  const assertionRevision = integer(data.assertionRevision);
  const paperFunction = oneOf(data.paperFunction, ["foundational", "prerequisite", "focal"] as const);
  const noveltyStatus = oneOf(data.noveltyStatus,
    ["pre_existing", "adapted_by_paper", "introduced_by_paper", "unclear"] as const);
  const eventKind = oneOf(data.eventKind, ["introduced", "adapted", "reused", "unclear"] as const);
  const explanation = string(data.explanation); const evidenceAnchorId = optionalString(data.evidenceAnchorId);
  if (ordinal === undefined || ordinal < 0 || conceptId === undefined || conceptRevision === undefined
    || conceptRevision < 1 || conceptLabel === undefined || paperId === undefined || paperTitle === undefined
    || issuedYear === undefined || assertionId === undefined || assertionRevision === undefined
    || assertionRevision < 1 || paperFunction === undefined || noveltyStatus === undefined
    || eventKind === undefined || explanation === undefined || evidenceAnchorId === undefined) return undefined;
  return { ordinal, conceptId, conceptRevision, conceptLabel, paperId, paperTitle, assertionId,
    assertionRevision, paperFunction, noveltyStatus, eventKind, explanation,
    ...(issuedYear === null ? {} : { issuedYear }),
    ...(evidenceAnchorId === null ? {} : { evidenceAnchorId }) };
}

function sharedConcept(value: unknown): SharedFoundationConcept | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const conceptId = string(data.conceptId); const conceptRevision = integer(data.conceptRevision);
  const label = string(data.label); const weight = finite(data.weight);
  return conceptId === undefined || conceptRevision === undefined || conceptRevision < 1
    || label === undefined || weight === undefined || weight <= 0
    ? undefined : { conceptId, conceptRevision, label, weight };
}

function similarity(value: unknown): PaperFoundationSimilarity | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const ordinal = integer(data.ordinal); const leftPaperId = string(data.leftPaperId);
  const leftPaperTitle = string(data.leftPaperTitle); const rightPaperId = string(data.rightPaperId);
  const rightPaperTitle = string(data.rightPaperTitle);
  const sharedConcepts = list(data.sharedConcepts, sharedConcept);
  const weightedJaccard = finite(data.weightedJaccard);
  const sharedConceptCount = integer(data.sharedConceptCount);
  const leftFoundationCount = integer(data.leftFoundationCount);
  const rightFoundationCount = integer(data.rightFoundationCount);
  if (ordinal === undefined || ordinal < 0 || leftPaperId === undefined || leftPaperTitle === undefined
    || rightPaperId === undefined || rightPaperTitle === undefined || leftPaperId >= rightPaperId
    || sharedConcepts === undefined || weightedJaccard === undefined || weightedJaccard < 0
    || weightedJaccard > 1 || sharedConceptCount === undefined || sharedConceptCount < 0
    || sharedConceptCount !== sharedConcepts.length || leftFoundationCount === undefined
    || leftFoundationCount < 0 || rightFoundationCount === undefined || rightFoundationCount < 0) {
    return undefined;
  }
  return { ordinal, leftPaperId, leftPaperTitle, rightPaperId, rightPaperTitle, sharedConcepts,
    weightedJaccard, sharedConceptCount, leftFoundationCount, rightFoundationCount };
}

export function decodeConceptAlgorithmRun(value: unknown): ConceptAlgorithmRun | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const id = string(data.id);
  const algorithmKind = oneOf(data.algorithmKind, ["concept_evolution", "shared_foundations"] as const);
  const algorithmId = string(data.algorithmId); const algorithmVersion = integer(data.algorithmVersion);
  const parametersHash = string(data.parametersHash);
  const conceptRevisionWatermark = integer(data.conceptRevisionWatermark);
  const relationRevisionWatermark = integer(data.relationRevisionWatermark);
  const paperScopeHash = string(data.paperScopeHash);
  const status = oneOf(data.status, ["running", "succeeded", "failed", "canceled", "stale"] as const);
  const resultCount = integer(data.resultCount); const createdAt = string(data.createdAt);
  const startedAt = string(data.startedAt); const finishedAt = optionalString(data.finishedAt);
  const evolutionEvents = list(data.evolutionEvents, evolutionEvent);
  const foundationSimilarities = list(data.foundationSimilarities, similarity);
  const incompatibleResult = algorithmKind === "concept_evolution"
    ? (foundationSimilarities?.length ?? 0) > 0 : (evolutionEvents?.length ?? 0) > 0;
  if (id === undefined || algorithmKind === undefined || algorithmId === undefined
    || algorithmVersion === undefined || algorithmVersion < 1 || parametersHash === undefined
    || parametersHash.length !== 64 || conceptRevisionWatermark === undefined
    || conceptRevisionWatermark < 0 || relationRevisionWatermark === undefined
    || relationRevisionWatermark < 0 || paperScopeHash === undefined || paperScopeHash.length !== 64
    || status === undefined || resultCount === undefined || resultCount < 0 || createdAt === undefined
    || startedAt === undefined || finishedAt === undefined || evolutionEvents === undefined
    || foundationSimilarities === undefined || incompatibleResult
    || (status === "running") === (finishedAt !== null)
    || resultCount !== evolutionEvents.length + foundationSimilarities.length) return undefined;
  return { id, algorithmKind, algorithmId, algorithmVersion, parametersHash,
    conceptRevisionWatermark, relationRevisionWatermark, paperScopeHash, status, resultCount,
    createdAt, startedAt, evolutionEvents, foundationSimilarities,
    ...(finishedAt === null ? {} : { finishedAt }) };
}
