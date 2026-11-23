import type {
  DerivedResearchView,
  DerivedViewInputRef,
  DerivedViewItem,
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

function uniqueStrings(value: unknown, maximum: number): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) return undefined;
  const items = value.map(text);
  if (items.some((item) => item === undefined || item === "")) return undefined;
  const strings = items as string[];
  return new Set(strings).size === strings.length ? strings : undefined;
}

function inputRef(value: unknown): DerivedViewInputRef | undefined {
  const data = record(value);
  if (data === undefined || data.objectKind !== "matrix_cell") return undefined;
  const objectId = text(data.objectId);
  const objectRevision = integer(data.objectRevision);
  const selectionReason = text(data.selectionReason);
  return objectId === undefined || objectId === ""
    || objectRevision === undefined || objectRevision < 1
    || selectionReason === undefined || selectionReason.length > 500
    ? undefined
    : { objectKind: "matrix_cell", objectId, objectRevision, selectionReason };
}

function viewItem(value: unknown): DerivedViewItem | undefined {
  const data = record(value);
  if (data === undefined) return undefined;
  const id = text(data.id);
  const itemText = text(data.text);
  const epistemicRole = data.epistemicRole === "synthesis"
    || data.epistemicRole === "inference"
    || data.epistemicRole === "hypothesis"
    ? data.epistemicRole
    : undefined;
  const evidenceAnchorIds = uniqueStrings(data.evidenceAnchorIds, 16);
  return id === undefined || id.length < 1 || id.length > 80
    || itemText === undefined || itemText.trim() === "" || itemText.length > 4_000
    || epistemicRole === undefined || evidenceAnchorIds === undefined
    || typeof data.hasConflict !== "boolean"
    ? undefined
    : { id, text: itemText, epistemicRole, evidenceAnchorIds, hasConflict: data.hasConflict };
}

export function decodeDerivedResearchView(value: unknown): DerivedResearchView | undefined {
  const data = record(value);
  if (data === undefined || !Array.isArray(data.inputs) || !Array.isArray(data.items)) {
    return undefined;
  }
  const inputs = data.inputs.map(inputRef);
  const items = data.items.map(viewItem);
  const inputIds = new Set(inputs.map((input) => input?.objectId));
  const itemIds = new Set(items.map((item) => item?.id));
  const id = text(data.id);
  const projectId = text(data.projectId);
  const viewKind = data.viewKind === "taxonomy"
    || data.viewKind === "historical_context"
    || data.viewKind === "gap_hypothesis"
    || data.viewKind === "innovation_hypothesis"
    ? data.viewKind
    : undefined;
  const title = text(data.title);
  const scopeNote = text(data.scopeNote);
  const reviewState = data.reviewState === "unreviewed"
    || data.reviewState === "accepted"
    || data.reviewState === "rejected"
    || data.reviewState === "deferred"
    ? data.reviewState
    : undefined;
  const provenanceKind = data.provenanceKind === "human_original"
    || data.provenanceKind === "ai_suggestion"
    || data.provenanceKind === "ai_accepted_after_edit"
    ? data.provenanceKind
    : undefined;
  const providerId = data.providerId === undefined ? undefined : text(data.providerId);
  const modelId = data.modelId === undefined ? undefined : text(data.modelId);
  const generatedAt = text(data.generatedAt);
  const revision = integer(data.revision);
  const createdAt = text(data.createdAt);
  const updatedAt = text(data.updatedAt);
  const hypothesisView = viewKind === "gap_hypothesis" || viewKind === "innovation_hypothesis";
  if (
    id === undefined
    || projectId === undefined
    || viewKind === undefined
    || title === undefined
    || title.trim() === ""
    || scopeNote === undefined
    || inputs.length < 1
    || inputs.length > 100
    || inputs.some((input) => input === undefined)
    || inputIds.size !== inputs.length
    || items.length < 1
    || items.length > 100
    || items.some((item) => item === undefined)
    || itemIds.size !== items.length
    || hypothesisView && items.some((item) => item?.epistemicRole !== "hypothesis")
    || reviewState === undefined
    || provenanceKind === undefined
    || providerId === undefined && data.providerId !== undefined
    || modelId === undefined && data.modelId !== undefined
    || generatedAt === undefined
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
    viewKind,
    title,
    scopeNote,
    inputs: inputs as readonly DerivedViewInputRef[],
    items: items as readonly DerivedViewItem[],
    reviewState,
    provenanceKind,
    ...(providerId === undefined ? {} : { providerId }),
    ...(modelId === undefined ? {} : { modelId }),
    generatedAt,
    revision,
    createdAt,
    updatedAt,
  };
}

export function decodeDerivedResearchViews(
  value: unknown,
): readonly DerivedResearchView[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(decodeDerivedResearchView);
  return items.some((item) => item === undefined) ? undefined : items as DerivedResearchView[];
}
