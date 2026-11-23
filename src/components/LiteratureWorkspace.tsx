import { navigateManualImportFields } from "./literatureImportKeyboard";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { OverlayPortal } from "@research-assistant/workbench-sdk/overlay";
import { confirm } from "@research-assistant/workbench-sdk/platform";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import {useWorkspaceState, workspaceString, workspaceStringSet} from "@research-assistant/workbench-sdk/workspace-state";
import {usePluginSetting} from "@research-assistant/workbench-sdk/configuration-hooks";
import {literatureSortSetting} from "../public/configuration";
import { useNal } from "../features/nal/useNal";
import { NalSidebar } from "../features/nal/NalSidebar";
import { NalSidebarPane } from "../features/nal/NalSidebarPane";
import { NalStatementEditor } from "../features/nal/NalStatementEditor";
import { useNalAnnotation } from "../features/nal/useNalAnnotation";
import { useNalDeleteKeys } from "../features/nal/useNalDeleteKeys";
import { GitCompareArrows } from "lucide-react";
import "../features/nal/Nal.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { usePublishWorkspaceTabs } from "@research-assistant/workbench-sdk/workbench";
import {
  PanelLeft,
  Trash2,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardList,
  FileText,
  FileUp,
  House,
  LoaderCircle,
  Newspaper,
  Paperclip,
  Presentation,
  Search,
  SquarePen,
  ScrollText,
  WandSparkles,
  X,
} from "lucide-react";
import {
  exportLiterature,
  formatBibliography,
  formatInTextCitation,
  parseBibtex,
  type CitationStyle,
  type StructuredExportFormat,
} from "@research-assistant/core/citation";
import {
  emptyLiteratureDraft,
  type AttachmentSummary,
  type DuplicateCandidate,
  type ImportJob,
  type LiteratureDraft,
  type LiteratureItem,
  type LiteratureMetadataPatch,
  type LiteratureType,
  type MergeOperation,
  type MetadataCandidateFieldDecision,
  type MetadataCandidateTrust,
  type MetadataPreview,
  type PdfImportCandidate,
} from "@research-assistant/core/literature";
import type { ResearchProject } from "@research-assistant/core/project";
import type { ReadingNoteSource } from "@research-assistant/core/notes";

import { PaperOverviewPanel } from "../features/ai/PaperOverviewPanel";
import { LiteratureDetailContent } from "./LiteratureDetailContent";
import { LiteratureCitationActions } from "./LiteratureCitationActions";
import { LiteratureAttachmentRows } from "./LiteratureAttachmentRows";
import { LiteratureAttachmentDialog } from "./LiteratureAttachmentDialog";
import { getLiteratureGateway } from "../services/literatureGateway";
import { useBrowserCaptureRefresh } from "./useBrowserCaptureRefresh";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import {
  createLiteratureCreatorInput,
  formatLiteratureCreators,
  updateLiteratureCreatorInput,
  type LiteratureCreatorInput,
} from "./literatureCreatorInput";
import { formatLiteratureTrashConfirmation, trashRetentionLabel } from "./literatureDeletion";
import { LiteratureMetadataDialog } from "./LiteratureMetadataDialog";
import { LiteratureSummary } from "./LiteratureSummary";
import { firstPendingMetadataField } from "./literatureDetailModel";
import { createLiteratureImportActions } from "./literatureImportActions";
import { DoiPreviewRequest } from "./doiPreviewRequest";
import { useLiteratureFileDrop } from "./useLiteratureFileDrop";
import { literatureFileDropLabel } from "./literatureFileDrop";
import { showImportJobNotification } from "./literatureImportNotifications";
import {
  calculateImportPopoverPosition,
  type ImportPopoverPosition,
} from "./literatureImportPopover";
import {
  cycleLiteratureColumnSort,
  DEFAULT_LITERATURE_COLUMNS,
  normalizeLiteratureColumns,
  retainVisibleLiteratureIds,
  resizeLiteratureColumn,
  sortLiteratureItems,
  toggleLiteratureColumn,
  updateLiteratureSelection,
  type LiteratureColumnKey,
} from "./literatureTableModel";
import { useLiteratureTableLayout } from "./useLiteratureTableLayout";
import {
  LIBRARY_TAB_ID,
  readerSessionId,
  type ReaderSessionInput,
} from "../features/reader/session/ReaderSessionRegistry";
import { useLibrarySessions } from "../features/reader/session/useLibrarySessions";
import { getReaderCloseCoordinator } from "@research-assistant/workbench-sdk/workbench";
import {
  bestAttachmentForReveal,
  creatorLabel,
  downloadText,
  type ImportPanel,
  type LibraryFilter,
  shouldAutoDismissImportJob,
  shouldTrackMetadataPreviewJob,
  terminalImportStates,
  LITERATURE_TYPE_OPTIONS,
  typeLabel,
} from "./literatureWorkspaceModel";
import { useLiteratureDetailLayout } from "./useLiteratureDetailLayout";
import "./LiteratureMetadata.css";
import { RetainedPaperReader } from "../features/reader/RetainedPaperReader";

const LITERATURE_COLUMNS_STORAGE_KEY = "research-assistant:literature-columns:v1";

function loadLiteratureColumns() {
  try {
    return normalizeLiteratureColumns(JSON.parse(getAppStorage().getItem(LITERATURE_COLUMNS_STORAGE_KEY) ?? "[]"));
  } catch {
    return DEFAULT_LITERATURE_COLUMNS;
  }
}

function useNotificationSetter(
  kind: "error" | "success" | "warning",
): Dispatch<SetStateAction<string | undefined>> {
  const currentValue = useRef<string | undefined>(undefined);
  return useCallback((value) => {
    const message = typeof value === "function" ? value(currentValue.current) : value;
    currentValue.current = message;
    if (message !== undefined) notify[kind](message);
  }, [kind]);
}

function LiteratureTypeIcon({ type }: { readonly type: LiteratureType }): React.JSX.Element {
  const iconProps = { "aria-hidden": true, size: 16, strokeWidth: 1.7 } as const;
  if (["journalArticle", "magazineArticle", "newspaperArticle"].includes(type)) return <Newspaper {...iconProps} />;
  if (type === "conferencePaper") return <Presentation {...iconProps} />;
  if (["book", "bookSection"].includes(type)) return <BookOpen {...iconProps} />;
  if (["preprint", "manuscript", "thesis"].includes(type)) return <ScrollText {...iconProps} />;
  if (["report", "standard", "patent"].includes(type)) return <ClipboardList {...iconProps} />;
  return <FileText {...iconProps} />;
}

function AttachmentFileIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="attachment-file-icon" viewBox="0 0 20 20">
      <path d="M4.5 2.5h7l4 4v11h-11z" />
      <path d="M11.5 2.5v4h4" />
      <path className="attachment-file-mark" d="M3.25 5.25h7" />
    </svg>
  );
}

interface LiteratureWorkspaceProps {
  readonly active?: boolean;
  readonly navigationTabId?: string | undefined;
  readonly onNavigateTab?: (tabId: string) => void;
  readonly onSessionsChanged?: (tabIds: readonly string[], activeTabId: string) => void;
  readonly tabHost?: HTMLElement | null;
  readonly project: ResearchProject | undefined;
  readonly openSource: ReadingNoteSource | undefined;
  readonly onSourceOpened: (opened: boolean) => void;
  readonly openItemId: string | undefined;
  readonly onItemOpened: () => void;
}

export function LiteratureWorkspace({ active = true, navigationTabId, onNavigateTab, onSessionsChanged, project, openSource, onSourceOpened, openItemId, onItemOpened, tabHost }: LiteratureWorkspaceProps): React.JSX.Element {
  const gateway = useMemo(() => getLiteratureGateway(), []);
  const detailLayout = useLiteratureDetailLayout();
  const [items, setItems] = useState<readonly LiteratureItem[]>([]);
  const relations = useNal(items);
  const openAnnotation = useNalAnnotation(relations);
  const [relationSidebarOpen, setRelationSidebarOpen] = useState(() => getAppStorage().getItem("research-assistant:relation-sidebar") !== "closed");
  const [relationItems, setRelationItems] = useState<readonly string[]>();
  const [selectedId, setSelectedId] = useWorkspaceState<string | undefined>("library-selected",undefined,value=>typeof value === "string" ? value : undefined);
  const [query, setQuery] = useWorkspaceState("library-search","",workspaceString);
  const [panel, setPanel] = useState<ImportPanel>();
  const [importPopoverPosition, setImportPopoverPosition] = useState<ImportPopoverPosition>();
  const [bibtex, setBibtex] = useState("");
  const [pdfCandidates, setPdfCandidates] = useState<readonly PdfImportCandidate[]>([]);
  const [pdfCreatorInputs, setPdfCreatorInputs] = useState<Readonly<Record<string, LiteratureCreatorInput>>>({});
  const fileDropRoot = useRef<HTMLElement>(null);
  const [doi, setDoi] = useState("");
  const [manual, setManual] = useState<LiteratureDraft>(emptyLiteratureDraft());
  const [manualCreatorInput, setManualCreatorInput] = useState(() => createLiteratureCreatorInput([]));
  const [style, setStyle] = useState<CitationStyle>("nature");
  const [loading, setLoading] = useState(true);
  const setSessionWarning = useNotificationSetter("warning");
  const { registry: readerRegistry, setRegistry: setReaderRegistry, ready: sessionsReady } = useLibrarySessions({
    gateway, onWarning: setSessionWarning,
    ...(navigationTabId === undefined ? {} : { requestedTabId: navigationTabId }),
    ...(onSessionsChanged === undefined ? {} : { onSessionsChanged }),
  });
  const readerTabs = readerRegistry.sessions;
  const activeTabId = readerRegistry.activeTabId;
  const [lastImportJob, setLastImportJob] = useState<ImportJob>();
  const [metadataPreview, setMetadataPreview] = useState<MetadataPreview>();
  const [duplicates, setDuplicates] = useState<readonly DuplicateCandidate[]>([]);
  const [batchIds, setBatchIds] = useState<ReadonlySet<string>>(new Set());
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useWorkspaceState("library-attachments-expanded",new Set<string>() as ReadonlySet<string>,workspaceStringSet);
  const [sort, setSort] = usePluginSetting(literatureSortSetting);
  const [columns, setColumns] = useState(loadLiteratureColumns);
  const [columnPickerPosition, setColumnPickerPosition] = useState<{ readonly x: number; readonly y: number }>();
  const [contextMenu, setContextMenu] = useState<{
    readonly itemId: string;
    readonly attachmentId?: string;
    readonly x: number;
    readonly y: number;
  }>();
  const [attachmentAction, setAttachmentAction] = useState<{readonly mode: "rename" | "remove"; readonly itemId: string; readonly attachment: AttachmentSummary}>();
  const [filter, setFilter] = useWorkspaceState<LibraryFilter>("library-filter","all",value=>["all","with-pdf","unread","reading","read","active-project","trash"].includes(String(value))?value as LibraryFilter:"all");
  const [mergeHistory, setMergeHistory] = useState<readonly MergeOperation[]>([]);
  const [trashingId, setTrashingId] = useState<string>();
  const [isBasicFieldPickerOpen, setIsBasicFieldPickerOpen] = useState(false);
  const [metadataDialog, setMetadataDialog] = useState<{
    readonly itemId: string;
    readonly focusFieldName?: string;
  }>();
  const importPopoverRef = useRef<HTMLFormElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectionAnchorRef = useRef<string | undefined>(undefined);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const setError = useNotificationSetter("error");
  const setNotice = useNotificationSetter("success");
  const setWarning = useNotificationSetter("warning");
  const [doiLoading, setDoiLoading] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const importSubmissionRef = useRef<symbol | undefined>(undefined);
  const doiRequest = useMemo(() => new DoiPreviewRequest(gateway, setDoiLoading, setError), [gateway, setError]);

  useEffect(() => () => doiRequest.cancel(), [doiRequest]);
  useEffect(() => {
    if (panel !== "doi") doiRequest.cancel();
  }, [panel, doiRequest]);
  useEffect(() => {
    if (active && activeTabId === LIBRARY_TAB_ID) return;
    doiRequest.cancel();
    setPanel(undefined);
  }, [active, activeTabId, doiRequest]);

  useBrowserCaptureRefresh({ gateway, query, showTrash: filter === "trash", onItems: setItems,
    onDuplicates: setDuplicates, onError: setError });

  const openReader = useCallback((reader: ReaderSessionInput): void => {
    setReaderRegistry((current) => current.open(reader));
    onNavigateTab?.(readerSessionId(reader.attachment.id));
  }, [onNavigateTab, setReaderRegistry]);

  const activateTab = useCallback((tabId: string): void => {
    setReaderRegistry(current => current.activate(tabId));
    onNavigateTab?.(tabId);
  }, [onNavigateTab, setReaderRegistry]);

  useEffect(() => {
    if (active) return;
    setPanel(undefined); setContextMenu(undefined); setColumnPickerPosition(undefined); setAttachmentAction(undefined);
    setRelationItems(undefined);
  }, [active]);

  useEffect(() => {
    if (!active || !sessionsReady) return;
    const showLibrary = (): void => activateTab(LIBRARY_TAB_ID);
    window.addEventListener("research-assistant:show-library", showLibrary);
    return () => window.removeEventListener("research-assistant:show-library", showLibrary);
  }, [active, activateTab, sessionsReady]);

  const commitCloseReader = useCallback((tabId: string): void => {
    setReaderRegistry((current) => current.close(tabId));
  }, [setReaderRegistry]);

  async function closeReader(tabId: string): Promise<void> {
    await getReaderCloseCoordinator().close(tabId);
  }

  useEffect(() => {
    if (openSource === undefined || !sessionsReady) return;
    let active = true;
    void gateway.get(openSource.paperId).then((item) => {
      if (!active) return;
      const attachment = item.attachments.find((candidate) => candidate.id === openSource.attachmentId);
      setFilter("all");
      setItems((current) => current.some((candidate) => candidate.id === item.id) ? current : [item, ...current]);
      setSelectedId(item.id);
      setBatchIds(new Set([item.id]));
      selectionAnchorRef.current = item.id;
      if (attachment === undefined || attachment.contentSha256 !== openSource.contentSha256) {
        activateTab(LIBRARY_TAB_ID);
        setNotice(attachment === undefined
          ? "原 PDF 附件不可用，已降级打开来源文献详情"
          : "原 PDF 附件版本已变化，未打开过期来源");
        onSourceOpened(false);
        (openSource as import("../features/reader/ReaderSourceNavigation").ReaderSourceNavigation).navigationOnError?.(new Error("原 PDF 附件不可用或版本已变化"));
        return;
      }
      openReader({ item, attachment, source: openSource });
      onSourceOpened(true);
    }).catch((reason: unknown) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : String(reason));
        onSourceOpened(false);
        (openSource as import("../features/reader/ReaderSourceNavigation").ReaderSourceNavigation).navigationOnError?.(reason);
      }
    });
    return () => { active = false; };
  }, [activateTab, gateway, onSourceOpened, openReader, openSource, sessionsReady]);

  useEffect(() => {
    if (openItemId === undefined || !sessionsReady) return;
    let active = true;
    void gateway.get(openItemId).then((item) => {
      if (!active) return;
      setFilter("all");
      setItems((current) => current.some((candidate) => candidate.id === item.id) ? current : [item, ...current]);
      setSelectedId(item.id);
      setBatchIds(new Set([item.id]));
      selectionAnchorRef.current = item.id;
      activateTab(LIBRARY_TAB_ID);
      onItemOpened();
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { active = false; };
  }, [activateTab, gateway, onItemOpened, openItemId, sessionsReady]);

  const selected = items.find((item) => item.id === selectedId);
  const bibtexPreview = useMemo(() => {
    if (bibtex.trim().length === 0) return { drafts: [] as readonly LiteratureDraft[], error: undefined };
    try {
      return { drafts: parseBibtex(bibtex), error: undefined };
    } catch (reason: unknown) {
      return { drafts: [] as readonly LiteratureDraft[], error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [bibtex]);
  const visibleItems = useMemo(() => sortLiteratureItems(items.filter((item) => {
    if (filter === "trash") return true;
    if (!relations.allowed.has(item.id)) return false;
    if (filter === "with-pdf") return item.attachments.length > 0;
    if (filter === "active-project") return project !== undefined && item.projectIds.includes(project.id);
    if (filter !== "all") return item.readingStatus === filter;
    return true;
  }), sort), [filter, items, project, sort, relations.allowed]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const tableLayout = useLiteratureTableLayout(visibleColumns);
  const handleLiteratureDeleteKey = useNalDeleteKeys({
    enabled: active && sessionsReady && filter !== "trash" && activeTabId === LIBRARY_TAB_ID && relationItems === undefined,
    busy: trashingId !== undefined,
    selectedIds: batchIds,
    visibleItemIds: visibleItems.map((item) => item.id),
    onTrash: async (itemIds) => {
      setTrashingId(itemIds[0]);
      try {
        await gateway.trashMany(itemIds);
        const deleted = new Set(itemIds);
        setReaderRegistry((current) => itemIds.reduce((registry, id) => registry.closeForItem(id), current));
        setItems((current) => current.filter((item) => !deleted.has(item.id)));
        setSelectedId(undefined); setBatchIds(new Set());
        setNotice(`已将 ${itemIds.length} 篇文献移入回收站；14 天内可恢复`);
        await Promise.all([refresh(query), refreshDuplicates(), refreshMergeHistory()]);
      } finally { setTrashingId(undefined); }
    },
  });

  useEffect(() => {
    const visibleIds = visibleItems.map((item) => item.id);
    const visibleIdSet = new Set(visibleIds);
    setSelectedId((current) => current !== undefined && visibleIdSet.has(current) ? current : undefined);
    setBatchIds((current) => retainVisibleLiteratureIds(current, visibleIds));
    if (selectionAnchorRef.current !== undefined && !visibleIdSet.has(selectionAnchorRef.current)) {
      selectionAnchorRef.current = undefined;
    }
  }, [visibleItems]);

  async function refresh(search = query): Promise<void> {
    const values = filter === "trash"
      ? await gateway.listTrash(search)
      : await gateway.list(search);
    setItems(values);
  }
  const refreshReader = useRef(() => refresh(query));
  refreshReader.current = () => refresh(query);
  const reviewChanged = useCallback(() => refreshReader.current(), []);

  async function refreshDuplicates(): Promise<void> {
    setDuplicates(await gateway.listDuplicates());
  }

  async function refreshMergeHistory(): Promise<void> {
    setMergeHistory(await gateway.listMergeOperations());
  }

  async function selectImportedItem(itemId: string): Promise<void> {
    const values = await gateway.list();
    setQuery("");
    setFilter("all");
    relations.setQuery(undefined);
    setItems(values);
    setSelectedId(itemId);
    setBatchIds(new Set([itemId]));
    selectionAnchorRef.current = itemId;
    activateTab(LIBRARY_TAB_ID);
  }

  const {
    attachPdf,
    cancelImport,
    cancelPanel,
    choosePdfs,
    importBibtex,
    importByDoi,
    importPdfs,
    finishImportJob,
    resetManualDraft,
    retryFailedImport,
    reviewPdfPaths,
    saveManual,
  } = createLiteratureImportActions({
    gateway, doiRequest, selected, query, panel, bibtex, bibtexPreview, pdfCandidates, pdfCreatorInputs,
    doi, manual, manualCreatorInput, lastImportJob, metadataPreview, setPanel, setBibtex,
    setPdfCandidates, setPdfCreatorInputs, setDoi, setManual, setManualCreatorInput,
    setLastImportJob, setMetadataPreview, setSelectedId, setError, setNotice, setWarning, refresh,
    onImported: selectImportedItem,
  });

  useEffect(() => {
    let active = true;
    void gateway.list().then((values) => {
      if (active) {
        setItems(values);
        setSelectedId(undefined);
        setBatchIds(new Set());
        selectionAnchorRef.current = undefined;
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [gateway]);

  useEffect(() => {
    void refreshDuplicates();
    void refreshMergeHistory();
  }, []);

  const fileDrop = useLiteratureFileDrop({
    enabled: active && sessionsReady && activeTabId === LIBRARY_TAB_ID,
    root: fileDropRoot, items: visibleItems, selected, isTrash: filter === "trash", gateway,
    reviewPdfPaths, onError: setError, onNotice: setNotice, onWarning: setWarning,
    onAttached: async itemId => {
      setExpandedAttachmentIds(current => new Set([...current, itemId]));
      await refreshReader.current();
    },
  });

  useEffect(() => {
    if (lastImportJob === undefined || terminalImportStates.has(lastImportJob.state)
      || (lastImportJob.sourceKind === "doi" && lastImportJob.state === "queued")) return;
    let active = true;
    const timer = window.setInterval(() => {
      void gateway.getImportJob(lastImportJob.id).then(async (job) => {
        if (!active) return;
        setLastImportJob(job);
        if (terminalImportStates.has(job.state)) {
          window.clearInterval(timer);
          await finishImportJob(job).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : String(reason));
          });
        }
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    }, 300);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [gateway, lastImportJob?.id, lastImportJob?.state]);

  useEffect(() => {
    if (lastImportJob === undefined) return;
    showImportJobNotification(lastImportJob, {
      onCancel: () => void cancelImport().catch((reason: unknown) => (
        setError(reason instanceof Error ? reason.message : String(reason))
      )),
      onRetry: () => void retryFailedImport().catch((reason: unknown) => (
        setError(reason instanceof Error ? reason.message : String(reason))
      )),
    });
  }, [lastImportJob]);

  useEffect(() => {
    if (lastImportJob === undefined || !shouldAutoDismissImportJob(lastImportJob)) return;
    const jobId = lastImportJob.id;
    const timer = window.setTimeout(() => {
      setLastImportJob((current) => current?.id === jobId ? undefined : current);
    }, 4_500);
    return () => window.clearTimeout(timer);
  }, [lastImportJob]);

  useEffect(() => {
    if (panel === undefined) return;
    const dismissPopover = (returnFocus: boolean): void => {
      if (importSubmissionRef.current && !doiRequest.isLoading) return;
      doiRequest.cancel();
      setPanel(undefined);
      if (returnFocus) window.requestAnimationFrame(() => importTriggerRef.current?.focus());
    };
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (importPopoverRef.current?.contains(target) || importTriggerRef.current?.contains(target)) return;
      dismissPopover(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void closeImportPanel();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [panel]);

  useLayoutEffect(() => {
    if (panel === undefined) {
      setImportPopoverPosition(undefined);
      return;
    }
    const updatePosition = (): void => {
      const trigger = importTriggerRef.current;
      const triggerRect = trigger?.isConnected
        ? trigger.getBoundingClientRect()
        : { top: 48, right: window.innerWidth / 2 + 15, bottom: 78, left: window.innerWidth / 2 - 15, width: 30, height: 30 };
      setImportPopoverPosition(calculateImportPopoverPosition(
        panel,
        triggerRect,
        { width: window.innerWidth, height: window.innerHeight },
        importPopoverRef.current?.getBoundingClientRect().height ?? 0,
      ));
    };
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [panel]);

  useEffect(() => {
    getAppStorage().setItem(LITERATURE_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    if (columnPickerPosition === undefined) return;
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && columnPickerRef.current?.contains(event.target)) return;
      setColumnPickerPosition(undefined);
    };
    const closeWithKeyboard = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setColumnPickerPosition(undefined);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [columnPickerPosition]);

  useEffect(() => {
    if (contextMenu === undefined) return;
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(undefined);
    };
    const closeWithKeyboard = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setContextMenu(undefined);
    };
    const closeOnBlur = (): void => setContextMenu(undefined);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", closeWithKeyboard);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", closeWithKeyboard);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [contextMenu]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh(query).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filter, query]);

  async function copyCitation(kind: "citation" | "bibliography"): Promise<void> {
    if (selected === undefined) return;
    const text = kind === "citation"
      ? formatInTextCitation([selected], style)
      : formatBibliography([selected], style);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(kind === "citation" ? "已复制文内引用" : "已复制参考文献条目");
    } catch (reason) {
      setError(`复制失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  async function copySelectedBibliography(): Promise<void> {
    const chosen = items.filter((item) => batchIds.has(item.id));
    if (chosen.length === 0) return;
    await navigator.clipboard.writeText(formatBibliography(chosen, style));
    setNotice(`已复制 ${chosen.length} 条参考文献`);
  }

  function exportSelected(format: StructuredExportFormat): void {
    if (selected === undefined) return;
    const extension = format === "csl-json" ? "json" : format === "bibtex" ? "bib" : "ris";
    const mime = format === "csl-json" ? "application/json" : "text/plain";
    downloadText(exportLiterature([selected], format), `${selected.bibtexKey || "reference"}.${extension}`, mime);
    setNotice(`已导出 ${format.toUpperCase()}`);
  }

  function exportBatch(format: StructuredExportFormat): void {
    const chosen = items.filter((item) => batchIds.has(item.id));
    if (chosen.length === 0) return;
    const extension = format === "csl-json" ? "json" : format === "bibtex" ? "bib" : "ris";
    downloadText(exportLiterature(chosen, format), `research-assistant-export.${extension}`, format === "csl-json" ? "application/json" : "text/plain");
    setNotice(`已导出 ${chosen.length} 篇文献`);
  }

  async function decideDuplicate(candidateId: string, decision: "keep_both" | "dismiss"): Promise<void> {
    await gateway.decideDuplicate(candidateId, decision);
    await refreshDuplicates();
    setNotice("重复候选已处理；系统没有自动删除或合并文献");
  }

  async function mergeDuplicate(candidate: DuplicateCandidate, survivorItemId: string): Promise<void> {
    const survivorTitle = survivorItemId === candidate.leftItemId ? candidate.leftTitle : candidate.rightTitle;
    const mergedTitle = survivorItemId === candidate.leftItemId ? candidate.rightTitle : candidate.leftTitle;
    if (!await confirm(
      `将“${mergedTitle}”合并到“${survivorTitle}”？\n\n附件、标识符、标签、项目、原文锚点和笔记都会保留；被合并条目会归档，并可立即撤销。`,
    )) return;
    const operation = await gateway.mergeDuplicate(candidate.id, survivorItemId);
    notify.success(`已合并到“${survivorTitle}”；原条目已归档，所有来源关系均已保留`, {
      actions: [{
        id: `undo-merge:${operation.id}`,
        label: "撤销合并",
        onClick: () => void undoDuplicateMerge(operation).catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason))),
      }],
      duration: 8_000,
    });
    await Promise.all([refresh(query), refreshDuplicates(), refreshMergeHistory()]);
    setSelectedId(survivorItemId);
  }

  async function undoDuplicateMerge(operation: MergeOperation): Promise<void> {
    const restoredItemId = operation.mergedItemId;
    await gateway.undoMerge(operation.id);
    setNotice("已撤销合并；两条文献及其原关系均已恢复");
    await Promise.all([refresh(query), refreshDuplicates(), refreshMergeHistory()]);
    setSelectedId(restoredItemId);
  }

  function replaceLiteratureItem(item: LiteratureItem): void {
    setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
    setSelectedId(item.id);
  }

  async function updateMetadataDetail(patch: LiteratureMetadataPatch): Promise<LiteratureItem> {
    if (selected === undefined) throw new Error("找不到当前文献");
    const item = await gateway.updateMetadataField(selected.id, patch);
    replaceLiteratureItem(item);
    return item;
  }

  async function confirmMetadataDetails(fieldNames: readonly string[]): Promise<LiteratureItem> {
    if (selected === undefined) throw new Error("找不到当前文献");
    const item = await gateway.confirmMetadataFields(selected.id, fieldNames);
    replaceLiteratureItem(item);
    setNotice("元数据来源已确认");
    return item;
  }

  async function previewMetadataDetails(item: LiteratureItem): Promise<MetadataPreview> {
    if (item.doi.trim().length === 0) throw new Error("请先填写 DOI");
    const preview = await gateway.previewDoi(item.doi, item.id);
    if (shouldTrackMetadataPreviewJob(preview)) {
      setLastImportJob(await gateway.getImportJob(preview.importJobId));
    }
    return preview;
  }

  async function applyMetadataDetailFields(
    candidateId: string,
    decisions: readonly MetadataCandidateFieldDecision[],
    candidateTrust: MetadataCandidateTrust,
  ): Promise<LiteratureItem> {
    const item = await gateway.applyMetadataCandidateFields(candidateId, decisions, candidateTrust);
    replaceLiteratureItem(item);
    setNotice("DOI 元数据已审阅并保存");
    return item;
  }

  async function rejectMetadataDetails(candidateId: string): Promise<void> {
    await gateway.rejectMetadataCandidate(candidateId);
  }

  async function archiveSelected(): Promise<void> {
    if (selected === undefined || !await confirm(`将“${selected.title}”归档？原始附件和笔记仍会保留。`)) return;
    const archivedId = selected.id;
    await gateway.archive(archivedId);
    notify.success("文献已归档（未删除原始附件）", {
      actions: [{
        id: `undo-archive:${archivedId}`,
        label: "撤销归档",
        onClick: () => void undoArchive(archivedId).catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason))),
      }],
      duration: 8_000,
    });
    await refresh(query);
  }

  async function undoArchive(archivedId: string): Promise<void> {
    await gateway.restore(archivedId);
    setNotice("已撤销归档");
    await refresh(query);
  }

  async function trashSelected(): Promise<void> {
    if (selected === undefined || trashingId !== undefined || filter === "trash") return;
    const item = selected;
    if (!await confirm(formatLiteratureTrashConfirmation(item.title))) return;

    setTrashingId(item.id);
    try {
      await gateway.trash(item.id);
      setReaderRegistry((current) => current.closeForItem(item.id));
      setSelectedId(undefined);
      setBatchIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setNotice(`已将“${item.title}”移入回收站；14 天内可恢复`);
      await Promise.all([refresh(query), refreshDuplicates(), refreshMergeHistory()]);
    } finally {
      setTrashingId(undefined);
    }
  }

  async function restoreSelectedFromTrash(): Promise<void> {
    if (selected === undefined || filter !== "trash" || trashingId !== undefined) return;
    const item = selected;
    setTrashingId(item.id);
    try {
      await gateway.restoreTrash(item.id);
      setSelectedId(undefined);
      setBatchIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setNotice(`已从回收站恢复“${item.title}”`);
      await Promise.all([refresh(query), refreshDuplicates(), refreshMergeHistory()]);
    } finally {
      setTrashingId(undefined);
    }
  }

  const activeReader = readerRegistry.activeSession;

  function toggleImportPanel(nextPanel: Exclude<ImportPanel, undefined>, trigger: HTMLButtonElement): void {
    if (importSubmissionRef.current && !doiRequest.isLoading) return;
    cancelDoiLookup();
    importTriggerRef.current = trigger;
    if (metadataPreview !== undefined && nextPanel !== "manual" && nextPanel !== panel) {
      void runImportSubmission(async () => {
        await cancelPanel();
        setPanel(nextPanel);
      });
      return;
    }
    if (nextPanel === "manual" && panel !== "manual" && manual.id !== undefined) {
      setMetadataPreview(undefined);
      resetManualDraft();
    }
    setPanel((current) => current === nextPanel ? undefined : nextPanel);
  }

  function submitImportPanel(): void {
    if (panel === undefined) return;
    void runImportSubmission(() => panel === "pdf" ? importPdfs() : panel === "bibtex" ? importBibtex() : panel === "doi" ? importByDoi() : saveManual());
  }

  async function runImportSubmission(operation: () => Promise<void>): Promise<void> {
    if (importSubmissionRef.current) return;
    const owner = Symbol();
    importSubmissionRef.current = owner;
    setImportSubmitting(true);
    try { await operation(); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally {
      if (importSubmissionRef.current === owner) {
        importSubmissionRef.current = undefined;
        setImportSubmitting(false);
      }
    }
  }

  function cancelDoiLookup(): void {
    if (!doiRequest.isLoading) return;
    doiRequest.cancel();
    importSubmissionRef.current = undefined;
    setImportSubmitting(false);
  }

  async function closeImportPanel(): Promise<void> {
    cancelDoiLookup();
    await runImportSubmission(cancelPanel);
    window.requestAnimationFrame(() => importTriggerRef.current?.focus());
  }

  function openFirstViewableAttachment(item: LiteratureItem): void {
    const attachment = item.attachments.find((candidate) => candidate.mimeType === "application/pdf");
    if (attachment === undefined) {
      setNotice(`“${item.title}”没有可在当前阅读器中打开的附件`);
      return;
    }
    openReader({ item, attachment });
  }

  async function revealAttachments(attachments: readonly AttachmentSummary[]): Promise<void> {
    const attachmentIds = [...new Set(attachments.map((attachment) => attachment.id))];
    if (attachmentIds.length === 0) {
      setWarning("所选文献没有可在 Finder 中显示的附件");
      return;
    }
    await gateway.revealAttachments(attachmentIds);
  }

  function selectLiteratureRow(event: React.MouseEvent<HTMLButtonElement>, itemId: string): void {
    const next = updateLiteratureSelection({
      anchorId: selectionAnchorRef.current,
      clickedId: itemId,
      currentIds: batchIds,
      currentPrimaryId: selectedId,
      extendRange: event.shiftKey,
      toggle: event.metaKey || event.ctrlKey,
      visibleIds: visibleItems.map((item) => item.id),
    });
    selectionAnchorRef.current = next.anchorId;
    setBatchIds(next.selectedIds);
    setSelectedId(next.primaryId);
    setContextMenu(undefined);
  }

  function openLiteratureContextMenu(event: React.MouseEvent<HTMLButtonElement>, itemId: string): void {
    event.preventDefault();
    if (!batchIds.has(itemId)) {
      setBatchIds(new Set([itemId]));
      selectionAnchorRef.current = itemId;
    }
    setSelectedId(itemId);
    setColumnPickerPosition(undefined);
    setContextMenu({
      itemId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 365)),
    });
  }

  function openAttachmentContextMenu(
    event: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    attachmentId: string,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    setColumnPickerPosition(undefined);
    setContextMenu({
      itemId,
      attachmentId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - (filter === "trash" ? 95 : 165))),
    });
  }

  function toggleColumnSort(key: LiteratureColumnKey): void {
    setSort((current) => cycleLiteratureColumnSort(current, key));
  }

  function startColumnResize(event: React.PointerEvent<HTMLSpanElement>, key: LiteratureColumnKey): void {
    event.preventDefault();
    event.stopPropagation();
    const column = columns.find((candidate) => candidate.key === key);
    if (column === undefined) return;
    const startX = event.clientX;
    const startWidth = column.width;
    const resize = (moveEvent: PointerEvent): void => {
      setColumns((current) => resizeLiteratureColumn(current, key, startWidth + moveEvent.clientX - startX));
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop, { once: true });
  }

  const contextItem = contextMenu === undefined
    ? undefined
    : items.find((item) => item.id === contextMenu.itemId);
  const contextAttachment = contextMenu?.attachmentId === undefined
    ? undefined
    : contextItem?.attachments.find((attachment) => attachment.id === contextMenu.attachmentId);
  const contextRevealAttachments = items
    .filter((item) => batchIds.has(item.id))
    .map(bestAttachmentForReveal)
    .filter((attachment): attachment is AttachmentSummary => attachment !== undefined);

  function renderLiteratureCell(item: LiteratureItem, key: LiteratureColumnKey): React.JSX.Element {
    if (key === "title") return <><ControlHint content={typeLabel(item.itemType)}><span aria-label={typeLabel(item.itemType)} className="row-type-icon"><LiteratureTypeIcon type={item.itemType} /></span></ControlHint><ControlHint content={item.title}><strong>{item.title}</strong></ControlHint></>;
    if (key === "creator") return <ControlHint content={creatorLabel(item)}><span className="row-creator">{creatorLabel(item)}</span></ControlHint>;
    if (key === "itemType") return <ControlHint content={typeLabel(item.itemType)}><span className="row-item-type">{typeLabel(item.itemType)}</span></ControlHint>;
    if (key === "year") return <span className="row-year">{item.issuedYear ?? "—"}</span>;
    const attachmentLabel = item.attachments.length > 0 ? `${item.attachments.length} 个附件` : "无附件";
    return <ControlHint content={attachmentLabel}><span aria-label={attachmentLabel} className="attachment-status" role="img">{item.attachments.length > 0 && <AttachmentFileIcon />}</span></ControlHint>;
  }

  const sharedTabs = usePublishWorkspaceTabs("library", [
    { id: "library:home", owner: "library", title: "返回文献列表", home: true, active: active && activeTabId === LIBRARY_TAB_ID, select: () => activateTab(LIBRARY_TAB_ID) },
    ...readerTabs.map(tab => { const id = readerSessionId(tab.attachment.id); return {
      id: `library:${id}`, owner: "library" as const, title: tab.item.title, icon: "pdf" as const, active: active && id === activeTabId,
      select: () => activateTab(id), close: () => { void closeReader(id); },
    }; }),
  ]);
  const tabs = (
    <div aria-label="文献库标签页" className="literature-tabs" role="tablist">
      <ControlHint content="返回文献列表"><button aria-label="返回文献列表" aria-pressed={activeTabId === LIBRARY_TAB_ID} className="literature-home-button workspace-home-button"
        onClick={() => activateTab(LIBRARY_TAB_ID)} type="button"><House aria-hidden="true" size={16} /></button></ControlHint>
      {readerTabs.map((tab) => {
        const tabId = readerSessionId(tab.attachment.id);
        return (
          <div className={tabId === activeTabId ? "literature-reader-tab active" : "literature-reader-tab"} key={tabId}>
            <ControlHint content={tab.item.title}><button
              aria-selected={tabId === activeTabId}
              onClick={() => activateTab(tabId)}
              role="tab"
              type="button"
            >
              <span aria-hidden="true">PDF</span>
              {tab.item.title}
            </button></ControlHint>
            <button aria-label={`关闭 ${tab.item.title}`} onClick={() => void closeReader(tabId)} type="button">×</button>
          </div>
        );
      })}
    </div>
  );

  return (
    <section ref={fileDropRoot} aria-busy={!sessionsReady} inert={!active || !sessionsReady} className="library-workspace" data-tabs-docked={Boolean(tabHost)}
      onDragOver={fileDrop.onDragOver} onDragLeave={fileDrop.onDragLeave} onDrop={fileDrop.onDrop}>
      {fileDrop.target && <OverlayPortal kind="hint"><div className="literature-file-drop-hint" role="status">{literatureFileDropLabel(fileDrop.target)}</div></OverlayPortal>}
      {!sharedTabs && active && (tabHost ? createPortal(tabs, tabHost) : tabs)}

      <div className="library-surface" hidden={activeTabId !== LIBRARY_TAB_ID}>
      <div className="library-toolbar">
        <ControlHint content="切换关系栏"><button className="library-tool-button" type="button" aria-label="切换关系栏" aria-expanded={relationSidebarOpen} onClick={() => { const next = !relationSidebarOpen; setRelationSidebarOpen(next); getAppStorage().setItem("research-assistant:relation-sidebar", next ? "open" : "closed"); }}><PanelLeft size={17} /></button></ControlHint>
        <ControlHint content="管理文献关系"><button className="library-tool-button" type="button" aria-label="管理文献关系" disabled={!relations.ready || relations.busy || filter === "trash" || batchIds.size === 0} onClick={() => setRelationItems([...batchIds])}><GitCompareArrows size={17}/></button></ControlHint>
        <ControlHint content={filter === "trash" ? "返回文献库" : "回收站"}><button className="library-tool-button" type="button" aria-label={filter === "trash" ? "返回文献库" : "回收站"} onClick={() => setFilter(filter === "trash" ? "all" : "trash")}>{filter === "trash" ? <ArrowLeft size={17} /> : <Trash2 size={17} />}</button></ControlHint>
        <div aria-label="文献库工具栏" className="import-actions" role="group">
          <ControlHint content="为选中文献添加 PDF 附件"><button className="library-tool-button" aria-label="为选中文献添加 PDF 附件" type="button" disabled={selected === undefined || batchIds.size !== 1 || filter === "trash"} onClick={() => void attachPdf().then(() => { if (selected !== undefined) setExpandedAttachmentIds(current => new Set([...current, selected.id])); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))}><Paperclip size={18} aria-hidden="true" /></button></ControlHint>
          <ControlHint content="从 PDF 添加文献"><button aria-label="从 PDF 添加文献" className="library-tool-button" onClick={(event) => { importTriggerRef.current = event.currentTarget; void choosePdfs().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); }} type="button"><FileUp aria-hidden="true" size={20} strokeWidth={1.7} /></button></ControlHint>
          <ControlHint content="通过 DOI 添加"><button aria-label="通过 DOI 添加" aria-controls="literature-import-popover" aria-expanded={panel === "doi"} aria-haspopup="dialog" className={panel === "doi" ? "library-tool-button active" : "library-tool-button"} onClick={(event) => toggleImportPanel("doi", event.currentTarget)} type="button"><WandSparkles aria-hidden="true" size={20} strokeWidth={1.7} /></button></ControlHint>
          <ControlHint content="从 BibTeX 添加"><button aria-label="从 BibTeX 添加" aria-controls="literature-import-popover" aria-expanded={panel === "bibtex"} aria-haspopup="dialog" className={panel === "bibtex" ? "library-tool-button active" : "library-tool-button"} onClick={(event) => toggleImportPanel("bibtex", event.currentTarget)} type="button"><FileText aria-hidden="true" size={20} strokeWidth={1.7} /></button></ControlHint>
          <ControlHint content="手动添加文献"><button aria-label="手动添加文献" aria-controls="literature-import-popover" aria-expanded={panel === "manual"} aria-haspopup="dialog" className={panel === "manual" ? "library-tool-button active" : "library-tool-button"} onClick={(event) => toggleImportPanel("manual", event.currentTarget)} type="button"><SquarePen aria-hidden="true" size={20} strokeWidth={1.7} /></button></ControlHint>
        </div>
        <div className="library-search" data-focus-shell><Search aria-hidden="true" size={18} strokeWidth={1.7} /><input aria-label="搜索文献" onChange={(event) => setQuery(event.target.value)} placeholder="标题、作者或年份" value={query} /></div>
      </div>

      {panel !== undefined && <OverlayPortal><form aria-busy={importSubmitting || doiLoading} aria-label={panel === "pdf" ? "检查 PDF 元数据" : panel === "bibtex" ? "从 BibTeX 添加文献" : panel === "doi" ? "通过 DOI 添加文献" : "手动添加文献"} aria-modal="false" className={`import-panel ${panel}`} id="literature-import-popover" onKeyDown={panel === "manual" ? navigateManualImportFields : undefined} onSubmit={(event) => { event.preventDefault(); submitImportPanel(); }} ref={importPopoverRef} role="dialog" style={{ left: importPopoverPosition?.left ?? 8, top: importPopoverPosition?.top ?? 50, visibility: importPopoverPosition === undefined ? "hidden" : "visible", width: importPopoverPosition?.width ?? 560 }}>
          <div className="import-panel-heading"><strong>{panel === "pdf" ? "检查 PDF 元数据后添加到文献库" : panel === "bibtex" ? "粘贴 BibTeX，或选择 .bib 文件" : panel === "doi" ? "输入 DOI 以添加到文献库" : "手动添加文献"}</strong><button aria-label="关闭添加浮窗" disabled={importSubmitting && !doiLoading} onClick={() => void closeImportPanel()} type="button"><X aria-hidden="true" size={17} /></button></div>
          {panel === "pdf" && <div className="pdf-import-preview"><p>文件名仅作为初始候选。确认或修正后，原始 PDF 才会复制到内容寻址存储。</p>{pdfCandidates.map((candidate, index) => <div key={candidate.path}><span>{candidate.path.split(/[\\/]/).pop()}</span><input aria-label={`PDF ${index + 1} 标题`} onChange={(event) => setPdfCandidates((values) => values.map((value, currentIndex) => currentIndex === index ? { ...value, draft: { ...value.draft, title: event.target.value, sourceKind: "user" } } : value))} placeholder="文献标题" value={candidate.draft.title} /><input aria-label={`PDF ${index + 1} 作者`} onChange={(event) => setPdfCreatorInputs((values) => ({ ...values, [candidate.path]: updateLiteratureCreatorInput(values[candidate.path] ?? createLiteratureCreatorInput(candidate.draft.creators), event.target.value) }))} placeholder="作者：姓, 名；多位用分号" value={(pdfCreatorInputs[candidate.path] ?? createLiteratureCreatorInput(candidate.draft.creators)).value} /><input aria-label={`PDF ${index + 1} 年份`} onChange={(event) => setPdfCandidates((values) => values.map((value, currentIndex) => { if (currentIndex !== index) return value; const draft = { ...value.draft, sourceKind: "user" }; if (event.target.value.length > 0) return { ...value, draft: { ...draft, issuedYear: Number(event.target.value) } }; const { issuedYear: _issuedYear, ...withoutYear } = draft; return { ...value, draft: withoutYear }; }))} placeholder="年份" type="number" value={candidate.draft.issuedYear ?? ""} /><input aria-label={`PDF ${index + 1} DOI`} onChange={(event) => setPdfCandidates((values) => values.map((value, currentIndex) => currentIndex === index ? { ...value, draft: { ...value.draft, doi: event.target.value, sourceKind: "user" } } : value))} placeholder="DOI" value={candidate.draft.doi} /></div>)}</div>}
          {panel === "bibtex" && <><input accept=".bib,.bibtex,text/plain" aria-label="选择 BibTeX 文件" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) void file.text().then(setBibtex); }} type="file" /><textarea autoFocus onChange={(event) => setBibtex(event.target.value)} placeholder="@article{...}" rows={8} value={bibtex} />{bibtexPreview.error !== undefined && <div className="inline-error">无法解析：{bibtexPreview.error}</div>}{bibtexPreview.drafts.length > 0 && <div className="import-preview"><strong>入库前预览 · {bibtexPreview.drafts.length} 条</strong>{bibtexPreview.drafts.map((draft, index) => <div key={`${draft.bibtexKey}-${index}`}><span>{draft.title || "未识别标题"}</span><small>{formatLiteratureCreators(draft.creators) || "作者未知"} · {draft.issuedYear ?? "年份未知"}</small></div>)}</div>}</>}
          {panel === "doi" && <input disabled={doiLoading} autoComplete="off" autoFocus onChange={(event) => setDoi(event.target.value)} placeholder="例如 10.1038/s41586-…" value={doi} />}
          {panel === "manual" && (
            <><p className="manual-draft-note">先在这里完善条目信息；只有点击“添加到文献库”才会创建条目。</p><div className="manual-grid">
              <input data-tab-action="both" autoFocus onChange={(event) => setManual((value) => ({ ...value, title: event.target.value }))} placeholder="标题（必填）" value={manual.title} />
              <select data-tab-action="both" aria-label="条目类型" onChange={(event) => setManual((value) => ({ ...value, itemType: event.target.value as LiteratureDraft["itemType"] }))} value={manual.itemType}>
                {LITERATURE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input data-tab-action="both" onChange={(event) => setManual((value) => {
                if (event.target.value.length > 0) return { ...value, issuedYear: Number(event.target.value) };
                const { issuedYear: _issuedYear, ...withoutYear } = value;
                return withoutYear;
              })} placeholder="年份" type="number" value={manual.issuedYear ?? ""} />
              <input data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, doi: event.target.value }))} placeholder="DOI" value={manual.doi} />
              <input data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, containerTitle: event.target.value }))} placeholder="来源 / 容器" value={manual.containerTitle} />
              {manual.itemType === "conferencePaper" && <>
                <input data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, conferenceName: event.target.value }))} placeholder="会议名称" value={manual.conferenceName ?? ""} />
                <input data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, proceedingsTitle: event.target.value }))} placeholder="会议录标题" value={manual.proceedingsTitle ?? ""} />
                <input data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, place: event.target.value }))} placeholder="会议或出版地点" value={manual.place ?? ""} />
              </>}
              <input data-tab-action="both" onChange={(event) => setManualCreatorInput((value) => updateLiteratureCreatorInput(value, event.target.value))} placeholder="作者：姓, 名；多位用分号" value={manualCreatorInput.value} />
              <input data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))} placeholder="标签，以逗号分隔" value={manual.tags.join(", ")} />
              <textarea data-tab-action="both" onChange={(event) => setManual((value) => ({ ...value, abstractText: event.target.value }))} placeholder="摘要" rows={3} value={manual.abstractText} />
            </div>{metadataPreview !== undefined && <div className="metadata-diff"><strong>字段差异 · {metadataPreview.sourceKind}</strong>{metadataPreview.diffs.length === 0 ? <span>候选与当前值一致</span> : metadataPreview.diffs.map((diff) => <div key={diff.fieldName}><span>{diff.fieldName}{diff.userConfirmed ? " · 用户已确认" : ""}</span><del>{diff.currentValue || "（空）"}</del><ins>{diff.candidateValue || "（空）"}</ins></div>)}</div>}</>
          )}
          <div className="form-actions">
            <button className="ghost-button" disabled={importSubmitting && !doiLoading} onClick={() => void closeImportPanel()} type="button">取消</button>
            <button className="primary-button" disabled={importSubmitting || doiLoading || (panel === "doi" && doi.trim().length === 0) || (panel === "manual" && manual.title.trim().length === 0)} type="submit">{doiLoading ? <><LoaderCircle className="spinning" aria-hidden="true" size={14} /> 正在获取 DOI…</> : importSubmitting ? "正在处理…" : panel === "manual" ? "添加到文献库" : panel === "pdf" ? "确认并导入" : "检查并导入"}</button>
          </div>
        </form></OverlayPortal>}


      {duplicates.length > 0 && <div className="duplicate-panel"><div><span className="eyebrow">DUPLICATE REVIEW</span><strong>{duplicates.length} 组潜在重复项需要确认</strong></div>{duplicates.map((candidate) => <div className="duplicate-row" key={candidate.id}><span>{candidate.leftTitle}</span><b>⇄</b><span>{candidate.rightTitle}</span><small>{candidate.reason === "doi" ? "DOI 完全相同" : candidate.reason === "content_hash" ? "PDF 内容完全相同" : "标题与年份相似"} · {Math.round(candidate.confidence * 100)}%</small><div className="duplicate-actions"><button onClick={() => void mergeDuplicate(candidate, candidate.leftItemId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))} type="button">合并到左侧</button><button onClick={() => void mergeDuplicate(candidate, candidate.rightItemId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))} type="button">合并到右侧</button><button onClick={() => void decideDuplicate(candidate.id, "keep_both")} type="button">保留两条</button><button onClick={() => void decideDuplicate(candidate.id, "dismiss")} type="button">忽略提示</button></div></div>)}</div>}

      {mergeHistory.length > 0 && <div className="merge-history"><div><span className="eyebrow">MERGE HISTORY</span><strong>{mergeHistory.length} 次合并可撤销</strong></div>{mergeHistory.map((operation) => <div key={operation.id}><span><s>{operation.mergedTitle}</s> → {operation.survivorTitle}</span><button onClick={() => void undoDuplicateMerge(operation).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))} type="button">撤销合并</button></div>)}</div>}

      <div className="library-with-relations">
      {relationSidebarOpen && filter !== "trash" && <NalSidebarPane><NalSidebar controller={relations} onAnnotate={target=>void openAnnotation(target)} /></NalSidebarPane>}
      <div className="library-grid" ref={detailLayout.gridRef} style={detailLayout.gridStyle} data-file-drop-target={fileDrop.target?.kind === "standalone" || undefined}>
        <div className="literature-list" data-literature-drop-zone="list" aria-busy={loading || trashingId !== undefined} onKeyDown={handleLiteratureDeleteKey}>
          <div className={`literature-table-scroll${loading || visibleItems.length === 0 ? " is-empty" : ""}`} ref={tableLayout.scrollRef} style={{ "--literature-row-columns": tableLayout.gridTemplate, "--literature-table-width": `${tableLayout.tableWidth}px` } as React.CSSProperties}>
            <ControlHint content="右键选择显示的列"><div
              className="literature-columns"
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu(undefined);
                setColumnPickerPosition({
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - 198)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - 220)),
                });
              }}
              role="row"
            >
              {visibleColumns.map((column, index) => {
                const activeSort = sort.key === column.key;
                return <div aria-sort={activeSort ? sort.direction : "none"} className={`literature-column ${column.key}`} key={column.key} role="columnheader">
                  <ControlHint content={`按${column.label}排序`}><button aria-label={`按${column.label}排序`} onClick={() => toggleColumnSort(column.key)} type="button">{column.key === "attachment" ? <Paperclip aria-hidden="true" size={17} strokeWidth={1.8} /> : <span>{column.label}</span>}{activeSort && (sort.direction === "ascending" ? <ArrowUp aria-hidden="true" size={12} /> : <ArrowDown aria-hidden="true" size={12} />)}</button></ControlHint>
                  {index < visibleColumns.length - 1 && <span aria-label={`调整${column.label}列宽`} aria-orientation="vertical" className="column-resizer" onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); setColumns((current) => resizeLiteratureColumn(current, column.key, column.width + (event.key === "ArrowRight" ? 10 : -10))); }} onPointerDown={(event) => startColumnResize(event, column.key)} role="separator" tabIndex={0} />}
                </div>;
              })}
            </div></ControlHint>
            {visibleItems.map((item, index) => (
              <LiteratureAttachmentRows key={item.id} item={item} expanded={expandedAttachmentIds.has(item.id)}
                isFileDropTarget={fileDrop.target?.kind === "item" && fileDrop.target.area === "row" && fileDrop.target.item.id === item.id}
                onExpandedChange={expanded => setExpandedAttachmentIds(current => { const next = new Set(current); if (expanded) next.add(item.id); else next.delete(item.id); return next; })}
                onOpen={attachment => openReader({ item, attachment })}
                onContextMenu={(event, attachment) => openAttachmentContextMenu(event, item.id, attachment.id)}>
              <ControlHint content="单击选择；Cmd/Ctrl 或 Shift 单击多选；双击打开第一个 PDF 附件" key={item.id}><button
                aria-label={`${item.title}，${typeLabel(item.itemType)}，${creatorLabel(item)}，${item.issuedYear ?? "年份未知"}`}
                aria-selected={batchIds.has(item.id)}
                className={`literature-row ${index % 2 === 0 ? "even" : "odd"}${batchIds.has(item.id) ? " selected" : ""}${item.id === selectedId ? " current" : ""}`}
                data-item-id={item.id}
                onClick={(event) => selectLiteratureRow(event, item.id)}
                onContextMenu={(event) => openLiteratureContextMenu(event, item.id)}
                onDoubleClick={() => openFirstViewableAttachment(item)}
                role="row"
                type="button"
              >
                {visibleColumns.map((column) => <span className={`literature-cell ${column.key}`} key={column.key} role="cell">{renderLiteratureCell(item, column.key)}</span>)}
              </button></ControlHint>
              </LiteratureAttachmentRows>
            ))}
          {loading && <div className="library-empty">正在读取本地文献库…</div>}
          {!loading && visibleItems.length === 0 && <div className="library-empty"><strong>{filter === "trash" ? "回收站是空的" : relations.query ? "当前关系查询中没有匹配文献" : "文献库还是空的"}</strong><p>{filter === "trash" ? "移入回收站的文献会在这里保留 14 天。" : relations.query ? "可以清除查询，或为文献添加符合条件的关系语句。" : "从 PDF、DOI 或 BibTeX 开始；原始文件会复制到内容寻址的本地存储。"}</p></div>}
          </div>
        </div>

        <ControlHint content="拖动调整宽度；双击恢复默认"><button
          aria-label="调整文献信息栏宽度"
          aria-orientation="vertical"
          className="literature-pane-resizer"
          onDoubleClick={detailLayout.resetPaneWidth}
          onKeyDown={detailLayout.handleSeparatorKeyDown}
          onPointerDown={detailLayout.startResize}
          role="separator"
          type="button"
        /></ControlHint>
        <aside className="literature-detail" data-literature-drop-zone="detail" data-file-drop-target={fileDrop.target?.kind === "item" && fileDrop.target.area === "detail" || undefined}>
          {selected === undefined ? <div className="detail-empty">选择一篇文献查看详情</div> : (
            <LiteratureDetailContent key={`${selected.id}:${filter === "trash"}`} hasReadingDetails={filter !== "trash"}>{onReady => <>
              <LiteratureSummary
                basicFields={detailLayout.basicFields}
                isFieldPickerOpen={isBasicFieldPickerOpen}
                item={selected}
                onCloseFieldPicker={() => setIsBasicFieldPickerOpen(false)}
                onOpenDetails={() => setMetadataDialog({ itemId: selected.id })}
                onOpenPendingDetails={() => {
                  const focusFieldName = firstPendingMetadataField(selected.metadataSources);
                  setMetadataDialog(focusFieldName === undefined
                    ? { itemId: selected.id }
                    : { itemId: selected.id, focusFieldName });
                }}
                onResetBasicFields={detailLayout.resetBasicFields}
                onToggleBasicField={detailLayout.toggleBasicField}
                onToggleFieldPicker={() => setIsBasicFieldPickerOpen((current) => !current)}
              />
              {filter === "trash" && <div className="trash-retention"><strong>{trashRetentionLabel(selected.trashedAt)}</strong><span>PDF、批注、笔记和项目关联仍完整保留；到期后自动永久清理。</span></div>}
              {filter !== "trash" && <PaperOverviewPanel item={selected} onInitialLoadSettled={onReady} onOpenAttachment={(attachment) => openReader({ item: selected, attachment })} onPaperReviewChanged={async () => { await refresh(query); }} {...(project === undefined ? {} : { project })} />}
              <LiteratureCitationActions style={style} onStyleChange={setStyle} onCopy={copyCitation} onExport={exportSelected} />
              {filter === "trash" && (
                <button className="restore-trash-button" disabled={trashingId === selected.id} onClick={() => void restoreSelectedFromTrash().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))} type="button">{trashingId === selected.id ? "正在恢复…" : "从回收站恢复"}</button>
              )}
            </>}</LiteratureDetailContent>
          )}
        </aside>
      </div>
      </div>
      {relationItems !== undefined && <NalStatementEditor controller={relations} itemIds={relationItems} onClose={() => setRelationItems(undefined)} onAnnotate={target=>void openAnnotation(target)} />}
      {selected !== undefined && metadataDialog?.itemId === selected.id && (
        <LiteratureMetadataDialog
          focusFieldName={metadataDialog.focusFieldName}
          isReadOnly={filter === "trash"}
          item={selected}
          onApplyCandidateFields={applyMetadataDetailFields}
          onClose={() => setMetadataDialog(undefined)}
          onConfirmFields={confirmMetadataDetails}
          onError={setError}
          onPreviewDoi={previewMetadataDetails}
          onRejectCandidate={rejectMetadataDetails}
          onSuccess={setNotice}
          onUpdateField={updateMetadataDetail}
        />
      )}
      {columnPickerPosition !== undefined && <OverlayPortal><div
          aria-label="显示列"
          className="column-picker"
          onContextMenu={(event) => event.preventDefault()}
          ref={columnPickerRef}
          role="menu"
          style={{ left: columnPickerPosition.x, top: columnPickerPosition.y }}
        >
          {columns.filter((column) => !column.required).map((column) => (
            <button
              aria-checked={column.visible}
              key={column.key}
              onClick={() => {
                setColumns((current) => toggleLiteratureColumn(current, column.key));
                setColumnPickerPosition(undefined);
              }}
              role="menuitemcheckbox"
              type="button"
            >
              <span aria-hidden="true" className="column-menu-check">{column.visible ? "✓" : ""}</span>
              <span>{column.label}</span>
            </button>
          ))}
        </div></OverlayPortal>}
      {contextMenu !== undefined && contextItem !== undefined && contextMenu.attachmentId === undefined && <OverlayPortal><div aria-label="文献操作" className="literature-context-menu" onContextMenu={(event) => event.preventDefault()} ref={contextMenuRef} role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
        <button role="menuitem" type="button" disabled={!relations.ready || relations.busy || filter === "trash"} onClick={() => { setContextMenu(undefined); setRelationItems([...batchIds]); }}>添加关系／管理语句</button>
        <button disabled={!contextItem.attachments.some((attachment) => attachment.mimeType === "application/pdf")} onClick={() => { setContextMenu(undefined); openFirstViewableAttachment(contextItem); }} role="menuitem" type="button">打开第一个附件</button>
        <button disabled={contextRevealAttachments.length === 0} onClick={() => { setContextMenu(undefined); void revealAttachments(contextRevealAttachments).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); }} role="menuitem" type="button">{batchIds.size > 1 ? "在 Finder 中显示所选附件" : "在 Finder 中显示"}</button>
        {batchIds.size === 1 && <button onClick={() => { setContextMenu(undefined); setSelectedId(contextItem.id); setMetadataDialog({ itemId: contextItem.id }); }} role="menuitem" type="button">文献详情…</button>}
        <button onClick={() => { setContextMenu(undefined); void copySelectedBibliography(); }} role="menuitem" type="button">复制所选参考文献</button>
        <div role="separator" />
        <button onClick={() => { setContextMenu(undefined); exportBatch("bibtex"); }} role="menuitem" type="button">导出所选为 BibTeX</button>
        <button onClick={() => { setContextMenu(undefined); exportBatch("ris"); }} role="menuitem" type="button">导出所选为 RIS</button>
        <button onClick={() => { setContextMenu(undefined); exportBatch("csl-json"); }} role="menuitem" type="button">导出所选为 CSL JSON</button>
        {batchIds.size === 1 && <><div role="separator" />{filter === "trash" ? <button onClick={() => { setContextMenu(undefined); void restoreSelectedFromTrash().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); }} role="menuitem" type="button">从回收站恢复</button> : <><button onClick={() => { setContextMenu(undefined); void archiveSelected().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); }} role="menuitem" type="button">归档文献…</button><button className="danger" onClick={() => { setContextMenu(undefined); void trashSelected().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); }} role="menuitem" type="button">移入回收站…</button></>}</>}
      </div></OverlayPortal>}
      {contextMenu !== undefined && contextItem !== undefined && contextAttachment !== undefined && <OverlayPortal><div aria-label="附件操作" className="literature-context-menu" onContextMenu={(event) => event.preventDefault()} ref={contextMenuRef} role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
        <button disabled={contextAttachment.mimeType !== "application/pdf"} onClick={() => { setContextMenu(undefined); openReader({ item: contextItem, attachment: contextAttachment }); }} role="menuitem" type="button">在标签页打开</button>
        <button onClick={() => { setContextMenu(undefined); void revealAttachments([contextAttachment]).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))); }} role="menuitem" type="button">在 Finder 中显示</button>
        {filter !== "trash" && <>
          <button onClick={() => { setContextMenu(undefined); setAttachmentAction({mode: "rename", itemId: contextItem.id, attachment: contextAttachment}); }} role="menuitem" type="button">重命名附件</button>
          <button onClick={() => { setContextMenu(undefined); setAttachmentAction({mode: "remove", itemId: contextItem.id, attachment: contextAttachment}); }} role="menuitem" type="button">删除附件…</button>
        </>}
      </div></OverlayPortal>}
      {attachmentAction && <LiteratureAttachmentDialog key={`${attachmentAction.mode}:${attachmentAction.attachment.id}`}
        mode={attachmentAction.mode} attachment={attachmentAction.attachment} onClose={() => {
          const itemId = attachmentAction.itemId; setAttachmentAction(undefined);
          requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.literature-row[data-item-id="${CSS.escape(itemId)}"]`)?.focus());
        }} onSubmit={async name => {
          const {itemId, attachment, mode} = attachmentAction;
          if (mode === "rename") {
            await gateway.renameAttachment(itemId, attachment.id, name);
            const item = await gateway.get(itemId);
            setReaderRegistry(current => current.refreshItem(item));
            setNotice("附件名称已更新");
          } else {
            const tabId = readerSessionId(attachment.id);
            if (readerTabs.some(tab => tab.id === tabId) && !await getReaderCloseCoordinator().close(tabId)) throw new Error("附件阅读器仍有未完成操作，无法删除");
            const result = await gateway.removeAttachment(itemId, attachment.id);
            setReaderRegistry(current => current.close(tabId));
            const messages = {missing: "附件文件已不存在，记录已删除", retained: "附件记录已删除，共用或仍被引用的文件已保留", cleanup_failed: "附件记录已删除，文件尚待清理", deleted: "附件及其存储文件已删除"};
            setNotice(messages[result.fileStatus]);
            if (result.warning) setWarning(result.warning);
            await gateway.get(itemId).then(item => setReaderRegistry(current => current.refreshItem(item)))
              .catch((reason: unknown) => setWarning(`附件已删除，但阅读器资料更新失败：${reason instanceof Error ? reason.message : String(reason)}`));
          }
          await refreshReader.current().catch((reason: unknown) => setWarning(`附件操作已完成，但列表刷新失败：${reason instanceof Error ? reason.message : String(reason)}`));
        }} />}
      </div>
      {readerTabs.map(reader => <RetainedPaperReader key={reader.id} reader={reader} selected={activeReader === reader}
        active={active && activeReader === reader} gateway={gateway} {...(project === undefined ? {} : {project})}
        onOpen={openReader} onReviewChanged={reviewChanged} onClose={commitCloseReader}/>)}
    </section>
  );
}
