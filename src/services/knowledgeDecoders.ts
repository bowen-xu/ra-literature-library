import {
  RELATION_NODE_KINDS,
  RELATION_PREDICATE_KINDS,
  STRUCTURED_READING_UNIT_KINDS,
  type Concept,
  type ConceptCaptureResult,
  type ConceptIdentityEvent,
  type ConceptIdentitySummary,
  type ConceptMergeImpact,
  type DefinitionClaim,
  type PaperReadingProfileSelection,
  type ReadingProfile,
  type ReadingProfileRef,
  type RelationAssertion,
  type RelationNodeSummary,
  type ResearchObjectKind,
  type ResearchObjectRevision,
  type StructuredReadingUnit,
  type Term,
  type TermUsage,
} from "@research-assistant/core/knowledge";

type JsonObject = Readonly<Record<string, unknown>>;
type KnowledgeProvenance = Term["provenanceKind"];

const READING_UNIT_ROLES: readonly StructuredReadingUnit["epistemicRole"][] = [
  "source_paraphrase", "synthesis", "inference", "hypothesis", "question", "working_note",
];
const RESEARCH_OBJECT_KINDS: readonly ResearchObjectKind[] = [
  "claim", "reading_unit", "term", "concept", "term_usage", "definition_claim",
  "relation_assertion",
];
const REVISION_EDITORS: readonly ResearchObjectRevision["editorKind"][] = [
  "human", "migration", "ai_review", "system",
];
const READING_PROFILE_KINDS: readonly ReadingProfile["profileKind"][] = [
  "generic", "technical_empirical", "philosophical_conceptual",
];

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalString(value: unknown): string | undefined | null {
  return value === undefined ? undefined : typeof value === "string" ? value : null;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function contentSha256(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function provenance(value: unknown): KnowledgeProvenance | undefined {
  return value === "human_original"
    || value === "ai_accepted_unchanged"
    || value === "ai_accepted_after_edit"
    ? value
    : undefined;
}

function decodeReadingProfileRef(value: unknown): ReadingProfileRef | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const profileId = requiredString(item.profileId);
  const profileVersion = positiveInteger(item.profileVersion);
  return profileId === undefined || profileId.length === 0 || profileVersion === undefined
    ? undefined : { profileId, profileVersion };
}

export function decodeReadingProfile(value: unknown): ReadingProfile | undefined {
  const item = objectValue(value);
  if (item === undefined || item.reviewStatus !== "approved") return undefined;
  const reference = decodeReadingProfileRef(item);
  const profileKind = READING_PROFILE_KINDS.find((kind) => kind === item.profileKind);
  const label = requiredString(item.label);
  const description = requiredString(item.description);
  const fieldKinds = decodeList(item.fieldKinds, (field) =>
    STRUCTURED_READING_UNIT_KINDS.find((kind) => kind === field));
  const createdAt = requiredString(item.createdAt);
  if (reference === undefined || profileKind === undefined || label === undefined
    || label.length === 0 || description === undefined || description.length === 0
    || fieldKinds === undefined || fieldKinds.length === 0 || fieldKinds.length > 10
    || new Set(fieldKinds).size !== fieldKinds.length || createdAt === undefined) return undefined;
  return {
    ...reference, profileKind, label, description, fieldKinds,
    reviewStatus: "approved", createdAt,
  };
}

function decodeConceptIdentitySummary(value: unknown): ConceptIdentitySummary | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const id = requiredString(item.id);
  const label = requiredString(item.label);
  const revision = positiveInteger(item.revision);
  const termCount = nonNegativeInteger(item.termCount);
  const definitionCount = nonNegativeInteger(item.definitionCount);
  const sourceCount = nonNegativeInteger(item.sourceCount);
  return id === undefined || id.length === 0 || label === undefined || revision === undefined
    || termCount === undefined || definitionCount === undefined || sourceCount === undefined
    ? undefined : { id, label, revision, termCount, definitionCount, sourceCount };
}

function decodeStringIds(value: unknown, maximum: number): readonly string[] | undefined {
  const values = decodeList(value, (item) => requiredString(item));
  return values === undefined || values.length > maximum || values.some((id) => id.length === 0)
    || new Set(values).size !== values.length
    ? undefined : values;
}

export function decodeConceptMergeImpact(value: unknown): ConceptMergeImpact | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const survivor = decodeConceptIdentitySummary(item.survivor);
  const sources = decodeList(item.sources, decodeConceptIdentitySummary);
  const affectedRelationIds = decodeStringIds(item.affectedRelationIds, 1_000);
  if (survivor === undefined || sources === undefined || sources.length === 0
    || sources.length > 10 || affectedRelationIds === undefined
    || sources.some((source) => source.id === survivor.id)
    || new Set(sources.map((source) => source.id)).size !== sources.length) return undefined;
  return { survivor, sources, affectedRelationIds };
}

export function decodeConceptIdentityEvent(value: unknown): ConceptIdentityEvent | undefined {
  const item = objectValue(value);
  if (item === undefined || item.operation !== "merge" && item.operation !== "split") {
    return undefined;
  }
  const impact = decodeConceptMergeImpact(item);
  const id = requiredString(item.id);
  const activeSourceIds = decodeStringIds(item.activeSourceIds, 10);
  const rationale = requiredString(item.rationale);
  const createdAt = requiredString(item.createdAt);
  if (impact === undefined || id === undefined || id.length === 0 || activeSourceIds === undefined
    || activeSourceIds.some((sourceId) => !impact.sources.some((source) => source.id === sourceId))
    || item.operation === "split" && activeSourceIds.length > 0
    || rationale === undefined || createdAt === undefined) return undefined;
  return { id, operation: item.operation, ...impact, activeSourceIds, rationale, createdAt };
}

export function decodePaperReadingProfileSelection(
  value: unknown,
): PaperReadingProfileSelection | undefined {
  const item = objectValue(value);
  if (item === undefined || typeof item.isPersisted !== "boolean") return undefined;
  const paperId = requiredString(item.paperId);
  const profiles = decodeList(item.profiles, decodeReadingProfileRef);
  const revision = nonNegativeInteger(item.revision);
  const createdAt = optionalString(item.createdAt);
  const updatedAt = optionalString(item.updatedAt);
  if (paperId === undefined || paperId.length === 0 || profiles === undefined
    || profiles.length > 3 || revision === undefined
    || createdAt === null || updatedAt === null
    || item.isPersisted !== (revision > 0)
    || new Set(profiles.map((profile) => `${profile.profileId}:${profile.profileVersion}`)).size
      !== profiles.length) return undefined;
  return {
    paperId, profiles, revision, isPersisted: item.isPersisted,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

export function decodeTerm(value: unknown): Term | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const id = requiredString(item.id);
  const text = requiredString(item.text);
  const normalizedText = requiredString(item.normalizedText);
  const language = requiredString(item.language);
  const provenanceKind = provenance(item.provenanceKind);
  const revision = positiveInteger(item.revision);
  const createdAt = requiredString(item.createdAt);
  const updatedAt = requiredString(item.updatedAt);
  return id === undefined || text === undefined || normalizedText === undefined
    || language === undefined || provenanceKind === undefined || revision === undefined
    || createdAt === undefined || updatedAt === undefined
    ? undefined
    : { id, text, normalizedText, language, provenanceKind, revision, createdAt, updatedAt };
}

export function decodeReadingUnit(value: unknown): StructuredReadingUnit | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const id = requiredString(item.id);
  const templateRecord = objectValue(item.templateField);
  const portraitCandidateId = templateRecord === undefined ? undefined : requiredString(templateRecord.portraitCandidateId);
  const fieldId = templateRecord === undefined ? undefined : requiredString(templateRecord.fieldId);
  if (item.templateField !== undefined && (portraitCandidateId === undefined || portraitCandidateId.length === 0 || fieldId === undefined || !/^[a-z][a-z0-9_-]{0,63}$/.test(fieldId))) return undefined;
  const unitKind = STRUCTURED_READING_UNIT_KINDS.find((kind) => kind === item.unitKind);
  const title = requiredString(item.title);
  const body = requiredString(item.body);
  const epistemicRole = READING_UNIT_ROLES.find((role) => role === item.epistemicRole);
  const provenanceKind = provenance(item.provenanceKind);
  const revision = positiveInteger(item.revision);
  const evidenceCount = nonNegativeInteger(item.evidenceCount);
  const createdAt = requiredString(item.createdAt);
  const updatedAt = requiredString(item.updatedAt);
  const projectId = optionalString(item.projectId);
  const projectTitle = optionalString(item.projectTitle);
  const paperId = optionalString(item.paperId);
  const paperTitle = optionalString(item.paperTitle);
  if (id === undefined || unitKind === undefined || title === undefined || body === undefined
    || epistemicRole === undefined || provenanceKind === undefined || revision === undefined
    || evidenceCount === undefined || createdAt === undefined || updatedAt === undefined
    || projectId === null || projectTitle === null || paperId === null || paperTitle === null) return undefined;
  return {
    id,
    ...(projectId === undefined ? {} : { projectId }),
    ...(projectTitle === undefined ? {} : { projectTitle }),
    ...(paperId === undefined ? {} : { paperId }),
    ...(paperTitle === undefined ? {} : { paperTitle }),
    unitKind, title, body, provenanceKind, epistemicRole, revision, evidenceCount, createdAt, updatedAt,
    ...(portraitCandidateId === undefined || fieldId === undefined ? {} : { templateField: { portraitCandidateId, fieldId } }),
  };
}

export function decodeConcept(value: unknown): Concept | undefined {
  const item = objectValue(value);
  if (item === undefined || !Array.isArray(item.terms)) return undefined;
  const id = requiredString(item.id);
  const preferredTerm = decodeTerm(item.preferredTerm);
  const decodedTerms = item.terms.map(decodeTerm);
  const label = requiredString(item.label);
  const explanation = requiredString(item.explanation);
  const disambiguation = requiredString(item.disambiguation);
  const domain = requiredString(item.domain);
  const tradition = requiredString(item.tradition);
  const period = requiredString(item.period);
  const provenanceKind = provenance(item.provenanceKind);
  const revision = positiveInteger(item.revision);
  const definitionCount = nonNegativeInteger(item.definitionCount);
  const sourceCount = nonNegativeInteger(item.sourceCount);
  const createdAt = requiredString(item.createdAt);
  const updatedAt = requiredString(item.updatedAt);
  if (id === undefined || preferredTerm === undefined || decodedTerms.some((term) => term === undefined)
    || label === undefined || explanation === undefined || disambiguation === undefined
    || domain === undefined || tradition === undefined || period === undefined
    || provenanceKind === undefined || revision === undefined || definitionCount === undefined
    || sourceCount === undefined || createdAt === undefined || updatedAt === undefined) return undefined;
  const terms = decodedTerms.filter((term): term is Term => term !== undefined);
  return {
    id, preferredTerm, terms, label, explanation, disambiguation, domain,
    tradition, period, provenanceKind, revision, definitionCount, sourceCount, createdAt, updatedAt,
  };
}

export function decodeDefinitionClaim(value: unknown): DefinitionClaim | undefined {
  const item = objectValue(value);
  if (item === undefined || item.epistemicRole !== "definition") return undefined;
  const id = requiredString(item.id);
  const conceptId = requiredString(item.conceptId);
  const statement = requiredString(item.statement);
  const scopeNote = requiredString(item.scopeNote);
  const provenanceKind = provenance(item.provenanceKind);
  const revision = positiveInteger(item.revision);
  const evidenceCount = nonNegativeInteger(item.evidenceCount);
  const createdAt = requiredString(item.createdAt);
  const updatedAt = requiredString(item.updatedAt);
  return id === undefined || conceptId === undefined || statement === undefined || scopeNote === undefined
    || provenanceKind === undefined || revision === undefined || evidenceCount === undefined
    || createdAt === undefined || updatedAt === undefined
    ? undefined
    : { id, conceptId, statement, scopeNote, provenanceKind, epistemicRole: "definition", revision, evidenceCount, createdAt, updatedAt };
}

export function decodeTermUsage(value: unknown): TermUsage | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const term = decodeTerm(item.term);
  const id = requiredString(item.id);
  const anchorId = requiredString(item.anchorId);
  const paperId = requiredString(item.paperId);
  const paperTitle = requiredString(item.paperTitle);
  const attachmentId = requiredString(item.attachmentId);
  const contentHash = contentSha256(item.contentSha256);
  const quoteExact = requiredString(item.quoteExact);
  const usageText = requiredString(item.usageText);
  const createdAt = requiredString(item.createdAt);
  const updatedAt = requiredString(item.updatedAt);
  const conceptId = optionalString(item.conceptId);
  const pageLabel = optionalString(item.pageLabel);
  const pageIndex = nonNegativeInteger(item.pageIndex);
  const provenanceKind = provenance(item.provenanceKind);
  const revision = positiveInteger(item.revision);
  if (term === undefined || conceptId === null || pageLabel === null || pageIndex === undefined
    || provenanceKind === undefined || revision === undefined
    || id === undefined || anchorId === undefined || paperId === undefined || paperTitle === undefined
    || attachmentId === undefined || contentHash === undefined || quoteExact === undefined
    || usageText === undefined || createdAt === undefined || updatedAt === undefined) return undefined;
  return {
    id, term, ...(conceptId === undefined ? {} : { conceptId }), anchorId,
    paperId, paperTitle, attachmentId, contentSha256: contentHash, pageIndex,
    ...(pageLabel === undefined ? {} : { pageLabel }), quoteExact, usageText,
    provenanceKind, revision, createdAt, updatedAt,
  };
}

export function decodeRelationNode(value: unknown): RelationNodeSummary | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const kind = RELATION_NODE_KINDS.find((candidate) => candidate === item.kind);
  const id = requiredString(item.id);
  const label = requiredString(item.label);
  const detail = requiredString(item.detail);
  return kind === undefined || id === undefined || label === undefined || detail === undefined
    ? undefined : { kind, id, label, detail };
}

export function decodeRelationAssertion(value: unknown): RelationAssertion | undefined {
  const item = objectValue(value);
  if (item === undefined || item.epistemicRole !== "assertion") return undefined;
  const id = requiredString(item.id);
  const projectId = optionalString(item.projectId);
  const projectTitle = optionalString(item.projectTitle);
  const subject = decodeRelationNode(item.subject);
  const object = decodeRelationNode(item.object);
  const predicateKind = RELATION_PREDICATE_KINDS.find(
    (candidate) => candidate === item.predicateKind,
  );
  const scopeNote = requiredString(item.scopeNote);
  const provenanceKind = provenance(item.provenanceKind);
  const revision = positiveInteger(item.revision);
  const evidenceCount = nonNegativeInteger(item.evidenceCount);
  const createdAt = requiredString(item.createdAt);
  const updatedAt = requiredString(item.updatedAt);
  if (id === undefined || projectId === null || projectTitle === null || subject === undefined
    || object === undefined || predicateKind === undefined || scopeNote === undefined
    || provenanceKind === undefined || revision === undefined || evidenceCount === undefined
    || createdAt === undefined || updatedAt === undefined) return undefined;
  return {
    id,
    ...(projectId === undefined ? {} : { projectId }),
    ...(projectTitle === undefined ? {} : { projectTitle }),
    subject,
    predicateKind,
    object,
    scopeNote,
    provenanceKind,
    epistemicRole: "assertion",
    revision,
    evidenceCount,
    createdAt,
    updatedAt,
  };
}

export function decodeResearchObjectRevision(value: unknown): ResearchObjectRevision | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const objectKind = RESEARCH_OBJECT_KINDS.find((kind) => kind === item.objectKind);
  const editorKind = REVISION_EDITORS.find((kind) => kind === item.editorKind);
  const snapshot = objectValue(item.snapshot);
  const id = requiredString(item.id);
  const objectId = requiredString(item.objectId);
  const revision = positiveInteger(item.revision);
  const changeReason = requiredString(item.changeReason);
  const createdAt = requiredString(item.createdAt);
  return id === undefined || objectKind === undefined || objectId === undefined
    || revision === undefined || snapshot === undefined || editorKind === undefined
    || changeReason === undefined || createdAt === undefined
    ? undefined
    : { id, objectKind, objectId, revision, snapshot, editorKind, changeReason, createdAt };
}

export function decodeConceptCaptureResult(value: unknown): ConceptCaptureResult | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const term = decodeTerm(item.term);
  const usage = decodeTermUsage(item.usage);
  const concept = item.concept === undefined ? undefined : decodeConcept(item.concept);
  const definitionClaim = item.definitionClaim === undefined
    ? undefined
    : decodeDefinitionClaim(item.definitionClaim);
  if (term === undefined || usage === undefined
    || (item.concept !== undefined && concept === undefined)
    || (item.definitionClaim !== undefined && definitionClaim === undefined)) return undefined;
  return {
    term,
    ...(concept === undefined ? {} : { concept }),
    usage,
    ...(definitionClaim === undefined ? {} : { definitionClaim }),
  };
}

export function decodeList<T>(value: unknown, decode: (entry: unknown) => T | undefined): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const decoded = value.map(decode);
  return decoded.some((entry) => entry === undefined)
    ? undefined
    : decoded.filter((entry): entry is T => entry !== undefined);
}
