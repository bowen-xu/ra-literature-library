import { useAgentCanvasMessage } from "@research-assistant/workbench-sdk/agent-ui";
import { prepareSelectionExplanationInput } from "./selection/selectionExplanationMessage";
import { submitSelectionAnnotation } from "./selection/submitSelectionAnnotation";
import { getDoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import { PdfPageControls } from "@research-assistant/workbench-sdk/pdf";
import { createPortal } from "react-dom";
import { useRef } from "react";
import { Popover } from "@research-assistant/workbench-sdk/overlay";
import { usePopoverStore } from "@ariakit/react";
import type { ReactNode, CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  List,
  ListTree,
  Maximize2,
  PanelRight,
  Redo2,
  Search,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AiRun } from "@research-assistant/core/ai";
import type { AttachmentSummary, LiteratureItem, SourceRect } from "@research-assistant/core/literature";
import type { ReadingNoteBlock } from "@research-assistant/core/notes";
import type { ReaderCommand, ReaderUiSessionState } from "@research-assistant/core/reader";

import type { ConceptCaptureValue } from "../knowledge/ConceptCapturePanel";
import { PdfSelectionActions, type PdfSelectionActionDraft } from "../knowledge/PdfSelectionActions";
import type { ReferenceCaptureValue } from "../synthesis/ReferenceCapturePanel";
import type { ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import { PdfThumbnailList } from "../../components/PdfThumbnailList";
import { PdfSelectionPopover } from "../../components/PdfSelectionPopover";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { PdfView } from "@research-assistant/workbench-sdk/pdf";
import type { PdfSelection } from "@research-assistant/core/pdf-view";
import type { AnnotationController, AnnotationControllerSnapshot } from "./annotations/AnnotationController";
import type { ReaderCommandPayload } from "./commands/ReaderCommandDispatcher";
import type { ReaderSessionController, ReaderSessionSnapshot } from "./session/ReaderSessionController";
import type { PdfSelectionSession, SaveReadingSelectionOptions } from "./selection/useReaderSelectionSessions";
import { readingNoteSegments } from "./readerWorkspaceModel";
import { ReaderSidebarPages } from "./ReaderSidebarPages";
import { LiteratureNotes } from "./LiteratureNotes";
import { AnnotationSaveFeedback } from "./AnnotationSaveFeedback";
import { PositionNoteMarker } from "./PositionNoteMarker";
import { WordExplanationMarkers } from "./WordExplanationMarkers";
import { useWordExplanationRecords } from "./useWordExplanationRecords";
import { wordExplanationForSelection } from "@research-assistant/core/dictionary";
import { isPositionNote, positionNoteSelection } from "./positionNotes";
import { orderedReadingAnnotations } from "./readingAnnotationOrder";
import { StructuredBlocksToggle } from "./pdf/StructuredBlocksToggle";

interface ReaderWorkspaceViewProps {
  readonly readingPanel?: ReactNode;
  readonly item: LiteratureItem;
  readonly attachment: AttachmentSummary;
  readonly reader: ReaderSessionSnapshot;
  readonly controller: ReaderSessionController;
  readonly annotationController: AnnotationController;
  readonly annotationState: AnnotationControllerSnapshot;
  readonly annotations: readonly ReadingNoteBlock[];
  readonly selectedReadingId: string | undefined;
  readonly uiSession: ReaderUiSessionState;
  readonly active: boolean;
  readonly documentVersion: string;
  readonly navigationRequestId: number | undefined;
  readonly announcement: string;
  readonly pageInput: string;
  readonly search: string;
  readonly searchOpen: boolean;
  readonly searchHighlightAll: boolean;
  readonly searchCaseSensitive: boolean;
  readonly searchEntireWord: boolean;
  readonly pageNote: string;
  readonly thumbnailRevisionByPage: ReadonlyMap<number, string>;
  readonly selectionSessions: readonly PdfSelectionSession[];
  readonly selectionDrafts: readonly PdfSelectionSession[];
  readonly startSelection: () => void;
  readonly completeSelection: (selection: PdfSelection) => void;
  readonly openSavedHighlight: (note: ReadingNoteBlock, pageIndex: number, rect: SourceRect) => void;
  readonly structuredOverlayEnabled: boolean;
  readonly structuredOverlayPreparing: boolean;
  readonly knowledgeGateway: ResearchKnowledgeGateway;
  readonly workspaceRef: RefObject<HTMLDivElement | null>;
  readonly viewerContainerRef: RefObject<HTMLDivElement | null>;
  readonly viewerElementRef: RefObject<HTMLDivElement | null>;
  readonly pageInputRef: RefObject<HTMLInputElement | null>;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  readonly onFocusTarget: (target: EventTarget) => void;
  readonly onStructuredOverlayPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onStructuredOverlayPointerLeave: () => void;
  readonly onToggleStructuredOverlay: () => void;
  readonly setPageInput: (value: string) => void;
  readonly setSearch: (value: string) => void;
  readonly setSearchHighlightAll: (value: boolean) => void;
  readonly setSearchCaseSensitive: (value: boolean) => void;
  readonly setSearchEntireWord: (value: boolean) => void;
  readonly setPageNote: (value: string) => void;
  readonly executeReaderCommand: (command: ReaderCommand, payload?: ReaderCommandPayload, target?: EventTarget | null) => boolean;
  readonly commitPageInput: () => void;
  readonly runFind: (findPrevious?: boolean, type?: "find" | "again") => void;
  readonly startSidebarResize: (side: "navigation" | "notes", event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly activateSelectionDraft: (sessionId: string) => void;
  readonly discardSelection: (sessionId: string) => void;
  readonly updateSelectionDraftState: (sessionId: string, draft: PdfSelectionActionDraft, dirty: boolean) => void;
  readonly saveSelection: (session: PdfSelectionSession, body: string, options?: SaveReadingSelectionOptions) => Promise<void>;
  readonly ensureAiAnchor: (session: PdfSelectionSession) => Promise<string>;
  readonly aiRunStarted: (sessionId: string, run: AiRun) => void;
  readonly captureConcept: (session: PdfSelectionSession, value: ConceptCaptureValue) => Promise<void>;
  readonly captureReference: (session: PdfSelectionSession, value: ReferenceCaptureValue) => Promise<void>;
}

export function ReaderWorkspaceView({
  readingPanel,
  item,
  attachment,
  reader,
  controller,
  annotationController,
  annotationState,
  annotations,
  selectedReadingId,
  uiSession,
  active,
  documentVersion,
  navigationRequestId,
  announcement,
  pageInput,
  search,
  searchOpen,
  searchHighlightAll,
  searchCaseSensitive,
  searchEntireWord,
  thumbnailRevisionByPage,
  selectionSessions,
  selectionDrafts,
  startSelection,
  completeSelection,
  openSavedHighlight,
  structuredOverlayEnabled,
  structuredOverlayPreparing,
  knowledgeGateway,
  workspaceRef,
  viewerContainerRef,
  viewerElementRef,
  pageInputRef,
  searchInputRef,
  onFocusTarget,
  onStructuredOverlayPointerMove,
  onStructuredOverlayPointerLeave,
  onToggleStructuredOverlay,
  setPageInput,
  setSearch,
  setSearchHighlightAll,
  setSearchCaseSensitive,
  setSearchEntireWord,
  executeReaderCommand,
  commitPageInput,
  runFind,
  startSidebarResize,
  activateSelectionDraft,
  discardSelection,
  updateSelectionDraftState,
  saveSelection,
  ensureAiAnchor,
  aiRunStarted,
  captureConcept,
  captureReference,
}: ReaderWorkspaceViewProps): React.JSX.Element {
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchPopover = usePopoverStore({open: searchOpen, placement: "bottom-end"});
  const sendChatMessage = useAgentCanvasMessage();
  async function annotateSelection(session: PdfSelectionSession, comment: string, intent?: "send" | "silent") {
    await submitSelectionAnnotation({paperId:item.id, attachmentId:attachment.id, title:attachment.displayName, pending:session.pending,
      controller, comment, ...(intent ? {intent} : {}), submit:sendChatMessage, discard:()=>discardSelection(session.id)});
  }
  const words = useWordExplanationRecords(attachment.id, attachment.contentSha256);
  const pageNumber = reader.pageIndex + 1;
  const pageCount = reader.pageCount;
  const pageHosts = reader.pageHosts;
  const sidebarOpen = uiSession.navigationSidebar.open;
  const notesOpen = uiSession.notesSidebar.open;
  const sidebarView = uiSession.navigationSidebar.view;
  const searchMatches = reader.findTotal === 0 ? "0 / 0" : `${reader.findCurrent} / ${reader.findTotal}`;
  return (
    <div
      aria-label={`${item.title} PDF 阅读器`}
      className="reader-workspace"
      data-cached-pdf-pages={reader.resources.cachedPageIds.length}
      data-pdf-canvases={reader.resources.canvasCount}
      data-reader-lifecycle={reader.lifecycle}
      data-reader-navigation-request={navigationRequestId ?? "initial"}
      data-reader-resource-api={reader.resources.resourceApiAvailable ? "available" : "unavailable"}
      data-reader-save-state={annotationState.saveState}
      data-reader-status={reader.status}
      onFocusCapture={(event) => onFocusTarget(event.target)}
      ref={workspaceRef}
      role="region"
      style={{
        "--reader-navigation-width": `${uiSession.navigationSidebar.width}px`,
        "--reader-notes-width": `${uiSession.notesSidebar.width}px`,
      } as CSSProperties}
    >
      <div aria-atomic="true" aria-live="polite" className="reader-screen-reader-announcement">{announcement}</div>
      <header className="reader-toolbar" data-reader-focus-group="toolbar">
        <div className="reader-toolbar-group">
          <ControlHint content="切换导航侧栏"><button aria-label={sidebarOpen ? "隐藏导航侧栏" : "显示导航侧栏"} className={sidebarOpen ? "active" : ""} onClick={() => executeReaderCommand("reader.sidebar.toggleNavigation")} type="button"><ListTree aria-hidden="true" /></button></ControlHint>
          <span className="reader-toolbar-separator" />
          <ControlHint content="返回上一阅读位置" shortcut="Cmd/Ctrl+["><button aria-label="返回上一阅读位置" disabled={!reader.canNavigateBack} onClick={() => executeReaderCommand("reader.history.back")} type="button"><ChevronLeft aria-hidden="true" /></button></ControlHint>
          <ControlHint content="前进到下一阅读位置" shortcut="Cmd/Ctrl+]"><button aria-label="前进到下一阅读位置" disabled={!reader.canNavigateForward} onClick={() => executeReaderCommand("reader.history.forward")} type="button"><ChevronRight aria-hidden="true" /></button></ControlHint>
          <span className="reader-toolbar-separator" />
          <ControlHint content="撤销批注更改" shortcut="Cmd/Ctrl+Z"><button aria-label="撤销批注更改" disabled={annotationState.readOnly || !annotationState.canUndo} onClick={() => executeReaderCommand("annotation.undo")} type="button"><Undo2 /></button></ControlHint>
          <ControlHint content="重做批注更改" shortcut="Cmd/Ctrl+Shift+Z"><button aria-label="重做批注更改" disabled={annotationState.readOnly || !annotationState.canRedo} onClick={() => executeReaderCommand("annotation.redo")} type="button"><Redo2 /></button></ControlHint>
          <span className="reader-toolbar-separator" />
          <ControlHint content="缩小 PDF" shortcut="Cmd/Ctrl+Shift+−"><button aria-label="缩小" onClick={() => executeReaderCommand("reader.zoom.out")} type="button"><ZoomOut /></button></ControlHint>
          <ControlHint content="放大 PDF" shortcut="Cmd/Ctrl+Shift++"><button aria-label="放大" onClick={() => executeReaderCommand("reader.zoom.in")} type="button"><ZoomIn /></button></ControlHint>
          <ControlHint content="PDF 适合宽度" shortcut="Cmd/Ctrl+Shift+0"><button aria-label="适合宽度" onClick={() => executeReaderCommand("reader.zoom.fitWidth")} type="button"><Maximize2 /></button></ControlHint>
          <span className="reader-zoom-label">{reader.scalePercent}%</span>
        </div>
        <div className="reader-page-control">
          <PdfPageControls horizontal label="页码" inputRef={pageInputRef} pageIndex={pageNumber - 1} pageCount={pageCount}
            value={pageInput} onChange={setPageInput} onCommit={commitPageInput}
            onPrevious={() => executeReaderCommand("reader.page.previous")} onNext={() => executeReaderCommand("reader.page.next")} />
        </div>
        <div className="reader-toolbar-group reader-toolbar-end">
          <StructuredBlocksToggle enabled={structuredOverlayEnabled} preparing={structuredOverlayPreparing} onToggle={onToggleStructuredOverlay} />
          <ControlHint content={reader.status}><span aria-live="polite" className="reader-status">{reader.status}</span></ControlHint>
          <div className="reader-find-control">
            <ControlHint content="查找（⌘F）"><button ref={searchTrigger} aria-controls="reader-find-popover" aria-expanded={searchOpen} aria-label="在文档中查找" className={searchOpen ? "active" : ""} onClick={() => executeReaderCommand(searchOpen ? "reader.find.close" : "reader.find.open")} type="button"><Search /></button></ControlHint>
            {searchOpen && <Popover store={searchPopover} fixed modal={false} hideOnInteractOutside={false} autoFocusOnHide={false}
              initialFocus={searchInputRef} getAnchorRect={() => searchTrigger.current?.getBoundingClientRect() ?? null} gutter={8}
              onClose={() => executeReaderCommand("reader.find.close")}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing || !(event.metaKey || event.ctrlKey)) return;
                const key = event.key.toLowerCase();
                if (key !== "g" && key !== "f") return;
                event.preventDefault(); event.stopPropagation();
                if (key === "f") searchInputRef.current?.focus(); else runFind(event.shiftKey);
              }} data-reader-focus-group="popup" aria-label="文档查找" className="reader-search-popover" id="reader-find-popover" role="search">
              <div className="reader-search-row">
                <div className="reader-search-input" data-focus-shell>
                  <input aria-label="在文档中查找" autoComplete="off" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runFind(event.shiftKey); }} placeholder="在文档中查找" ref={searchInputRef} value={search} />
                </div>
                <div className="reader-search-navigation">
                  <button aria-label="上一个匹配项" disabled={search.trim().length === 0} onClick={() => executeReaderCommand("reader.find.previous")} type="button"><ChevronUp /></button>
                  <button aria-label="下一个匹配项" disabled={search.trim().length === 0} onClick={() => executeReaderCommand("reader.find.next")} type="button"><ChevronDown /></button>
                  <button aria-label="关闭查找" onClick={() => executeReaderCommand("reader.find.close")} type="button"><X /></button>
                </div>
              </div>
              <div className="reader-search-options">
                <label><input checked={searchHighlightAll} onChange={(event) => setSearchHighlightAll(event.target.checked)} type="checkbox" />全部高亮</label>
                <label><input checked={searchCaseSensitive} onChange={(event) => setSearchCaseSensitive(event.target.checked)} type="checkbox" />区分大小写</label>
                <label><input checked={searchEntireWord} onChange={(event) => setSearchEntireWord(event.target.checked)} type="checkbox" />全词匹配</label>
                {search.length > 0 && <span aria-live="polite">{searchMatches || "正在查找…"}</span>}
              </div>
            </Popover>}
          </div>
          <ControlHint content="切换笔记侧栏"><button aria-label={notesOpen ? "隐藏笔记侧栏" : "显示笔记侧栏"} className={notesOpen ? "active" : ""} onClick={() => executeReaderCommand("reader.sidebar.toggleNotes")} type="button"><PanelRight /></button></ControlHint>
        </div>
      </header>
      <div className={`reader-body${sidebarOpen ? " with-navigation" : ""}${notesOpen ? " with-notes" : ""}`}>
        {sidebarOpen && <aside className="reader-navigation" data-reader-focus-group="navigation-sidebar">
          <div aria-label="调整导航侧栏宽度" aria-orientation="vertical" className="reader-sidebar-resizer end" onPointerDown={(event) => startSidebarResize("navigation", event)} role="separator" tabIndex={0} />
          <div className="reader-sidebar-tabs" role="tablist" aria-label="文档导航">
            <ControlHint content="缩略图"><button aria-label="缩略图" aria-selected={sidebarView === "thumbnails"} onClick={() => executeReaderCommand("reader.sidebar.showThumbnails")} role="tab" type="button"><FileText /></button></ControlHint>
            <ControlHint content="目录"><button aria-label="目录" aria-selected={sidebarView === "outline"} disabled={reader.outline.length === 0} onClick={() => executeReaderCommand("reader.sidebar.showOutline")} role="tab" type="button"><List /></button></ControlHint>
          </div>
          {sidebarView === "outline" && <nav aria-label="PDF 目录">{reader.outline.map((entry, index) => <button key={`${entry.pageNumber}-${index}`} onClick={() => executeReaderCommand("reader.navigate", { pageIndex: entry.pageNumber - 1 })} type="button">{entry.title}</button>)}</nav>}
          {sidebarView === "thumbnails" && reader.pageCount > 0 && <PdfThumbnailList currentPageNumber={pageNumber} onSelectPage={(pageIndex) => executeReaderCommand("reader.navigate", { pageIndex })} renderingEnabled={active} revisionForPage={(pageIndex) => thumbnailRevisionByPage.get(pageIndex) ?? ""} source={controller} />}
        </aside>}
        <main className="pdf-stage" onPointerDownCapture={(event) => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".saved-highlight, .saved-position-note, .word-explanation-marker"))) return;
          if (selectedReadingId !== undefined) annotationController.select(undefined);
        }}>
          <PdfView controller={controller.viewController} containerRef={viewerContainerRef} viewerRef={viewerElementRef}
            ready={reader.ready} active={active} characterSelectionAvailable={reader.characterSelectionAvailable}
            pageHosts={reader.pageHosts} documentVersion={documentVersion}
            onSelectionStart={() => { annotationController.select(undefined); startSelection(); }} onSelectionComplete={completeSelection}
            onPageContextMenu={(pageIndex, rect) => { annotationController.select(undefined); completeSelection(positionNoteSelection(pageIndex, rect)); }}
            onPointerLeave={onStructuredOverlayPointerLeave} onPointerMove={onStructuredOverlayPointerMove} />
        </main>
        <aside hidden={!notesOpen} className="reader-notes" data-reader-focus-group="notes-sidebar">
          <div aria-label="调整笔记侧栏宽度" aria-orientation="vertical" className="reader-sidebar-resizer start" onPointerDown={(event) => startSidebarResize("notes", event)} role="separator" tabIndex={0} />
          <ReaderSidebarPages reading={readingPanel} notes={<>
          <LiteratureNotes key={item.id} item={item} active={active}
            heading={<strong>高亮与笔记<span>{annotations.length}</span></strong>}
            feedback={<AnnotationSaveFeedback state={annotationState.saveState} error={annotationState.error} onRetry={() => void annotationController.retry()} />} />
          <div className="annotation-list">
            {orderedReadingAnnotations(annotations).map((annotation) => <button aria-pressed={annotation.id === selectedReadingId}
              className={annotation.id === selectedReadingId ? "selected" : ""} key={annotation.id}
              style={{ "--annotation-color": annotation.color } as CSSProperties}
              onClick={() => executeReaderCommand("annotation.select", { id: annotation.id, origin: "sidebar", navigate: true })}
              onDoubleClick={() => executeReaderCommand("annotation.select", { id: annotation.id, origin: "sidebar", openEditor: true })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  executeReaderCommand("annotation.select", { id: annotation.id, origin: "sidebar", navigate: true, openEditor: true });
                }
              }} type="button"><span>第 {annotation.source.pageLabel ?? annotation.source.pageIndex + 1} 页</span><q>{annotation.source.quoteExact || (isPositionNote(annotation) ? "位置笔记" : "页面笔记")}</q>{annotation.body.length > 0 && <small>{annotation.body}</small>}</button>)}
          </div>

          </>} />
        </aside>
      </div>
      {pageHosts.map((host) => createPortal(<>
        {selectionSessions.filter((session) => !session.active).flatMap((session) => session.pending.segments
          .filter((segment) => segment.pageIndex === host.pageIndex).flatMap((segment) => segment.rects.map((rect, index) =>
            <span aria-hidden="true" className="draft-selection-highlight" key={`${session.id}-${index}`}
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)))}
        {annotations.filter(annotation => !isPositionNote(annotation)).flatMap((annotation) => readingNoteSegments(annotation.source)
          .filter((segment) => segment.pageIndex === host.pageIndex).flatMap((segment) => segment.rects.map((rect, index) =>
            <button aria-label={annotation.body || annotation.source.quoteExact} aria-pressed={annotation.id === selectedReadingId}
              className="saved-highlight"
              data-pdf-text-selection="true"
              key={`${annotation.id}-${index}`}
              onClick={(event) => {
                if (event.metaKey && event.button === 0) {
                  executeReaderCommand("annotation.select", { id: annotation.id, origin: "page", openEditor: true });
                  return;
                }
                if (event.detail >= 2 || event.defaultPrevented) return;
                if (executeReaderCommand("annotation.select", { id: annotation.id, origin: "page" })) openSavedHighlight(annotation, host.pageIndex, rect);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  executeReaderCommand("annotation.select", { id: annotation.id, origin: "page", openEditor: true });
                }
              }}
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, background: annotation.color }} type="button" />)))}
      </>, host.element))}
      {pageHosts.map(host => createPortal(<>
        {annotations.filter(annotation => isPositionNote(annotation) && annotation.source.pageIndex === host.pageIndex
          && annotation.source.state === "exact" && annotation.source.contentSha256 === attachment.contentSha256).map(annotation => {
          return <PositionNoteMarker key={annotation.id} note={annotation} selected={annotation.id === selectedReadingId}
            getPageBounds={() => controller.clientRectForPageRect(host.pageIndex, { x: 0, y: 0, width: 1, height: 1 })}
            onSelect={() => executeReaderCommand("annotation.select", { id: annotation.id, origin: "page" })}
            onOpen={() => executeReaderCommand("annotation.select", { id: annotation.id, origin: "page", openEditor: true })}
            onContextMenu={() => { const rect = annotation.source.rects[0]; if (rect) openSavedHighlight(annotation, host.pageIndex, rect); }}
            onMove={async position => {
              if (!annotationController.update(annotation.id, { position })) throw new Error("当前位置笔记无法移动");
              await annotationController.flush(annotation.id);
              const state = annotationController.getSnapshot();
              if (state.saveState === "failed" || state.saveState === "conflict") throw new Error(state.error ?? "便签位置未保存，请重试");
            }} />;
        })}
      </>, host.interactionElement ?? host.element))}
      {selectionDrafts.length > 0 && <div aria-label="选区草稿" className="selection-draft-tray"><strong>{selectionDrafts.length} 个未完成草稿</strong>{selectionDrafts.map((session) => <div key={session.id}><ControlHint content={session.pending.text}><button onClick={() => activateSelectionDraft(session.id)} type="button">第 {session.pending.pageLabel}{session.pending.segments.length > 1 ? `–${session.pending.segments.at(-1)?.pageLabel}` : ""} 页 · {session.pending.text.slice(0, 24)}</button></ControlHint><button aria-label="丢弃选区草稿" onClick={() => discardSelection(session.id)} type="button"><X /></button></div>)}</div>}
      <WordExplanationMarkers key={`${attachment.id}:${attachment.contentSha256}`} records={words.records} reader={reader} controller={controller}
        onDelete={words.remove}
        boundaryRef={viewerContainerRef} workspaceRef={workspaceRef} active={active}
        onWriteNote={pending => saveSelection({ id: `word-note-${crypto.randomUUID()}`, active: true, dirty: false, pending }, "", { openEditor: false })} />
      {selectionSessions.map((session) => <PdfSelectionPopover active={session.active} annotation={session.actionDraft?.mode === "annotation"} {...(session.pending.text === "" ? { preferredWidth: session.annotationId === undefined ? 68 : 38, centerOnAnchor: true, anchorControlCenter: session.annotationId === undefined ? 25 : 19 } : {})} compact={(session.actionDraft?.mode ?? "actions") === "actions"} anchorElement={pageHosts.find((host) => host.pageIndex === session.pending.popupPageIndex)?.element} boundaryRef={viewerContainerRef} getAnchorClientRect={() => controller.clientRectForPageRect(session.pending.popupPageIndex, session.pending.popupRect)} key={session.id} onRestoreFocus={() => controller.focus()} workspaceRef={workspaceRef}>
        <div onMouseUp={(event) => event.stopPropagation()}>
          {session.active && (session.actionDraft?.mode ?? "actions") !== "actions" && session.actionDraft?.mode !== "annotation" && <ControlHint content="关闭选区操作" shortcut="Esc"><button aria-label="关闭选区操作" className="reader-selection-close" onClick={() => executeReaderCommand("reader.popup.cancel")} type="button"><X /></button></ControlHint>}
          <PdfSelectionActions active={session.active} {...(() => { const existing = wordExplanationForSelection(words.records, session.pending.segments); return existing ? { existingWordExplanation: existing.explanation } : {}; })()}
            onDeleteWordExplanation={async () => { const existing = wordExplanationForSelection(words.records, session.pending.segments); if (existing) await words.remove(existing); }}
            onWordExplanation={result => words.save(session.pending, result)} onDeleteNote={async () => {
            if (!session.annotationId || !annotationController.setStatus(session.annotationId, "trashed")) throw new Error("当前便签无法删除");
            await annotationController.flush(session.annotationId);
            const state = annotationController.getSnapshot();
            if (state.saveState === "failed" || state.saveState === "conflict") throw new Error(state.error ?? "便签删除失败，请重试");
            discardSelection(session.id);
          }} positionOnly={session.pending.text === ""} {...(session.actionDraft === undefined ? {} : { initialDraft: session.actionDraft })} editingNote={session.annotationId !== undefined} {...(session.highlightColor === undefined ? {} : { highlightColor: session.highlightColor })} onClose={() => executeReaderCommand("reader.popup.cancel")} knowledgeGateway={knowledgeGateway} onCaptureConcept={(value) => captureConcept(session, value)} onCaptureReference={(value) => captureReference(session, value)} onExplain={async () => { const input = await prepareSelectionExplanationInput(item, attachment, session.pending, getDoclingParserGateway(), controller); await sendChatMessage(input.text, [{kind:"paper",resourceId:item.id,attachmentId:attachment.id}], {mode:"draft", evidence:input.evidence}); discardSelection(session.id); }} onAnnotate={(comment, intent) => annotateSelection(session, comment, intent)} onEnsureAiAnchor={() => ensureAiAnchor(session)} onAiRunStarted={(run) => aiRunStarted(session.id, run)} onWriteNote={(color) => saveSelection(session, session.actionDraft?.note ?? "", { openEditor: session.pending.text !== "", ...(color === undefined ? {} : { color }) })} onHighlight={(color) => saveSelection(session, "", { color })} onDraftChange={(draft, dirty) => updateSelectionDraftState(session.id, draft, dirty)} paperId={item.id} pending={session.pending} />
        </div>
      </PdfSelectionPopover>)}
    </div>
  );
}
