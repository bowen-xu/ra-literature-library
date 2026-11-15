import { OverlayPortal } from "@research-assistant/workbench-sdk/overlay";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAgentContextCandidate } from "@research-assistant/workbench-sdk/agent-context";
import { useAttachmentTextIndex } from "../features/reader/useAttachmentTextIndex";
import type {
  AttachmentSummary,
  LiteratureItem,
} from "@research-assistant/core/literature";
import type { ReaderSourceNavigation } from "../features/reader/ReaderSourceNavigation";
import {
  readerCommandForKey,
  type ReaderCommandContext,
  type ReaderFocusOwner,
  type ReaderTool,
  type ReaderUiSessionState,
} from "@research-assistant/core/reader";

import { useNoteAnnotations } from "@research-assistant/workbench-sdk/note-resources";
import { useAnnotationRefreshVersion } from "../features/reader/annotations/useAnnotationRefreshVersion";
import { ReaderWorkspaceView } from "../features/reader/ReaderWorkspaceView";
import { useStructuredBlocks } from "../features/reader/pdf/useStructuredBlocks";
import { AnnotationController, type AnnotationRecoveryDraft } from "../features/reader/annotations/AnnotationController";
import { useAnnotationControllerLifetime } from "../features/reader/annotations/useAnnotationControllerLifetime";
import { createReaderCommandExecutor } from "../features/reader/commands/readerCommandBindings";
import { ReaderFocusController } from "../features/reader/focus/ReaderFocusController";
import {
  PdfViewAdapter,
} from "@research-assistant/workbench-sdk/pdf";
import {
  DoclingOverlayRequestTracker,
  doclingOverlayItemLabel,
  hitTestDoclingOverlay,
} from "../features/reader/pdf/doclingOverlayModel";
import { ReaderSessionController } from "../features/reader/session/ReaderSessionController";
import { getReaderCloseCoordinator } from "@research-assistant/workbench-sdk/workbench";
import { readerSessionId } from "../features/reader/session/ReaderSessionRegistry";
import {
  clearReaderRecoveryDraft,
  hasReaderRecoveryContent,
  loadReaderRecoveryDraft,
  saveReaderRecoveryDraft,
  type ReaderRecoveryPayload,
} from "../features/reader/session/readerRecoveryDraft";
import { loadReaderUiSessionState, saveReaderUiSessionState } from "../features/reader/session/readerUiSessionState";
import { startReaderSidebarResize } from "../features/reader/session/readerSidebarResize";
import { useReaderSelectionSessions } from "../features/reader/selection/useReaderSelectionSessions";
import { useReaderSourceSelection } from "../features/reader/selection/useReaderSourceSelection";
import { isEditableTarget, readingNoteLocation, readingNoteSegments } from "../features/reader/readerWorkspaceModel";
import { getDoclingParserGateway, type DoclingOverlayItem, type DoclingPageOverlay } from "@research-assistant/workbench-sdk/docling";
import { getResearchKnowledgeGateway } from "../services/knowledgeGateway";
import { getReferenceRecordGateway } from "../services/referenceRecordGateway";
import type { LiteratureGateway } from "../services/literatureGateway";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ReadingSourceHighlights } from "../features/reader/ReadingSourceHighlights";
import type { ReadingFieldSource } from "../features/ai/readingFieldSources";
import {
  clampPdfPageIndex,
  parsePdfPageInput,
} from "@research-assistant/workbench-sdk/pdf-geometry";

export interface PdfReaderProps {
  readonly readingSources?: readonly ReadingFieldSource[];
  readonly readingPanel?: ReactNode;
  readonly item: LiteratureItem;
  readonly attachment: AttachmentSummary;
  readonly gateway: LiteratureGateway;
  readonly active?: boolean;
  readonly initialPageIndex?: number;
  readonly focusAnchorId?: string;
  readonly sourceLocation?: ReaderSourceNavigation;
  readonly navigationRequestId?: number;
  readonly onClose?: () => void;
  readonly onCommitClose?: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

interface DoclingOverlayHover {
  readonly item: DoclingOverlayItem;
  readonly pageIndex: number;
  readonly clientX: number;
  readonly clientY: number;
}

function doclingErrorCode(reason: unknown): string | undefined {
  if (reason instanceof Error && reason.cause !== undefined && reason.cause !== reason) return doclingErrorCode(reason.cause);
  return typeof reason === "object" && reason !== null && "code" in reason
    ? String((reason as { readonly code: unknown }).code)
    : undefined;
}

function doclingErrorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { readonly message: unknown }).message);
  }
  return reason instanceof Error ? reason.message : String(reason);
}

export function PdfReader({
  readingSources,
  readingPanel,
  item,
  attachment,
  gateway,
  active = true,
  initialPageIndex,
  focusAnchorId,
  sourceLocation,
  navigationRequestId,
  onClose,
  onCommitClose,
}: PdfReaderProps): React.JSX.Element {
  useAgentContextCandidate({resource:{kind:"paper",resourceId:item.id,attachmentId:attachment.id},label:item.title || attachment.displayName}, active);
  const recoveryResult = useMemo(() => {
    try {
      return { draft: loadReaderRecoveryDraft(attachment.id, attachment.contentSha256) };
    } catch (reason: unknown) {
      return { error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [attachment.contentSha256, attachment.id]);
  const notesClient = useNoteAnnotations();
  const annotationController = useMemo(() => new AnnotationController({
    gateway: notesClient.gateway,
    onCommitted: () => notesClient.notifyChanged(),
  }), [attachment.id, notesClient]);
  const notesVersion = useAnnotationRefreshVersion(annotationController, active);
  const annotationState = useSyncExternalStore(
    annotationController.subscribe,
    annotationController.getSnapshot,
    annotationController.getSnapshot,
  );
  const knowledgeGateway = useMemo(() => getResearchKnowledgeGateway(), []);
  const referenceGateway = useMemo(() => getReferenceRecordGateway(), []);
  const doclingGateway = useMemo(() => getDoclingParserGateway(), []);
  const adapter = useMemo(() => new PdfViewAdapter(), [attachment.id]);
  const controller = useMemo(() => new ReaderSessionController({
    adapter,
    saveReadingState: (viewState) => gateway.saveReadingState(item.id, attachment.id, viewState),
  }), [adapter, attachment.id, gateway, item.id]);
  const reader = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const workspaceRef = useRef<HTMLDivElement>(null);
  const focusController = useMemo(() => new ReaderFocusController(() => workspaceRef.current), []);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handledNavigationRef = useRef<string | undefined>(undefined);
  const restoredAnnotationDraftsRef = useRef(false);
  const orphanedAnnotationDraftsRef = useRef<readonly AnnotationRecoveryDraft[]>([]);
  const [pageInput, setPageInput] = useState(String((initialPageIndex ?? 0) + 1));
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightAll, setSearchHighlightAll] = useState(true);
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchEntireWord, setSearchEntireWord] = useState(false);
  const [pageNote, setPageNote] = useState(recoveryResult.draft?.pageNote ?? "");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [uiSession, setUiSession] = useState<ReaderUiSessionState>(() => loadReaderUiSessionState(attachment.id));
  const [focusOwner, setFocusOwner] = useState<ReaderFocusOwner>();
  const [tool, setTool] = useState<ReaderTool>("select");
  const [announcement, setAnnouncement] = useState("");
  const acknowledgedSource = useRef<ReaderSourceNavigation | undefined>(undefined);
  const currentSource = useRef(sourceLocation); currentSource.current = sourceLocation;
  const loadFailure = useRef<unknown>(undefined);
  const [doclingOverlays, setDoclingOverlays] = useState<ReadonlyMap<number, DoclingPageOverlay>>(() => new Map());
  const [doclingOverlayHover, setDoclingOverlayHover] = useState<DoclingOverlayHover>();
  const doclingOverlayRequestTrackerRef = useRef(new DoclingOverlayRequestTracker());
  const doclingOverlayFailureNotifiedRef = useRef(false);
  const platform = useMemo<ReaderCommandContext["platform"]>(
    () => /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? "") ? "macos" : "other",
    [],
  );
  const updateUiSession = useCallback((update: (current: ReaderUiSessionState) => ReaderUiSessionState): void => {
    setUiSession((current) => {
      const next = update(current);
      saveReaderUiSessionState(attachment.id, next);
      return next;
    });
  }, [attachment.id]);
  const setDoclingOverlayOpen = useCallback((open: boolean): void => {
    updateUiSession((current) => ({
      ...current,
      structuredOverlay: { open },
    }));
    if (!open) {
      doclingOverlayRequestTrackerRef.current.reset();
      setDoclingOverlayHover(undefined);
      setDoclingOverlays(new Map());
    }
  }, [updateUiSession]);
  const viewerReady = reader.ready;
  const pageCount = reader.pageCount;
  const pageNumber = reader.pageIndex + 1;
  const pageLabels = reader.pageLabels;
  const doclingOverlayEnabled = uiSession.structuredOverlay.open;
  const structuredBlocks = useStructuredBlocks({
    gateway: doclingGateway, itemId: item.id, attachmentId: attachment.id,
    contentSha256: attachment.contentSha256, open: doclingOverlayEnabled, setOpen: setDoclingOverlayOpen,
  });
  const characterSelectionAvailable = reader.characterSelectionAvailable;
  const searchMatches = reader.findTotal === 0 ? "0 / 0" : `${reader.findCurrent} / ${reader.findTotal}`;

  const annotations = useMemo(
    () => annotationState.annotations.filter((annotation) => annotation.status === "active"),
    [annotationState.annotations],
  );
  const selectedReadingId = annotationState.selected?.id;
  const {
    sessions: selectionSessions,
    activeSession: activeSelectionSession,
    drafts: selectionDrafts,
    startSelection,
    completeSelection,
    openSavedHighlight,
    discard: discardSelection,
    close: closeSelection,
    activateDraft: activateSelectionDraft,
    updateDraftState: updateSelectionDraftState,
    save: saveSelection,
    ensureAiAnchor,
    aiRunStarted,
    captureConcept,
    captureReference,
  } = useReaderSelectionSessions({
    active,
    viewerReady,
    characterSelectionAvailable,
    pageLabels,
    item,
    attachment,
    controller,
    annotationController,
    knowledgeGateway,
    referenceGateway,
    viewerContainerRef,
    setAnnouncement,
    initialSessions: recoveryResult.draft?.selectionSessions ?? [],
  });

  useEffect(() => {
    let alive = true;
    controller.prepareOpen(active, initialPageIndex ?? 0);
    loadFailure.current = undefined;
    void Promise.all([
      gateway.readAttachment(attachment.id),
      gateway.getReadingState(item.id, attachment.id),
    ]).then(([bytes, viewState]) => {
      if (!alive) return;
      const container = viewerContainerRef.current;
      const viewerElement = viewerElementRef.current;
      if (container === null || viewerElement === null) return;
      const restoredViewState = recoveryResult.draft?.readingState ?? viewState;
      return controller.open({
        identity: { key: attachment.id, revision: attachment.contentSha256 },
        bytes,
        container,
        viewerElement,
        active,
        ...(initialPageIndex === undefined ? {} : { initialPageIndex }),
        ...(restoredViewState === undefined ? {} : { restoredViewState }),
      });
    }).catch((reason: unknown) => {
      if (alive) {loadFailure.current = reason; controller.setStatus(reason instanceof Error ? reason.message : String(reason)); currentSource.current?.navigationOnError?.(reason);}
    });
    return () => {
      alive = false;
      void controller.close();
    };
  // Source changes navigate the existing viewer below; reopening would race its saved position.
  }, [attachment.contentSha256, attachment.id, controller, gateway, item.id, recoveryResult.draft?.readingState]);

  useEffect(() => {
    if (loadFailure.current) sourceLocation?.navigationOnError?.(loadFailure.current);
  }, [sourceLocation]);

  useEffect(() => {
    controller.setActive(active);
  }, [active, controller]);

  useEffect(() => {
    doclingOverlayRequestTrackerRef.current.reset();
    setDoclingOverlays(new Map());
    setDoclingOverlayHover(undefined);
    doclingOverlayFailureNotifiedRef.current = false;
  }, [attachment.id]);

  useEffect(() => {
    if (!doclingOverlayEnabled) return;
    if (!active || !viewerReady) return;
    const requestTracker = doclingOverlayRequestTrackerRef.current;
    for (const host of reader.pageHosts) {
      const requestGeneration = requestTracker.startPageRequest(
        host.pageIndex,
        doclingOverlays.has(host.pageIndex),
      );
      if (requestGeneration === undefined) continue;
      void doclingGateway.getPageOverlay(attachment.id, host.pageIndex)
        .then((overlay) => {
          if (!requestTracker.accepts(requestGeneration)) return;
          setDoclingOverlays((current) => {
            const next = new Map(current);
            next.set(host.pageIndex, overlay);
            return next;
          });
        })
        .catch((reason: unknown) => {
          if (!requestTracker.accepts(requestGeneration)) return;
          if (doclingErrorCode(reason) === "not_found") {
            structuredBlocks.prepareMissing(reason);
            return;
          }
          if (!doclingOverlayFailureNotifiedRef.current) {
            doclingOverlayFailureNotifiedRef.current = true;
            notify.warning(`读取 Docling 结构化块失败：${doclingErrorMessage(reason)}`);
          }
        })
        .finally(() => {
          requestTracker.finishPageRequest(host.pageIndex);
        });
    }
  }, [active, attachment.id, doclingGateway, doclingOverlayEnabled, doclingOverlays, reader.pageHosts, structuredBlocks.prepareMissing, viewerReady]);

  useEffect(() => {
    if (document.activeElement !== pageInputRef.current) setPageInput(pageLabels[reader.pageIndex] ?? String(reader.pageIndex + 1));
  }, [pageLabels, reader.pageIndex]);

  useEffect(() => {
    if (viewerReady) setAnnouncement(`已到第 ${pageLabels[reader.pageIndex] ?? reader.pageIndex + 1} 页，共 ${pageCount} 页`);
  }, [pageCount, pageLabels, reader.pageIndex, viewerReady]);

  useEffect(() => {
    if (searchOpen && search.trim().length > 0) setAnnouncement(`搜索结果 ${searchMatches}`);
  }, [search, searchMatches, searchOpen]);

  useEffect(() => {
    if (annotationState.selected !== undefined) {
      setAnnouncement(`已从${annotationState.selected.origin === "page" ? "页面" : "笔记侧栏"}选择批注`);
    }
  }, [annotationState.selected]);

  useEffect(() => {
    if (activeSelectionSession !== undefined) setAnnouncement("选区操作浮窗已打开");
  }, [activeSelectionSession]);

  useEffect(() => {
    let alive = true;
    void annotationController.load(item.id, attachment.id)
      .then(() => {
        if (!alive || restoredAnnotationDraftsRef.current) return;
        restoredAnnotationDraftsRef.current = true;
        const drafts = recoveryResult.draft?.annotationDrafts ?? [];
        const result = annotationController.restoreRecoveryDrafts(drafts);
        orphanedAnnotationDraftsRef.current = result.missingDrafts;
        setRecoveryReady(true);
        if (recoveryResult.error !== undefined) {
          controller.setStatus(recoveryResult.error);
        } else if (recoveryResult.draft !== undefined) {
          const suffix = result.conflicts > 0 || result.missing > 0
            ? "；部分批注需要重试或人工处理"
            : "";
          const documentSuffix = result.documentDrafts ? "；旧正文草稿已转换为文档，可打开阅读笔记核对恢复" : "";
          setAnnouncement(`已自动恢复上次暂存内容${suffix}${documentSuffix}`);
        }
      })
      .catch((reason: unknown) => {
        if (alive) {
          setRecoveryReady(true);
          controller.setStatus(`读取笔记失败：${reason instanceof Error ? reason.message : String(reason)}`);
        }
      });
    return () => { alive = false; };
  }, [annotationController, attachment.id, controller, item.id, notesVersion, recoveryResult.draft, recoveryResult.error]);

  useAnnotationControllerLifetime(annotationController);

  const currentRecoveryPayload = useCallback((forceReadingState = false): ReaderRecoveryPayload => {
    const dirtySelectionSessions = selectionSessions.filter((session) => session.dirty);
    const annotationDrafts = [
      ...annotationController.getRecoveryDrafts(),
      ...orphanedAnnotationDraftsRef.current,
    ];
    const hasUserDraft = pageNote.trim().length > 0
      || dirtySelectionSessions.length > 0
      || annotationDrafts.length > 0;
    const readingState = forceReadingState || hasUserDraft
      ? controller.getRecoveryReadingState()
      : undefined;
    return {
      pageNote,
      selectionSessions: dirtySelectionSessions,
      annotationDrafts,
      ...(readingState === undefined ? {} : { readingState }),
    };
  }, [annotationController, controller, pageNote, selectionSessions]);

  const persistRecovery = useCallback((forceReadingState = false): boolean => {
    const payload = currentRecoveryPayload(forceReadingState);
    if (!hasReaderRecoveryContent(payload)) {
      if (recoveryResult.error !== undefined) return false;
      clearReaderRecoveryDraft(attachment.id);
      return false;
    }
    saveReaderRecoveryDraft(attachment.id, attachment.contentSha256, payload);
    return true;
  }, [attachment.contentSha256, attachment.id, currentRecoveryPayload, recoveryResult.error]);

  useEffect(() => {
    if (!recoveryReady) return;
    try {
      persistRecovery();
    } catch (reason: unknown) {
      controller.setStatus(`自动暂存失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }, [annotationState.dirtyIds, annotationState.saveState, controller, pageNote, persistRecovery, reader.pageIndex, reader.scalePercent, recoveryReady, selectionSessions]);

  useEffect(() => getReaderCloseCoordinator().register(readerSessionId(attachment.id), {
    isActive: () => active,
    prepare: async () => {
      try {
        persistRecovery();
      } catch (reason: unknown) {
        const message = `自动暂存失败，已取消关闭：${reason instanceof Error ? reason.message : String(reason)}`;
        setAnnouncement(message);
        controller.setStatus(message);
        return false;
      }
      const [readingStateSaved, annotationsSaved] = await Promise.all([
        controller.flushReadingState(),
        annotationController.prepareClose(),
      ]);
      try {
        const stashed = persistRecovery(!readingStateSaved);
        if ((!readingStateSaved || !annotationsSaved) && stashed) {
          const message = "长期保存尚未完成，当前内容已自动暂存；再次打开时会恢复";
          setAnnouncement(message);
          controller.setStatus(message);
        }
      } catch (reason: unknown) {
        const message = `自动暂存失败，已取消关闭：${reason instanceof Error ? reason.message : String(reason)}`;
        setAnnouncement(message);
        controller.setStatus(message);
        return false;
      }
      return true;
    },
    commit: () => (onCommitClose ?? onClose)?.(),
  }), [active, annotationController, attachment.id, controller, onClose, onCommitClose, persistRecovery]);

  useAttachmentTextIndex({active, ready: viewerReady, attachment, itemId: item.id, pageCount, gateway, controller});

  const navigateToPage = useCallback((pageIndex: number, record = true) => {
    controller.navigate({
      pageIndex: clampPdfPageIndex(pageIndex, pageCount),
      history: record ? "hard" : "skip",
    });
  }, [controller, pageCount]);

  useEffect(() => {
    if (!viewerReady) return;
    if (initialPageIndex === undefined && focusAnchorId === undefined) return;
    const requestKey = `${attachment.id}:${navigationRequestId ?? "initial"}:${initialPageIndex ?? 0}:${focusAnchorId ?? ""}`;
    if (handledNavigationRef.current === requestKey) return;
    handledNavigationRef.current = requestKey;
    if (sourceLocation && (sourceLocation.pageIndex < 0 || sourceLocation.pageIndex >= pageCount)) {
      setAnnouncement("来源页码超出当前 PDF，未跳转到其它页面。");
      sourceLocation.navigationOnError?.(new Error("来源页码超出当前 PDF"));
      return;
    }
    if (sourceLocation !== undefined) controller.navigate(readingNoteLocation(sourceLocation));
    else {
      const target = clampPdfPageIndex(initialPageIndex ?? 0, pageCount);
      navigateToPage(target);
    }
  }, [attachment.id, controller, focusAnchorId, initialPageIndex, navigateToPage, navigationRequestId, pageCount, sourceLocation, viewerReady]);

  const {selection:pdfSelection, locatedSource} = useReaderSourceSelection({
    source:sourceLocation, contentSha256:attachment.contentSha256, controller, ready:viewerReady,
    pageHosts:reader.pageHosts, pageCount, announce:setAnnouncement, beginSelection:startSelection,
  });

  useEffect(() => {
    if (!viewerReady || !sourceLocation?.navigationOnLocated || acknowledgedSource.current === sourceLocation) return;
    if (sourceLocation.navigationLineRange && (!pdfSelection || locatedSource !== sourceLocation)) return;
    const segment = sourceLocation.navigationLineRange ? pdfSelection?.segments.find(segment => segment.pageIndex === sourceLocation.pageIndex) : undefined;
    const rect = segment?.rects[0] ?? sourceLocation.rects[0];
    if (!rect) {sourceLocation.navigationOnError?.(new Error("来源没有可显示的批注位置")); return;}
    const getAnchorRect = () => controller.clientRectForPageRect(sourceLocation.pageIndex, rect) ?? null;
    if (!getAnchorRect()) return; // Page-host publication retries after its DOM mounts.
    acknowledgedSource.current = sourceLocation;
    sourceLocation.navigationOnLocated({getAnchorRect});
  }, [controller, reader.pageHosts, sourceLocation, pdfSelection, locatedSource, viewerReady]);

  useEffect(() => {
    if (focusAnchorId === undefined) return;
    const note = annotations.find((annotation) => annotation.source.anchorId === focusAnchorId);
    if (note !== undefined) annotationController.select(note.id, "page");
  }, [annotationController, annotations, focusAnchorId]);

  const selectedReadingNote = useMemo(
    () => annotationState.annotations.find((annotation) => annotation.id === selectedReadingId),
    [annotationState.annotations, selectedReadingId],
  );
  const thumbnailRevisionByPage = useMemo(() => {
    const revisions = new Map<number, string[]>();
    annotations.forEach((annotation) => {
      readingNoteSegments(annotation.source).forEach((segment) => {
        const pageRevisions = revisions.get(segment.pageIndex) ?? [];
        pageRevisions.push(`${annotation.id}:${annotation.revision}:${annotation.color}:${annotation.status}`);
        revisions.set(segment.pageIndex, pageRevisions);
      });
    });
    return new Map([...revisions].map(([pageIndex, values]) => [pageIndex, values.sort().join("|")]));
  }, [annotations]);

  async function savePageNote(): Promise<void> {
    const body = pageNote.trim();
    const pageIndex = reader.pageIndex;
    const created = await annotationController.create({
      itemId: item.id,
      attachmentId: attachment.id,
      pageIndex,
      pageLabel: pageLabels[pageIndex] ?? String(pageIndex + 1),
      rects: [],
      quoteExact: "",
      noteType: "page_note",
      body,
    });
    setPageNote("");
    window.dispatchEvent(new CustomEvent("research-assistant:open-reading-note", { detail: created.id }));
    setAnnouncement(`第 ${pageLabels[pageIndex] ?? pageIndex + 1} 页的页级笔记已创建`);
  }

  const runFind = useCallback((findPrevious = false, type: "find" | "again" = "again") => {
    const query = search.trim();
    if (query.length === 0) return;
    controller.find({
      ...(workspaceRef.current === null ? {} : { source: workspaceRef.current }),
      type,
      query,
      caseSensitive: searchCaseSensitive,
      entireWord: searchEntireWord,
      highlightAll: searchHighlightAll,
      findPrevious,
    });
  }, [controller, search, searchCaseSensitive, searchEntireWord, searchHighlightAll]);

  const openFind = useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeFind = useCallback(() => {
    setSearchOpen(false);
    controller.closeFind(workspaceRef.current ?? undefined);
    window.requestAnimationFrame(() => viewerContainerRef.current?.focus({ preventScroll: true }));
  }, [controller]);

  useEffect(() => {
    if (!searchOpen) return;
    if (search.trim().length === 0) {
      controller.closeFind(workspaceRef.current ?? undefined);
      return;
    }
    const timer = window.setTimeout(() => runFind(false, "find"), 180);
    return () => window.clearTimeout(timer);
  }, [controller, runFind, search, searchOpen]);

  const changeScale = useCallback((difference: number) => {
    controller.changeScale(difference, MIN_SCALE, MAX_SCALE);
  }, [controller]);

  const fitToWidth = useCallback(() => {
    controller.fitToWidth();
  }, [controller]);


  const navigateHistory = useCallback((difference: -1 | 1) => {
    if (difference < 0) controller.navigateBack();
    else controller.navigateForward();
  }, [controller]);

  const executeReaderCommand = createReaderCommandExecutor({
    platform,
    focusController,
    focusOwner,
    activeSelectionSessionId: activeSelectionSession?.id,
    searchOpen,
    selectedReadingId,
    selectedReadingNote,
    reader,
    annotationState,
    annotationController,
    controller,
    hasClosableReaderTab: onCommitClose !== undefined || onClose !== undefined,
    tool,
    attachmentId: attachment.id,
    pageNumber,
    pageInputRef,
    closeSelection,
    openFind,
    closeFind,
    runFind,
    navigateToPage,
    changeScale,
    fitToWidth,
    navigateHistory,
    updateUiSession,
    setTool,
    savePageNote,
    setAnnouncement,
  });

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const command = readerCommandForKey({
        key: event.key,
        code: event.code,
        platform: event.metaKey ? "macos" : platform,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editable: isEditableTarget(event.target),
        hasClosableReaderTab: onCommitClose !== undefined || onClose !== undefined,
      });
      if (command === "annotation.undo" || command === "annotation.redo" || command === "annotation.trash") {
        // Editing elsewhere in the app must not mutate the reader's annotation history.
        if (!(event.target instanceof Node) || !workspaceRef.current?.contains(event.target)) return;
      }
      if (command !== undefined && executeReaderCommand(command, undefined, event.target)) event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, activeSelectionSession, annotationController, annotationState, attachment.id, changeScale, closeFind, fitToWidth, focusController, focusOwner, navigateHistory, onClose, onCommitClose, openFind, pageNumber, platform, reader, runFind, searchOpen, selectedReadingId, selectedReadingNote, tool, updateUiSession]);

  const commitPageInput = (): void => {
    const target = parsePdfPageInput(pageInput, pageCount, pageLabels);
    if (target === undefined) {
      setPageInput(pageLabels[pageNumber - 1] ?? String(pageNumber));
      return;
    }
    executeReaderCommand("reader.navigate", { pageIndex: target });
  };

  const startSidebarResize = (side: "navigation" | "notes", event: ReactPointerEvent<HTMLDivElement>): void => {
    startReaderSidebarResize(side, event, uiSession, updateUiSession);
  };

  const handleDoclingOverlayPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!doclingOverlayEnabled || event.buttons !== 0) {
      setDoclingOverlayHover(undefined);
      return;
    }
    const target = event.target instanceof Element ? event.target : undefined;
    const page = target?.closest<HTMLElement>(".page[data-page-number]");
    const pageNumberValue = Number(page?.dataset.pageNumber);
    if (page === undefined || !Number.isInteger(pageNumberValue)) {
      setDoclingOverlayHover(undefined);
      return;
    }
    const pageIndex = pageNumberValue - 1;
    const host = reader.pageHosts.find((candidate) => candidate.pageIndex === pageIndex);
    const bounds = host?.element.getBoundingClientRect();
    const overlay = doclingOverlays.get(pageIndex);
    if (bounds === undefined || bounds.width <= 0 || bounds.height <= 0 || overlay === undefined) {
      setDoclingOverlayHover(undefined);
      return;
    }
    const hit = hitTestDoclingOverlay(overlay, {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    });
    setDoclingOverlayHover(hit === undefined
      ? undefined
      : { item: hit.item, pageIndex, clientX: event.clientX, clientY: event.clientY });
  }, [doclingOverlayEnabled, doclingOverlays, reader.pageHosts]);

  const handleDoclingOverlayPointerLeave = useCallback((): void => {
    setDoclingOverlayHover(undefined);
  }, []);

  const doclingOverlayPortals = doclingOverlayEnabled
    ? reader.pageHosts.map((host) => {
      const overlay = doclingOverlays.get(host.pageIndex);
      if (overlay === undefined || doclingOverlayHover === undefined) return null;
      const activeItems = overlay.items.filter((item) => item.id === doclingOverlayHover.item.id);
      if (activeItems.length === 0) return null;
      return createPortal(<>
        {activeItems.flatMap((item) => item.regions
          .filter((region) => region.pageIndex === host.pageIndex)
          .map((region, index) => (
            <span
              aria-hidden="true"
              className="docling-structured-block-highlight"
              key={`${item.id}-${index}`}
              style={{
                left: `${region.rect.x * 100}%`,
                top: `${region.rect.y * 100}%`,
                width: `${region.rect.width * 100}%`,
                height: `${region.rect.height * 100}%`,
              }}
            />
          )))}
      </>, host.element);
    })
    : [];
  const doclingOverlayTooltip = doclingOverlayEnabled && doclingOverlayHover !== undefined
    ? <OverlayPortal kind="hint"><div
        className="docling-structured-block-tooltip"
        role="status"
        style={{
          left: `${Math.max(8, Math.min(doclingOverlayHover.clientX + 12, window.innerWidth - 280))}px`,
          top: `${Math.max(8, Math.min(doclingOverlayHover.clientY + 14, window.innerHeight - 72))}px`,
        }}
      >
        {doclingOverlayItemLabel(doclingOverlayHover.item, pageLabels[doclingOverlayHover.pageIndex] ?? String(doclingOverlayHover.pageIndex + 1))}
      </div></OverlayPortal>
    : null;

  return <>
    {readingSources !== undefined && <ReadingSourceHighlights sources={readingSources} attachment={attachment} controller={controller} active={active} />}
    <ReaderWorkspaceView attachment={attachment}
    active={active}
    readingPanel={readingPanel}
    documentVersion={`${attachment.id}:${attachment.contentSha256}`}
    aiRunStarted={aiRunStarted}
    annotationController={annotationController}
    annotationState={annotationState}
    annotations={annotations}
    announcement={announcement}
    captureConcept={captureConcept}
    captureReference={captureReference}
    commitPageInput={commitPageInput}
    controller={controller}
    discardSelection={discardSelection}
    ensureAiAnchor={ensureAiAnchor}
    executeReaderCommand={executeReaderCommand}
    item={item}
    knowledgeGateway={knowledgeGateway}
    startSelection={startSelection}
    completeSelection={completeSelection}
    navigationRequestId={navigationRequestId}
    onFocusTarget={(target) => setFocusOwner(focusController.ownerForTarget(target))}
    pageInput={pageInput}
    pageInputRef={pageInputRef}
    pageNote={pageNote}
    reader={reader}
    runFind={runFind}
    search={search}
    searchCaseSensitive={searchCaseSensitive}
    searchEntireWord={searchEntireWord}
    searchHighlightAll={searchHighlightAll}
    searchInputRef={searchInputRef}
    searchOpen={searchOpen}
    selectedReadingId={selectedReadingId}
    selectionDrafts={selectionDrafts}
    selectionSessions={selectionSessions}
    openSavedHighlight={openSavedHighlight}
    setPageInput={setPageInput}
    setPageNote={setPageNote}
    setSearch={setSearch}
    setSearchCaseSensitive={setSearchCaseSensitive}
    setSearchEntireWord={setSearchEntireWord}
    setSearchHighlightAll={setSearchHighlightAll}
    startSidebarResize={startSidebarResize}
    thumbnailRevisionByPage={thumbnailRevisionByPage}
    uiSession={uiSession}
    updateSelectionDraftState={updateSelectionDraftState}
    viewerContainerRef={viewerContainerRef}
    viewerElementRef={viewerElementRef}
    workspaceRef={workspaceRef}
    activateSelectionDraft={activateSelectionDraft}
    saveSelection={saveSelection}
    structuredOverlayEnabled={doclingOverlayEnabled}
    structuredOverlayPreparing={structuredBlocks.preparing}
    onStructuredOverlayPointerLeave={handleDoclingOverlayPointerLeave}
    onStructuredOverlayPointerMove={handleDoclingOverlayPointerMove}
    onToggleStructuredOverlay={structuredBlocks.toggle}
  />
    {doclingOverlayPortals}
    {doclingOverlayTooltip}
  </>;
}
