import type { RefObject } from "react";
import type { ReadingNoteBlock } from "@research-assistant/core/notes";
import {
  readerCancellationCommand,
  type ReaderCommand,
  type ReaderCommandContext,
  type ReaderFocusOwner,
  type ReaderTool,
  type ReaderUiSessionState,
} from "@research-assistant/core/reader";

import { getReaderCloseCoordinator } from "@research-assistant/workbench-sdk/workbench";
import { readerSessionId } from "../session/ReaderSessionRegistry";
import type { ReaderSessionController, ReaderSessionSnapshot } from "../session/ReaderSessionController";
import type { AnnotationController, AnnotationControllerSnapshot } from "../annotations/AnnotationController";
import type { ReaderFocusController } from "../focus/ReaderFocusController";
import { isEditableTarget, readingNoteLocation } from "../readerWorkspaceModel";
import { dispatchReaderCommand, type ReaderCommandPayload } from "./ReaderCommandDispatcher";

const SCALE_STEP = 0.15;

interface ReaderCommandBindingOptions {
  readonly platform: ReaderCommandContext["platform"];
  readonly focusController: ReaderFocusController;
  readonly focusOwner: ReaderFocusOwner | undefined;
  readonly activeSelectionSessionId: string | undefined;
  readonly searchOpen: boolean;
  readonly selectedReadingId: string | undefined;
  readonly selectedReadingNote: ReadingNoteBlock | undefined;
  readonly reader: ReaderSessionSnapshot;
  readonly annotationState: AnnotationControllerSnapshot;
  readonly annotationController: AnnotationController;
  readonly controller: ReaderSessionController;
  readonly hasClosableReaderTab: boolean;
  readonly tool: ReaderTool;
  readonly attachmentId: string;
  readonly pageNumber: number;
  readonly pageInputRef: RefObject<HTMLInputElement | null>;
  readonly closeSelection: (sessionId: string) => void;
  readonly openFind: () => void;
  readonly closeFind: () => void;
  readonly runFind: (findPrevious?: boolean, type?: "find" | "again") => void;
  readonly navigateToPage: (pageIndex: number) => void;
  readonly changeScale: (difference: number) => void;
  readonly fitToWidth: () => void;
  readonly navigateHistory: (difference: -1 | 1) => void;
  readonly updateUiSession: (update: (current: ReaderUiSessionState) => ReaderUiSessionState) => void;
  readonly setTool: (tool: ReaderTool) => void;
  readonly savePageNote: () => Promise<void>;
  readonly setAnnouncement: (message: string) => void;
}

export type ExecuteReaderCommand = (
  command: ReaderCommand,
  payload?: ReaderCommandPayload,
  target?: EventTarget | null,
) => boolean;

export function createReaderCommandExecutor(options: ReaderCommandBindingOptions): ExecuteReaderCommand {
  const commandContext = (target?: EventTarget | null): ReaderCommandContext => {
    const resolvedFocusOwner = options.focusController.ownerForTarget(target ?? null) ?? options.focusOwner;
    return {
      platform: options.platform,
      activeLayer: options.activeSelectionSessionId !== undefined
        ? "popup"
        : options.searchOpen ? "find" : options.selectedReadingId === undefined ? "reader" : "annotation-editor",
      lifecycle: options.reader.lifecycle,
      ...(resolvedFocusOwner === undefined ? {} : { focusOwner: resolvedFocusOwner }),
      editable: isEditableTarget(target ?? null),
      popupOpen: options.activeSelectionSessionId !== undefined,
      findOpen: options.searchOpen,
      hasSelection: options.controller.viewController.getSnapshot().selection !== undefined,
      selectedAnnotationCount: options.selectedReadingId === undefined ? 0 : 1,
      readOnly: options.annotationState.readOnly,
      canNavigateBack: options.reader.canNavigateBack,
      canNavigateForward: options.reader.canNavigateForward,
      canUndoAnnotation: options.annotationState.canUndo,
      canRedoAnnotation: options.annotationState.canRedo,
      hasClosableReaderTab: options.hasClosableReaderTab,
      tool: options.tool,
    };
  };

  const executeReaderCommand: ExecuteReaderCommand = (command, payload, target) => {
    const context = commandContext(target);
    if (command === "reader.cancel") {
      const cancellation = readerCancellationCommand(context);
      return cancellation === undefined ? false : executeReaderCommand(cancellation, undefined, target);
    }
    return dispatchReaderCommand(command, context, {
      "reader.popup.cancel": () => {
        options.controller.viewController.clearSelection();
        if (options.activeSelectionSessionId !== undefined) options.closeSelection(options.activeSelectionSessionId);
      },
      "reader.selection.cancel": () => {
        options.controller.viewController.clearSelection();
        if (options.activeSelectionSessionId !== undefined) options.closeSelection(options.activeSelectionSessionId);
      },
      "reader.find.open": options.openFind,
      "reader.find.close": options.closeFind,
      "reader.find.next": () => options.runFind(false),
      "reader.find.previous": () => options.runFind(true),
      "reader.page.focusInput": () => options.pageInputRef.current?.focus(),
      "reader.page.previous": () => options.navigateToPage(options.pageNumber - 2),
      "reader.page.next": () => options.navigateToPage(options.pageNumber),
      "reader.navigate": (value) => {
        const pageIndex = value?.pageIndex;
        if (typeof pageIndex === "number") options.navigateToPage(pageIndex);
      },
      "reader.zoom.in": () => options.changeScale(SCALE_STEP),
      "reader.zoom.out": () => options.changeScale(-SCALE_STEP),
      "reader.zoom.fitWidth": options.fitToWidth,
      "reader.zoom.fitPage": () => options.controller.navigate({ pageIndex: options.reader.pageIndex, scale: { kind: "page-fit" }, history: "transient" }),
      "reader.history.back": () => options.navigateHistory(-1),
      "reader.history.forward": () => options.navigateHistory(1),
      "reader.sidebar.toggleNavigation": () => options.updateUiSession((current) => ({ ...current, navigationSidebar: { ...current.navigationSidebar, open: !current.navigationSidebar.open } })),
      "reader.sidebar.toggleNotes": () => options.updateUiSession((current) => ({ ...current, notesSidebar: { ...current.notesSidebar, open: !current.notesSidebar.open } })),
      "reader.sidebar.showThumbnails": () => options.updateUiSession((current) => ({ ...current, navigationSidebar: { ...current.navigationSidebar, view: "thumbnails" } })),
      "reader.sidebar.showOutline": () => options.updateUiSession((current) => ({ ...current, navigationSidebar: { ...current.navigationSidebar, view: "outline" } })),
      "reader.annotation.clearSelection": () => options.annotationController.select(undefined),
      "reader.tool.reset": () => options.setTool("select"),
      "reader.view.focus": () => {
        if (!options.focusController.focus("view")) options.controller.focus();
      },
      "annotation.createPageNote": () => options.savePageNote(),
      "annotation.select": (value) => {
        const id = value?.id;
        if (typeof id !== "string") return;
        const annotation = options.annotationState.annotations.find((candidate) => candidate.id === id);
        if (annotation === undefined) return;
        const origin = value?.origin === "sidebar" ? "sidebar" : "page";
        options.annotationController.select(annotation.id, origin);
        if (value?.openEditor === true) {
          if (options.activeSelectionSessionId !== undefined) options.closeSelection(options.activeSelectionSessionId);
          window.dispatchEvent(new CustomEvent("research-assistant:open-reading-note", { detail: annotation.id }));
        }
        if (value?.navigate === true && options.annotationController.commandAvailability(annotation.id).canNavigate) {
          options.controller.navigate({ ...readingNoteLocation(annotation.source), annotationId: annotation.id });
        }
      },
      "annotation.trash": () => {
        const note = options.selectedReadingNote;
        if (note !== undefined && options.annotationController.setStatus(note.id, "trashed")) {
          if (options.activeSelectionSessionId !== undefined) options.closeSelection(options.activeSelectionSessionId);
          options.setAnnouncement("批注已移入回收站，可立即恢复");
        }
      },
      "annotation.restore": () => {
        const note = options.selectedReadingNote;
        if (note !== undefined && options.annotationController.setStatus(note.id, "active")) {
          options.setAnnouncement("批注已恢复");
        }
      },
      "annotation.undo": () => {
        if (options.activeSelectionSessionId !== undefined && options.selectedReadingId !== undefined) options.closeSelection(options.activeSelectionSessionId);
        return options.annotationController.undo();
      },
      "annotation.redo": () => {
        if (options.activeSelectionSessionId !== undefined && options.selectedReadingId !== undefined) options.closeSelection(options.activeSelectionSessionId);
        return options.annotationController.redo();
      },
      "reader.tab.close": () => getReaderCloseCoordinator().close(readerSessionId(options.attachmentId)),
    }, payload);
  };
  return executeReaderCommand;
}
