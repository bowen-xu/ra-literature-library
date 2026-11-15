import type { SourceRect } from "@research-assistant/core/literature";
import { noteBlockId } from "@research-assistant/core/notes";
import { decodeReaderViewStateV2, type ReaderViewStateV2 } from "@research-assistant/core/reader";

import type { PdfSelectionActionDraft, PdfPendingSelection } from "../../knowledge/PdfSelectionActions";
import type { AnnotationRecoveryDraft } from "../annotations/AnnotationController";
import type { PdfSelectionSession } from "../selection/useReaderSelectionSessions";
import {
  clearRecoveryDraft,
  createRecoveryDraft,
  loadRecoveryDraft,
  saveRecoveryDraft,
  type RecoveryDraftIdentity,
} from "@research-assistant/workbench-sdk/document-recovery";

export interface ReaderRecoveryDraft {
  readonly pageNote: string;
  readonly selectionSessions: readonly PdfSelectionSession[];
  readonly annotationDrafts: readonly AnnotationRecoveryDraft[];
  readonly readingState?: ReaderViewStateV2;
  readonly updatedAt: string;
}

export interface ReaderRecoveryPayload {
  readonly pageNote: string;
  readonly selectionSessions: readonly PdfSelectionSession[];
  readonly annotationDrafts: readonly AnnotationRecoveryDraft[];
  readonly readingState?: ReaderViewStateV2;
}

function readerRecoveryIdentity(attachmentId: string): RecoveryDraftIdentity {
  return { scope: "pdf-reader", resourceId: attachmentId, slot: "session" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function decodeRect(value: unknown): SourceRect | undefined {
  if (!isRecord(value)
    || !isFiniteNumber(value.x)
    || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.width)
    || !isFiniteNumber(value.height)) return undefined;
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function decodePendingSelection(value: unknown): PdfPendingSelection | undefined {
  if (!isRecord(value)
    || typeof value.text !== "string"
    || typeof value.prefix !== "string"
    || typeof value.suffix !== "string"
    || !Number.isInteger(value.pageIndex)
    || typeof value.pageLabel !== "string"
    || !Array.isArray(value.rects)
    || !Array.isArray(value.segments)
    || !Number.isInteger(value.popupPageIndex)) return undefined;
  const rects = value.rects.map(decodeRect);
  const popupRect = decodeRect(value.popupRect);
  const segments = value.segments.map((segment) => {
    if (!isRecord(segment)
      || !Number.isInteger(segment.pageIndex)
      || typeof segment.pageLabel !== "string"
      || typeof segment.text !== "string"
      || typeof segment.prefix !== "string"
      || typeof segment.suffix !== "string"
      || !Array.isArray(segment.rects)) return undefined;
    const segmentRects = segment.rects.map(decodeRect);
    if (segmentRects.some((rect) => rect === undefined)) return undefined;
    const location = segment.location;
    if (location !== undefined && (!isRecord(location)
      || ![location.startLine, location.startColumn, location.endLine, location.endColumn].every(value => Number.isSafeInteger(value) && Number(value) >= 1)
      || Number(location.endLine) < Number(location.startLine)
      || location.endLine === location.startLine && Number(location.endColumn) < Number(location.startColumn))) return undefined;
    return {
      ...(isRecord(location) ? { location: { startLine: Number(location.startLine), startColumn: Number(location.startColumn), endLine: Number(location.endLine), endColumn: Number(location.endColumn) } } : {}),
      pageIndex: segment.pageIndex as number,
      pageLabel: segment.pageLabel,
      rects: segmentRects as SourceRect[],
      text: segment.text,
      prefix: segment.prefix,
      suffix: segment.suffix,
    };
  });
  if (rects.some((rect) => rect === undefined) || popupRect === undefined || segments.some((segment) => segment === undefined)) {
    return undefined;
  }
  return {
    text: value.text,
    prefix: value.prefix,
    suffix: value.suffix,
    pageIndex: value.pageIndex as number,
    pageLabel: value.pageLabel,
    rects: rects as SourceRect[],
    segments: segments as PdfPendingSelection["segments"],
    popupPageIndex: value.popupPageIndex as number,
    popupRect,
  };
}

function decodeActionDraft(value: unknown): PdfSelectionActionDraft | undefined {
  if (!isRecord(value)) return undefined;
  const modes = new Set(["actions", "dictionary", "concept", "reference", "reference_ai", "ai"]);
  if (typeof value.mode !== "string" || !modes.has(value.mode)
    || typeof value.note !== "string"
    || typeof value.referenceRawText !== "string"
    || typeof value.conceptDirty !== "boolean"
    || typeof value.referenceDirty !== "boolean") return undefined;
  let concept: PdfSelectionActionDraft["concept"];
  if (value.concept !== undefined) {
    if (!isRecord(value.concept)) return undefined;
    const conceptCandidate = value.concept;
    const conceptModes = new Set(["create_new", "link_existing", "unresolved"]);
    const stringFields = [
      "termText", "language", "usageText", "label", "explanation", "disambiguation",
      "domain", "tradition", "period", "definitionStatement",
    ];
    if (stringFields.some((field) => typeof conceptCandidate[field] !== "string")
      || typeof conceptCandidate.mode !== "string" || !conceptModes.has(conceptCandidate.mode)
      || (conceptCandidate.selectedConceptId !== undefined && typeof conceptCandidate.selectedConceptId !== "string")) {
      return undefined;
    }
    concept = conceptCandidate as unknown as NonNullable<PdfSelectionActionDraft["concept"]>;
  }
  let reference: PdfSelectionActionDraft["reference"];
  if (value.reference !== undefined) {
    if (!isRecord(value.reference)) return undefined;
    const usageKinds = new Set(["mentions", "uses_method", "supports", "opposes", "extends", "background"]);
    if ((value.reference.mode !== "new_reference" && value.reference.mode !== "usage")
      || typeof value.reference.rawText !== "string"
      || typeof value.reference.recordId !== "string"
      || typeof value.reference.usageKind !== "string" || !usageKinds.has(value.reference.usageKind)
      || typeof value.reference.usageSummary !== "string") return undefined;
    reference = value.reference as unknown as NonNullable<PdfSelectionActionDraft["reference"]>;
  }
  const restoredMode: PdfSelectionActionDraft["mode"] = value.mode === "ai" || value.mode === "dictionary"
    ? "actions"
    : value.mode === "reference_ai" ? "reference" : value.mode as PdfSelectionActionDraft["mode"];
  return {
    mode: restoredMode,
    note: value.note,
    referenceRawText: value.referenceRawText,
    conceptDirty: value.conceptDirty,
    referenceDirty: value.referenceDirty,
    ...(concept === undefined ? {} : { concept }),
    ...(reference === undefined ? {} : { reference }),
  };
}

function decodeSelectionSession(value: unknown): PdfSelectionSession | undefined {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.active !== "boolean"
    || value.dirty !== true
    || (value.anchorId !== undefined && typeof value.anchorId !== "string")
    || (value.annotationId !== undefined && typeof value.annotationId !== "string")
    || (value.highlightColor !== undefined && typeof value.highlightColor !== "string")) return undefined;
  const pending = decodePendingSelection(value.pending);
  const actionDraft = decodeActionDraft(value.actionDraft);
  if (pending === undefined || actionDraft === undefined) return undefined;
  return {
    id: value.id,
    active: value.active,
    dirty: true,
    pending,
    actionDraft,
    ...(typeof value.anchorId === "string" ? { anchorId: value.anchorId } : {}),
    ...(typeof value.annotationId === "string" ? { annotationId: noteBlockId(value.annotationId) } : {}),
    ...(typeof value.highlightColor === "string" ? { highlightColor: value.highlightColor } : {}),
  };
}

function decodeAnnotationDraft(value: unknown): AnnotationRecoveryDraft | undefined {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !Number.isInteger(value.baseRevision)
    || (value.baseRevision as number) < 0
    || (value.body !== undefined && typeof value.body !== "string")
    || typeof value.color !== "string"
    || (value.position !== undefined && decodeRect(value.position) === undefined)
    || (value.status !== "active" && value.status !== "trashed")) return undefined;
  return {
    id: noteBlockId(value.id),
    baseRevision: value.baseRevision as number,
    ...(typeof value.body === "string" ? { body: value.body } : {}),
    color: value.color,
    ...(value.position === undefined ? {} : { position: decodeRect(value.position)! }),
    status: value.status,
  };
}

export function hasReaderRecoveryContent(payload: ReaderRecoveryPayload): boolean {
  return payload.pageNote.trim().length > 0
    || payload.selectionSessions.some(session => session.actionDraft?.mode !== "annotation")
    || payload.annotationDrafts.length > 0
    || payload.readingState !== undefined;
}

export function saveReaderRecoveryDraft(
  attachmentId: string,
  attachmentHash: string,
  payload: ReaderRecoveryPayload,
): void {
  saveRecoveryDraft(createRecoveryDraft(readerRecoveryIdentity(attachmentId), {
    ...payload, selectionSessions:payload.selectionSessions.filter(session => session.actionDraft?.mode !== "annotation"),
  }, { hash: attachmentHash }));
}

export function loadReaderRecoveryDraft(attachmentId: string, attachmentHash: string): ReaderRecoveryDraft | undefined {
  const envelope = loadRecoveryDraft(readerRecoveryIdentity(attachmentId));
  if (envelope === undefined) return undefined;
  if (envelope.baseHash !== attachmentHash) {
    throw new Error("PDF 内容已变化，旧恢复草稿未自动应用，原记录已保留");
  }
  if (!isRecord(envelope.payload)
    || typeof envelope.payload.pageNote !== "string"
    || !Array.isArray(envelope.payload.selectionSessions)
    || !Array.isArray(envelope.payload.annotationDrafts)) {
    throw new Error("阅读器恢复草稿格式无效，原记录已保留");
  }
  const selectionSessions = envelope.payload.selectionSessions.filter(session =>
    !isRecord(session) || !isRecord(session.actionDraft) || session.actionDraft.mode !== "annotation"
  ).map(decodeSelectionSession);
  const annotationDrafts = envelope.payload.annotationDrafts.map(decodeAnnotationDraft);
  const readingState = envelope.payload.readingState === undefined
    ? undefined
    : decodeReaderViewStateV2(envelope.payload.readingState);
  if (selectionSessions.some((session) => session === undefined)
    || annotationDrafts.some((draft) => draft === undefined)
    || (envelope.payload.readingState !== undefined && readingState === undefined)) {
    throw new Error("阅读器恢复草稿内容损坏，原记录已保留");
  }
  return {
    pageNote: envelope.payload.pageNote,
    selectionSessions: selectionSessions as PdfSelectionSession[],
    annotationDrafts: annotationDrafts as AnnotationRecoveryDraft[],
    ...(readingState === undefined ? {} : { readingState }),
    updatedAt: envelope.updatedAt,
  };
}

export function clearReaderRecoveryDraft(attachmentId: string): void {
  clearRecoveryDraft(readerRecoveryIdentity(attachmentId));
}
