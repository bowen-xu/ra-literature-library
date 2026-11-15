import {
  REFERENCE_FIELD_NAMES,
  type ReferenceMetadataField,
  type ReferenceRecord,
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

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): Values[number] | undefined {
  return typeof value === "string" && values.includes(value) ? value : undefined;
}

function decodeField(value: unknown): ReferenceMetadataField | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const name = oneOf(data.name, REFERENCE_FIELD_NAMES);
  const fieldValue = text(data.value);
  const sourceKind = oneOf(data.sourceKind, [
    "reference_text",
    "external_metadata",
    "ai_inference",
    "human",
  ] as const);
  if (
    name === undefined
    || fieldValue === undefined
    || fieldValue.length > 2_000
    || sourceKind === undefined
    || typeof data.confirmedByUser !== "boolean"
    || sourceKind === "ai_inference" && data.confirmedByUser
  ) {
    return undefined;
  }
  return { name, value: fieldValue, sourceKind, confirmedByUser: data.confirmedByUser };
}

export function decodeReferenceRecord(value: unknown): ReferenceRecord | undefined {
  const data = record(value);
  if (data === undefined || !Array.isArray(data.fields)) return undefined;
  const fields = data.fields.map(decodeField);
  const fieldNames = new Set(fields.map((field) => field?.name));
  const id = text(data.id);
  const citingPaperId = text(data.citingPaperId);
  const sourceAnchorId = text(data.sourceAnchorId);
  const rawText = text(data.rawText);
  const parseState = oneOf(data.parseState, ["unparsed", "parsed", "failed"] as const);
  const identityState = oneOf(data.identityState, [
    "unverified",
    "matched_existing",
    "verified_external",
    "ambiguous",
    "not_found",
  ] as const);
  const matchedItemId = data.matchedItemId === undefined ? undefined : text(data.matchedItemId);
  const semanticState = oneOf(data.semanticState, ["unreviewed", "reviewed"] as const);
  const usageKind = data.usageKind === undefined ? undefined : oneOf(data.usageKind, [
    "mentions",
    "uses_method",
    "supports",
    "opposes",
    "extends",
    "background",
  ] as const);
  const usageSummary = text(data.usageSummary);
  const usageAnchorId = data.usageAnchorId === undefined ? undefined : text(data.usageAnchorId);
  const provenanceKind = oneOf(data.provenanceKind, [
    "human_original",
    "ai_accepted_unchanged",
    "ai_accepted_after_edit",
  ] as const);
  const revision = integer(data.revision);
  const createdAt = text(data.createdAt);
  const updatedAt = text(data.updatedAt);
  const identityValid = identityState === "matched_existing"
    ? matchedItemId !== undefined
    : matchedItemId === undefined;
  const semanticValid = semanticState === "reviewed"
    ? usageKind !== undefined && usageAnchorId !== undefined && usageSummary?.trim() !== ""
    : usageKind === undefined && usageAnchorId === undefined && usageSummary === "";
  if (
    id === undefined
    || citingPaperId === undefined
    || sourceAnchorId === undefined
    || rawText === undefined
    || rawText.trim() === ""
    || fields.some((field) => field === undefined)
    || fieldNames.size !== fields.length
    || parseState === undefined
    || identityState === undefined
    || !identityValid
    || semanticState === undefined
    || !semanticValid
    || usageSummary === undefined
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
    citingPaperId,
    sourceAnchorId,
    rawText,
    fields: fields as readonly ReferenceMetadataField[],
    parseState,
    identityState,
    ...(matchedItemId === undefined ? {} : { matchedItemId }),
    semanticState,
    ...(usageKind === undefined ? {} : { usageKind }),
    usageSummary,
    ...(usageAnchorId === undefined ? {} : { usageAnchorId }),
    provenanceKind,
    revision,
    createdAt,
    updatedAt,
  };
}

export function decodeReferenceRecords(value: unknown): readonly ReferenceRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records = value.map(decodeReferenceRecord);
  return records.some((item) => item === undefined)
    ? undefined
    : records as readonly ReferenceRecord[];
}
