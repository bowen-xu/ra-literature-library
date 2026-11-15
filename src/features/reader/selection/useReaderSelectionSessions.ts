import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AiRun } from "@research-assistant/core/ai";
import type { AttachmentSummary, LiteratureItem, SourceRect } from "@research-assistant/core/literature";
import type { NoteBlockId, ReadingNoteBlock } from "@research-assistant/core/notes";

import type { ConceptCaptureValue } from "../../knowledge/ConceptCapturePanel";
import type { PdfPendingSelection, PdfSelectionActionDraft } from "../../knowledge/PdfSelectionActions";
import type { ReferenceCaptureValue } from "../../synthesis/ReferenceCapturePanel";
import { savePdfReferenceCapture } from "../../synthesis/pdfReferenceCapture";
import type { ResearchKnowledgeGateway } from "../../../services/knowledgeGateway";
import type { ReferenceRecordGateway } from "../../../services/referenceRecordGateway";
import type { PdfSelection as PdfCharacterSelection } from "@research-assistant/core/pdf-view";
import type { AnnotationController } from "../annotations/AnnotationController";
import type { ReaderSessionController } from "../session/ReaderSessionController";

export interface PdfSelectionSession {
  readonly id: string;
  readonly pending: PdfPendingSelection;
  readonly active: boolean;
  readonly dirty: boolean;
  readonly anchorId?: string;
  readonly annotationId?: NoteBlockId;
  readonly highlightColor?: string;
  readonly actionDraft?: PdfSelectionActionDraft;
}

export interface SaveReadingSelectionOptions {
  readonly openEditor?: boolean;
  readonly color?: string;
}

interface UseReaderSelectionSessionsOptions {
  readonly active: boolean;
  readonly viewerReady: boolean;
  readonly characterSelectionAvailable: boolean;
  readonly pageLabels: readonly string[];
  readonly item: LiteratureItem;
  readonly attachment: AttachmentSummary;
  readonly controller: ReaderSessionController;
  readonly annotationController: AnnotationController;
  readonly knowledgeGateway: ResearchKnowledgeGateway;
  readonly referenceGateway: ReferenceRecordGateway;
  readonly viewerContainerRef: RefObject<HTMLDivElement | null>;
  readonly setAnnouncement: (message: string) => void;
  readonly initialSessions?: readonly PdfSelectionSession[];
}

export interface ReaderSelectionSessions {
  readonly sessions: readonly PdfSelectionSession[];
  readonly activeSession: PdfSelectionSession | undefined;
  readonly drafts: readonly PdfSelectionSession[];
  readonly startSelection: () => void;
  readonly completeSelection: (selection: PdfCharacterSelection) => void;
  readonly openSavedHighlight: (note: ReadingNoteBlock, pageIndex: number, rect: SourceRect) => void;
  readonly hasDirtyDrafts: () => boolean;
  readonly discard: (sessionId: string) => void;
  readonly close: (sessionId: string) => void;
  readonly activateDraft: (sessionId: string) => void;
  readonly updateDraftState: (sessionId: string, draft: PdfSelectionActionDraft, dirty: boolean) => void;
  readonly save: (session: PdfSelectionSession, body: string, options?: SaveReadingSelectionOptions) => Promise<void>;
  readonly ensureAiAnchor: (session: PdfSelectionSession) => Promise<string>;
  readonly aiRunStarted: (sessionId: string, run: AiRun) => void;
  readonly captureConcept: (session: PdfSelectionSession, value: ConceptCaptureValue) => Promise<void>;
  readonly captureReference: (session: PdfSelectionSession, value: ReferenceCaptureValue) => Promise<void>;
}

export function createPdfSelectionSession(
  selection: PdfCharacterSelection,
  pageLabels: readonly string[],
  id: string,
): PdfSelectionSession | undefined {
  const segments = selection.segments.map((segment) => ({
    ...(segment.location ? { location: segment.location } : {}),
    pageIndex: segment.pageIndex,
    pageLabel: pageLabels[segment.pageIndex] ?? String(segment.pageIndex + 1),
    rects: segment.rects,
    text: segment.text,
    prefix: segment.prefix,
    suffix: segment.suffix,
  }));
  const first = segments[0];
  if (first === undefined) return undefined;
  return {
    id,
    active: true,
    dirty: false,
    pending: {
      text: selection.text,
      rects: first.rects,
      prefix: first.prefix,
      suffix: segments.at(-1)?.suffix ?? first.suffix,
      context: {
        before: selection.segments[0]?.context?.before ?? first.prefix,
        after: selection.segments.at(-1)?.context?.after ?? segments.at(-1)?.suffix ?? first.suffix,
      },
      pageIndex: first.pageIndex,
      pageLabel: first.pageLabel,
      segments,
      popupPageIndex: selection.focusPageIndex,
      popupRect: selection.focusRect,
    },
  };
}

export function useReaderSelectionSessions({
  active,
  pageLabels,
  item,
  attachment,
  controller,
  annotationController,
  knowledgeGateway,
  referenceGateway,
  viewerContainerRef,
  setAnnouncement,
  initialSessions = [],
}: UseReaderSelectionSessionsOptions): ReaderSelectionSessions {
  const restoredSessions = initialSessions.filter(session => session.actionDraft?.mode !== "annotation");
  const dirtySessionIdsRef = useRef(new Set(restoredSessions.filter((session) => session.dirty).map((session) => session.id)));
  const [sessions, setSessions] = useState<readonly PdfSelectionSession[]>(restoredSessions);
  const activeSession = sessions.find((session) => session.active);
  const drafts = sessions.filter((session) => !session.active);
  const currentSessions = useRef(sessions); currentSessions.current = sessions;

  useEffect(() => {
    const restored = restoredSessions.find(session => session.active && session.annotationId === undefined);
    if (restored) controller.viewController.setSelection({text:restored.pending.text,segments:restored.pending.segments,
      focusPageIndex:restored.pending.popupPageIndex,focusRect:restored.pending.popupRect});
  }, [controller]);

  const discard = useCallback((sessionId: string): void => {
    if (currentSessions.current.some(session => session.id === sessionId && session.active)) controller.viewController.clearSelection();
    dirtySessionIdsRef.current.delete(sessionId);
    setSessions((current) => current.filter((session) => session.id !== sessionId));
  }, [controller]);

  const close = useCallback((sessionId: string): void => {
    if (currentSessions.current.some(session => session.id === sessionId && session.active)) controller.viewController.clearSelection();
    setSessions((current) => current.flatMap((session) => session.id !== sessionId
      ? [session]
      : dirtySessionIdsRef.current.has(sessionId) ? [{ ...session, active: false, dirty: true }] : []));
  }, [controller]);

  const activateDraft = useCallback((sessionId: string): void => {
    const selected = currentSessions.current.find(session => session.id === sessionId);
    if (selected?.annotationId === undefined && selected) controller.viewController.setSelection({text:selected.pending.text,segments:selected.pending.segments,
      focusPageIndex:selected.pending.popupPageIndex,focusRect:selected.pending.popupRect});
    else controller.viewController.clearSelection();
    setSessions((current) => current.flatMap((session) => {
      if (session.id === sessionId) return [{ ...session, active: true }];
      if (!session.active) return [session];
      return dirtySessionIdsRef.current.has(session.id) ? [{ ...session, active: false, dirty: true }] : [];
    }));
  }, [controller]);

  const updateDraftState = useCallback((sessionId: string, draft: PdfSelectionActionDraft, dirty: boolean): void => {
    if (dirty) dirtySessionIdsRef.current.add(sessionId);
    else dirtySessionIdsRef.current.delete(sessionId);
    setSessions((current) => current.map((session) => session.id === sessionId
      ? { ...session, dirty, actionDraft: draft }
      : session));
  }, []);

  const startCharacterSelection = useCallback(() => {
    controller.viewController.clearSelection();
    setSessions((current) => current.flatMap((session) => session.active
      ? dirtySessionIdsRef.current.has(session.id) ? [{ ...session, active: false, dirty: true }] : []
      : [session]));
  }, [controller]);

  const completeCharacterSelection = useCallback((selection: PdfCharacterSelection) => {
    const session = createPdfSelectionSession(selection, pageLabels, window.crypto.randomUUID());
    if (session === undefined) return;
    if (controller.viewController.getSnapshot().selection !== selection) controller.viewController.setSelection(selection);
    setSessions((current) => [
      ...current.flatMap((value) => value.active
        ? dirtySessionIdsRef.current.has(value.id) ? [{ ...value, active: false, dirty: true }] : []
        : [value]),
      session,
    ]);
  }, [pageLabels, controller]);



  const openSavedHighlight = useCallback((note: ReadingNoteBlock, pageIndex: number, rect: SourceRect): void => {
    const source = note.source;
    const segments = source.selector?.segments ?? [{ pageIndex: source.pageIndex, rects: source.rects, exactText: source.quoteExact, prefix: source.quotePrefix, suffix: source.quoteSuffix }];
    const selection = createPdfSelectionSession({
      text: source.quoteExact,
      segments: segments.map(segment => ({ pageIndex: segment.pageIndex, rects: segment.rects, text: segment.exactText, prefix: segment.prefix ?? "", suffix: segment.suffix ?? "" })),
      focusPageIndex: pageIndex, focusRect: rect,
    }, pageLabels, `annotation:${note.id}`);
    if (!selection) return;
    const anchorId = source.anchorId ?? source.selector?.anchorId;
    setSessions(current => {
      const existing = current.find(session => session.annotationId === note.id);
      return [...current.flatMap(session => {
        if (session.annotationId === note.id) return [];
        return session.active ? dirtySessionIdsRef.current.has(session.id) ? [{ ...session, active: false, dirty: true }] : [] : [session];
      }), {
        ...selection, ...existing, active: true, annotationId: note.id, highlightColor: note.color,
        pending: { ...(existing?.pending ?? selection.pending), popupPageIndex: pageIndex, popupRect: rect },
        ...(anchorId === undefined ? {} : { anchorId }),
      }];
    });
  }, [pageLabels]);

  const persist = useCallback(async (session: PdfSelectionSession, body: string, options?: SaveReadingSelectionOptions): Promise<ReadingNoteBlock> => {
    if (session.annotationId !== undefined) {
      const existing = annotationController.getSnapshot().annotations.find(note => note.id === session.annotationId);
      if (!existing?.source.anchorId) throw new Error("无法读取此高亮的原文锚点");
      return existing;
    }
    const { pending } = session;
    const created = await annotationController.create({
      itemId: item.id,
      ...(session.anchorId === undefined ? {} : { sourceAnchorId: session.anchorId }),
      attachmentId: attachment.id,
      pageIndex: pending.pageIndex,
      pageLabel: pending.pageLabel,
      rects: pending.rects,
      quoteExact: pending.text,
      quotePrefix: pending.prefix,
      quoteSuffix: pending.suffix,
      selector: {
        schemaVersion: 2,
        attachmentSha256: attachment.contentSha256,
        segments: pending.segments.map((segment) => ({
          pageIndex: segment.pageIndex,
          pageLabel: segment.pageLabel,
          rects: segment.rects,
          exactText: segment.text,
          prefix: segment.prefix,
          suffix: segment.suffix,
        })),
      },
      noteType: pending.text === "" || body.length > 0 || options?.openEditor ? "annotation" : "highlight",
      body,
      ...(options?.color === undefined ? {} : { color: options.color }),
    });
    setAnnouncement(pending.text === "" ? "位置便签已创建，双击打开笔记" : options?.openEditor || body.length > 0 ? "批注已创建" : "高亮已创建");
    if (options?.openEditor) window.dispatchEvent(new CustomEvent("research-assistant:open-reading-note", { detail: created.id }));
    return created;
  }, [annotationController, attachment.contentSha256, attachment.id, item.id, setAnnouncement]);

  const save = useCallback(async (session: PdfSelectionSession, body: string, options?: SaveReadingSelectionOptions): Promise<void> => {
    if (session.annotationId !== undefined && options?.openEditor) {
      window.dispatchEvent(new CustomEvent("research-assistant:open-reading-note", { detail: session.annotationId }));
    }
    else if (session.annotationId === undefined && (options?.openEditor || body.length > 0 || session.anchorId === undefined)) await persist(session, body, options);
    else if (options?.color !== undefined) {
      const existing = annotationController.getSnapshot().annotations.find(note => session.annotationId === undefined ? note.source.anchorId === session.anchorId : note.id === session.annotationId);
      if (!existing || !annotationController.update(existing.id, { color: options.color })) throw new Error("无法更新此选区的高亮颜色");
      await annotationController.flush(existing.id);
      const state = annotationController.getSnapshot();
      if (state.saveState === "failed" || state.saveState === "conflict") throw new Error(state.error ?? "高亮颜色保存失败，请重试");
    }
    discard(session.id);
  }, [annotationController, discard, persist]);

  const ensureAiAnchor = useCallback(async (session: PdfSelectionSession): Promise<string> => {
    if (session.anchorId !== undefined) return session.anchorId;
    const note = await persist(session, "");
    const anchorId = note.source.anchorId;
    if (anchorId === undefined) throw new Error("无法为 AI 参考文献解析建立稳定原文锚点");
    setSessions((current) => current.map((value) => value.id === session.id ? { ...value, anchorId } : value));
    return anchorId;
  }, [persist]);

  const aiRunStarted = useCallback((sessionId: string, run: AiRun): void => {
    const label = run.taskKind === "reference_extraction" ? "参考条目解析" : "解释";
    controller.setStatus(`AI ${label}任务已启动（${run.id.slice(0, 8)}…）；结果会保存为 AI 候选记录`);
    if (run.taskKind !== "reference_extraction") discard(sessionId);
  }, [controller, discard]);

  const captureConcept = useCallback(async (session: PdfSelectionSession, value: ConceptCaptureValue): Promise<void> => {
    const { pending } = session;
    let anchorId = session.anchorId;
    if (anchorId === undefined) {
      const note = await persist(session, "");
      anchorId = note.source.anchorId;
      if (anchorId === undefined) throw new Error("无法为概念建立稳定原文锚点");
      const savedAnchorId = anchorId;
      setSessions((current) => current.map((candidate) => candidate.id === session.id ? { ...candidate, anchorId: savedAnchorId } : candidate));
    }
    const result = await knowledgeGateway.captureConceptUsage({
      termText: value.termText,
      ...(value.language === undefined ? {} : { language: value.language }),
      anchorId,
      usageText: value.usageText,
      resolution: value.resolution,
    }, {
      paperId: item.id,
      paperTitle: item.title,
      attachmentId: attachment.id,
      contentSha256: attachment.contentSha256,
      pageIndex: pending.pageIndex,
      pageLabel: pending.pageLabel,
      quoteExact: pending.text,
    });
    const destination = result.concept === undefined
      ? "未消歧语词"
      : `概念“${result.concept.label || result.concept.preferredTerm.text}”`;
    controller.setStatus(`已把“${result.term.text}”作为人工来源保存到${destination}`);
    discard(session.id);
  }, [attachment.contentSha256, attachment.id, controller, discard, item.id, item.title, knowledgeGateway, persist]);

  const captureReference = useCallback(async (session: PdfSelectionSession, value: ReferenceCaptureValue): Promise<void> => {
    let anchorId = session.anchorId;
    if (anchorId === undefined) {
      const note = await persist(session, "");
      anchorId = note.source.anchorId;
      if (anchorId === undefined) throw new Error("无法为参考文献建立稳定原文锚点");
      const savedAnchorId = anchorId;
      setSessions((current) => current.map((candidate) => candidate.id === session.id ? { ...candidate, anchorId: savedAnchorId } : candidate));
    }
    controller.setStatus(await savePdfReferenceCapture(value, { paperId: item.id, anchorId, gateway: referenceGateway }));
    discard(session.id);
  }, [controller, discard, item.id, persist, referenceGateway]);

  useEffect(() => {
    const viewer = viewerContainerRef.current;
    if (!active || activeSession === undefined || viewer === null) return;
    const dismissCleanSelectionOnPagePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      if (dirtySessionIdsRef.current.has(activeSession.id)) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".reader-selection-popover, .selection-draft-tray") !== null) return;
      discard(activeSession.id);
    };
    viewer.addEventListener("pointerdown", dismissCleanSelectionOnPagePointerDown, true);
    return () => viewer.removeEventListener("pointerdown", dismissCleanSelectionOnPagePointerDown, true);
  }, [active, activeSession, discard, viewerContainerRef]);

  return {
    sessions,
    activeSession,
    drafts,
    startSelection: startCharacterSelection,
    completeSelection: completeCharacterSelection,
    openSavedHighlight,
    hasDirtyDrafts: () => dirtySessionIdsRef.current.size > 0,
    discard,
    close,
    activateDraft,
    updateDraftState,
    save,
    ensureAiAnchor,
    aiRunStarted,
    captureConcept,
    captureReference,
  };
}
