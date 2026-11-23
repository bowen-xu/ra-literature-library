import type {
  Claim,
  EvidenceLink,
  EvidenceStance,
  SourceAnchorSummary,
} from "@research-assistant/core/evidence";
import type { SourceRect } from "@research-assistant/core/literature";

type JsonObject = Readonly<Record<string, unknown>>;

const CLAIM_ROLES: readonly Claim["epistemicRole"][] = [
  "assertion", "source_paraphrase", "synthesis", "inference", "hypothesis", "question", "working_note",
];
const PROVENANCE_KINDS: readonly Claim["provenanceKind"][] = [
  "human_original", "ai_accepted_unchanged", "ai_accepted_after_edit", "legacy_ai",
];
const EVIDENCE_STANCES: readonly EvidenceStance[] = ["supports", "opposes", "context"];

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalString(value: unknown): string | undefined | null {
  return value === undefined || value === null ? undefined : stringValue(value) ?? null;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
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

function decodeRect(value: unknown): SourceRect | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const x = nonNegativeNumber(item.x);
  const y = nonNegativeNumber(item.y);
  const width = nonNegativeNumber(item.width);
  const height = nonNegativeNumber(item.height);
  return x === undefined || y === undefined || width === undefined || height === undefined
    ? undefined
    : { x, y, width, height };
}

export function decodeClaim(value: unknown): Claim | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const id = stringValue(item.id);
  const projectId = optionalString(item.projectId);
  const projectTitle = optionalString(item.projectTitle);
  const statement = stringValue(item.statement);
  const origin = item.origin === "user" || item.origin === "ai" ? item.origin : undefined;
  const provenanceKind = PROVENANCE_KINDS.find((kind) => kind === item.provenanceKind);
  const epistemicRole = CLAIM_ROLES.find((role) => role === item.epistemicRole);
  const revision = positiveInteger(item.revision);
  const evidenceCount = nonNegativeInteger(item.evidenceCount);
  const createdAt = stringValue(item.createdAt);
  const updatedAt = stringValue(item.updatedAt);
  if (id === undefined || projectId === null || projectTitle === null || statement === undefined
    || origin === undefined || provenanceKind === undefined || epistemicRole === undefined
    || revision === undefined || evidenceCount === undefined || createdAt === undefined
    || updatedAt === undefined) return undefined;
  return {
    id,
    ...(projectId === undefined ? {} : { projectId }),
    ...(projectTitle === undefined ? {} : { projectTitle }),
    statement, origin, provenanceKind, epistemicRole, revision, evidenceCount, createdAt, updatedAt,
  };
}

export function decodeLegacyBrowserClaim(value: unknown): Claim | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const id = stringValue(item.id);
  const statement = stringValue(item.statement);
  const projectId = optionalString(item.projectId);
  const projectTitle = optionalString(item.projectTitle);
  const origin = item.origin === "ai" ? "ai" : "user";
  const provenanceKind = item.provenanceKind === undefined
    ? origin === "ai" ? "legacy_ai" : "human_original"
    : PROVENANCE_KINDS.find((kind) => kind === item.provenanceKind);
  const epistemicRole = item.epistemicRole === undefined
    ? "assertion"
    : CLAIM_ROLES.find((role) => role === item.epistemicRole);
  const revision = item.revision === undefined ? 1 : positiveInteger(item.revision);
  const evidenceCount = item.evidenceCount === undefined ? 0 : nonNegativeInteger(item.evidenceCount);
  const createdAt = item.createdAt === undefined ? new Date(0).toISOString() : stringValue(item.createdAt);
  const updatedAt = item.updatedAt === undefined ? new Date(0).toISOString() : stringValue(item.updatedAt);
  if (id === undefined || statement === undefined || projectId === null || projectTitle === null
    || provenanceKind === undefined || epistemicRole === undefined || revision === undefined
    || evidenceCount === undefined || createdAt === undefined || updatedAt === undefined) return undefined;
  return {
    id,
    ...(projectId === undefined ? {} : { projectId }),
    ...(projectTitle === undefined ? {} : { projectTitle }),
    statement, origin, provenanceKind, epistemicRole, revision, evidenceCount, createdAt, updatedAt,
  };
}

export function decodeSourceAnchorSummary(value: unknown): SourceAnchorSummary | undefined {
  const item = objectValue(value);
  if (item === undefined || !Array.isArray(item.rects)) return undefined;
  const rects = item.rects.map(decodeRect);
  const anchorId = stringValue(item.anchorId);
  const annotationId = optionalString(item.annotationId);
  const itemId = stringValue(item.itemId);
  const itemTitle = stringValue(item.itemTitle);
  const attachmentId = stringValue(item.attachmentId);
  const attachmentName = stringValue(item.attachmentName);
  const contentHash = contentSha256(item.contentSha256);
  const pageIndex = nonNegativeInteger(item.pageIndex);
  const pageLabel = optionalString(item.pageLabel);
  const quoteExact = stringValue(item.quoteExact);
  const quotePrefix = stringValue(item.quotePrefix);
  const quoteSuffix = stringValue(item.quoteSuffix);
  const annotationType = item.annotationType === undefined || item.annotationType === null
    ? undefined
    : item.annotationType === "highlight" || item.annotationType === "note" ? item.annotationType : null;
  const annotationBody = stringValue(item.annotationBody);
  const createdAt = stringValue(item.createdAt);
  if (anchorId === undefined || annotationId === null || itemId === undefined || itemTitle === undefined
    || attachmentId === undefined || attachmentName === undefined || contentHash === undefined
    || pageIndex === undefined || pageLabel === null || rects.some((rect) => rect === undefined)
    || quoteExact === undefined || quotePrefix === undefined || quoteSuffix === undefined
    || annotationType === null || annotationBody === undefined || createdAt === undefined) return undefined;
  return {
    anchorId,
    ...(annotationId === undefined ? {} : { annotationId }),
    itemId, itemTitle, attachmentId, attachmentName, contentSha256: contentHash, pageIndex,
    ...(pageLabel === undefined ? {} : { pageLabel }),
    rects: rects.filter((rect): rect is SourceRect => rect !== undefined),
    quoteExact, quotePrefix, quoteSuffix,
    ...(annotationType === undefined ? {} : { annotationType }),
    annotationBody, createdAt,
  };
}

export function decodeEvidenceLink(value: unknown): EvidenceLink | undefined {
  const item = objectValue(value);
  if (item === undefined) return undefined;
  const id = stringValue(item.id);
  const claimId = stringValue(item.claimId);
  const stance = EVIDENCE_STANCES.find((entry) => entry === item.stance);
  const rationale = stringValue(item.rationale);
  const source = decodeSourceAnchorSummary(item.source);
  const createdAt = stringValue(item.createdAt);
  return id === undefined || claimId === undefined || stance === undefined || rationale === undefined
    || source === undefined || createdAt === undefined
    ? undefined
    : { id, claimId, stance, rationale, source, createdAt };
}

export function decodeEvidenceList<T>(
  value: unknown,
  decode: (entry: unknown) => T | undefined,
): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const decoded = value.map(decode);
  return decoded.some((entry) => entry === undefined)
    ? undefined
    : decoded.filter((entry): entry is T => entry !== undefined);
}
