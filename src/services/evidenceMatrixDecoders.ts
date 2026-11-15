import type {
  EvidenceMatrix,
  EvidenceMatrixCell,
  EvidenceMatrixDimension,
  EvidenceMatrixStatement,
} from "@research-assistant/core/synthesis";

type JsonRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function uniqueStrings(value: unknown, minimum: number, maximum: number): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return undefined;
  const items = value.map(text);
  if (items.some((item) => item === undefined || item === "")) return undefined;
  const strings = items as string[];
  return new Set(strings).size === strings.length ? strings : undefined;
}

function dimension(value: unknown): EvidenceMatrixDimension | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const id = text(data.id);
  const label = text(data.label);
  return id === undefined || id.length < 1 || id.length > 80
    || label === undefined || label.trim() === "" || label.length > 120
    ? undefined
    : { id, label };
}

export function decodeEvidenceMatrix(value: unknown): EvidenceMatrix | undefined {
  const data = record(value);
  if (data === undefined || !Array.isArray(data.dimensions)) return undefined;
  const dimensions = data.dimensions.map(dimension);
  const ids = new Set(dimensions.map((item) => item?.id));
  const id = text(data.id);
  const projectId = text(data.projectId);
  const title = text(data.title);
  const paperIds = uniqueStrings(data.paperIds, 2, 20);
  const revision = integer(data.revision);
  const createdAt = text(data.createdAt);
  const updatedAt = text(data.updatedAt);
  if (
    id === undefined
    || projectId === undefined
    || title === undefined
    || title.trim() === ""
    || paperIds === undefined
    || dimensions.length < 1
    || dimensions.length > 20
    || dimensions.some((item) => item === undefined)
    || ids.size !== dimensions.length
    || revision === undefined
    || revision < 1
    || createdAt === undefined
    || updatedAt === undefined
  ) {
    return undefined;
  }
  return {
    id,
    projectId,
    title,
    paperIds,
    dimensions: dimensions as readonly EvidenceMatrixDimension[],
    revision,
    createdAt,
    updatedAt,
  };
}

function statement(value: unknown): EvidenceMatrixStatement | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const id = text(data.id);
  const statementText = text(data.text);
  const epistemicRole = data.epistemicRole === "source_paraphrase"
    || data.epistemicRole === "synthesis"
    || data.epistemicRole === "inference"
    || data.epistemicRole === "hypothesis"
    ? data.epistemicRole
    : undefined;
  const evidenceAnchorIds = uniqueStrings(data.evidenceAnchorIds, 1, 8);
  return id === undefined || id.length < 1 || id.length > 80
    || statementText === undefined || statementText.trim() === "" || statementText.length > 4_000
    || epistemicRole === undefined || evidenceAnchorIds === undefined
    ? undefined
    : { id, text: statementText, epistemicRole, evidenceAnchorIds };
}

export function decodeEvidenceMatrixCell(value: unknown): EvidenceMatrixCell | undefined {
  const data = record(value);
  if (data === undefined || !Array.isArray(data.statements)) return undefined;
  const statements = data.statements.map(statement);
  const statementIds = new Set(statements.map((item) => item?.id));
  const id = text(data.id);
  const matrixId = text(data.matrixId);
  const paperId = text(data.paperId);
  const dimensionId = text(data.dimensionId);
  const coverageState = data.coverageState === "unreviewed"
    || data.coverageState === "not_found"
    || data.coverageState === "populated"
    ? data.coverageState
    : undefined;
  const coverageNote = text(data.coverageNote);
  const provenanceKind = data.provenanceKind === "human_original"
    || data.provenanceKind === "ai_accepted_unchanged"
    || data.provenanceKind === "ai_accepted_after_edit"
    ? data.provenanceKind
    : undefined;
  const revision = integer(data.revision);
  const createdAt = text(data.createdAt);
  const updatedAt = text(data.updatedAt);
  const coverageValid = coverageState === "populated"
    ? statements.length > 0
    : statements.length === 0;
  if (
    id === undefined
    || matrixId === undefined
    || paperId === undefined
    || dimensionId === undefined
    || dimensionId.length < 1
    || dimensionId.length > 80
    || coverageState === undefined
    || !coverageValid
    || coverageNote === undefined
    || coverageNote.length > 2_000
    || statements.length > 20
    || statements.some((item) => item === undefined)
    || statementIds.size !== statements.length
    || provenanceKind === undefined
    || revision === undefined
    || revision < 1
    || createdAt === undefined
    || updatedAt === undefined
  ) {
    return undefined;
  }
  return {
    id,
    matrixId,
    paperId,
    dimensionId,
    coverageState,
    coverageNote,
    statements: statements as readonly EvidenceMatrixStatement[],
    provenanceKind,
    revision,
    createdAt,
    updatedAt,
  };
}

export function decodeEvidenceMatrices(value: unknown): readonly EvidenceMatrix[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(decodeEvidenceMatrix);
  return items.some((item) => item === undefined) ? undefined : items as EvidenceMatrix[];
}

export function decodeEvidenceMatrixCells(
  value: unknown,
): readonly EvidenceMatrixCell[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(decodeEvidenceMatrixCell);
  return items.some((item) => item === undefined) ? undefined : items as EvidenceMatrixCell[];
}
