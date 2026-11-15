import { PdfViewController } from "@research-assistant/workbench-sdk/pdf";
import type { PdfDocumentIdentity } from "@research-assistant/core/pdf-view";
import {
  ReaderNavigationHistory,
  normalizeReaderLocation,
  nextReaderLifecycleState,
  type ReaderLifecycleState,
  type ReaderLocation,
  type ReaderViewStateV2,
} from "@research-assistant/core/reader";
import type { PageText } from "@research-assistant/core/literature";
import type { SourceRect } from "@research-assistant/core/literature";

import type { PdfThumbnailSource } from "../../../components/PdfPageThumbnail";
import type { PdfPageCharacterStore } from "@research-assistant/workbench-sdk/pdf";
import type {
  PdfFindOptions,
  PdfOutlineEntry,
  PdfPageHost,
  PdfResourceSnapshot,
  PdfViewAdapter,
  PdfViewAdapterCallbacks,
} from "@research-assistant/workbench-sdk/pdf";
import { PDF_BACKGROUND_SUSPEND_MS } from "@research-assistant/workbench-sdk/pdf";

export interface ReaderSessionSnapshot {
  readonly ready: boolean;
  readonly lifecycle: ReaderLifecycleState;
  readonly pageCount: number;
  readonly pageIndex: number;
  readonly pageLabels: readonly string[];
  readonly scalePercent: number;
  readonly status: string;
  readonly outline: readonly PdfOutlineEntry[];
  readonly pageHosts: readonly PdfPageHost[];
  readonly findCurrent: number;
  readonly findTotal: number;
  readonly characterSelectionAvailable: boolean;
  readonly resources: PdfResourceSnapshot;
  readonly canNavigateBack: boolean;
  readonly canNavigateForward: boolean;
}

export interface ReaderSessionOpenInput {
  readonly identity?: PdfDocumentIdentity;
  readonly bytes: Uint8Array;
  readonly container: HTMLDivElement;
  readonly viewerElement: HTMLDivElement;
  readonly active: boolean;
  readonly initialPageIndex?: number;
  readonly restoredViewState?: ReaderViewStateV2;
}

export interface ReaderSessionControllerOptions {
  readonly adapter: PdfViewAdapter;
  readonly saveReadingState: (viewState: ReaderViewStateV2) => Promise<void>;
  readonly saveDebounceMs?: number;
  readonly suspendDelayMs?: number;
}

interface PendingReadingState {
  readonly viewState: ReaderViewStateV2;
}

const INITIAL_SNAPSHOT: ReaderSessionSnapshot = {
  ready: false,
  lifecycle: "active",
  pageCount: 0,
  pageIndex: 0,
  pageLabels: [],
  scalePercent: 115,
  status: "正在载入 PDF…",
  outline: [],
  pageHosts: [],
  findCurrent: 0,
  findTotal: 0,
  characterSelectionAvailable: true,
  resources: {
    suspended: false,
    cachedPageIds: [],
    canvasCount: 0,
    resourceApiAvailable: true,
  },
  canNavigateBack: false,
  canNavigateForward: false,
};

export class ReaderSessionController implements PdfThumbnailSource {
  readonly #adapter: PdfViewAdapter;
  readonly #saveReadingState: (viewState: ReaderViewStateV2) => Promise<void>;
  readonly #saveDebounceMs: number;
  readonly #view: PdfViewController;
  readonly #history = new ReaderNavigationHistory();
  readonly #listeners = new Set<() => void>();
  #snapshot: ReaderSessionSnapshot = INITIAL_SNAPSHOT;
  #saveTimer: number | undefined;
  #pendingReadingState: PendingReadingState | undefined;
  #closed = false;
  #lifecycleGeneration = 0;
  #nextViewHistoryMode: "hard" | "transient" = "transient";

  constructor(options: ReaderSessionControllerOptions) {
    this.#adapter = options.adapter;
    this.#saveReadingState = options.saveReadingState;
    this.#saveDebounceMs = options.saveDebounceMs ?? 350;
    this.#view = new PdfViewController(options.adapter, options.suspendDelayMs ?? PDF_BACKGROUND_SUSPEND_MS);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): ReaderSessionSnapshot => this.#snapshot;

  get viewController(): PdfViewController { return this.#view; }

  get characterStore(): PdfPageCharacterStore {
    return this.#adapter.characterStore;
  }

  get pageCount(): number {
    return this.#snapshot.pageCount;
  }

  getRecoveryReadingState(): ReaderViewStateV2 | undefined {
    return this.#pendingReadingState?.viewState;
  }

  prepareOpen(active: boolean, initialPageIndex = 0): void {
    this.#lifecycleGeneration += 1;
    this.#closed = false;
    this.#history.clear();
    this.#update({
      ...INITIAL_SNAPSHOT,
      lifecycle: active ? "active" : "hidden",
      pageIndex: Math.max(0, Math.trunc(initialPageIndex)),
    });
  }

  async open(input: ReaderSessionOpenInput): Promise<void> {
    this.prepareOpen(input.active, input.initialPageIndex ?? input.restoredViewState?.pageIndex ?? 0);
    const restored = input.restoredViewState;
    // An explicit source jump owns the target position, while keeping the saved zoom.
    const initialView = restored === undefined ? undefined : {
      pageIndex: input.initialPageIndex ?? restored.pageIndex, scale: restored.scale,
      ...(input.initialPageIndex !== undefined || restored.top === undefined ? {} : { top: restored.top }),
      ...(input.initialPageIndex !== undefined || restored.left === undefined ? {} : { left: restored.left }),
      scrollMode: "vertical" as const, spreadMode: "none" as const,
    };
    await this.#view.open({
      source: { key: input.identity?.key ?? "reader-session", revision: input.identity?.revision ?? "initial", bytes: input.bytes },
      container: input.container, viewerElement: input.viewerElement, active: input.active,
      initialPageIndex: input.initialPageIndex ?? input.restoredViewState?.pageIndex ?? 0,
      ...(initialView === undefined ? {} : { initialView }),
      observer: this.#adapterCallbacks(),
    });
    if (!input.active) this.#deactivate();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    const generation = ++this.#lifecycleGeneration;
    this.#closed = true;
    await this.flushReadingState();
    if (generation !== this.#lifecycleGeneration) return;
    this.#view.close();
    this.#history.clear();
    this.#update({
      ...this.#snapshot,
      ready: false,
      lifecycle: "disposed",
      pageHosts: [],
      canNavigateBack: false,
      canNavigateForward: false,
    });
  }

  setActive(active: boolean): void {
    if (active) {
        this.#view.setActive(true);
      this.#update({
        ...this.#snapshot,
        lifecycle: nextReaderLifecycleState(this.#snapshot.lifecycle, "activate"),
      });
      return;
    }
    this.#deactivate();
  }

  trimMemory(): void {
    this.#adapter.trimMemory();
    if (this.#snapshot.lifecycle !== "active") {
      this.#update({
        ...this.#snapshot,
        lifecycle: nextReaderLifecycleState(this.#snapshot.lifecycle, "trim"),
      });
    }
  }

  setStatus(status: string): void {
    this.#update({ ...this.#snapshot, status });
  }

  resolveQuoteSelection(pageIndex: number, quote: string, prefix: string, suffix: string): ReturnType<PdfViewAdapter["resolveQuoteSelection"]> {
    return this.#adapter.resolveQuoteSelection(pageIndex, quote, prefix, suffix);
  }
  resolveLineSelection(pageIndex: number, range: import("@research-assistant/core/source").SourceLineRange): ReturnType<PdfViewAdapter["resolveLineSelection"]> {
    return this.#adapter.resolveLineSelection(pageIndex, range);
  }

  navigate(input: ReaderLocation): boolean {
    const location = normalizeReaderLocation(input);
    if (location === undefined) return false;
    const pageIndex = this.#pageIndexForLocation(location);
    if (pageIndex === undefined && location.destination === undefined) return false;
    const target = pageIndex === undefined ? undefined : Math.max(0, Math.min(this.#snapshot.pageCount - 1, pageIndex));
    const navigated = this.#adapter.navigate(location, target);
    if (!navigated) return false;
    this.#history.save({ ...location, ...(target === undefined ? {} : { pageIndex: target }) }, location.history ?? "hard");
    this.#nextViewHistoryMode = "transient";
    this.#adapter.focus();
    this.#syncHistoryAvailability();
    return true;
  }

  navigateBack(): boolean {
    const location = this.#history.navigateBack();
    if (location === undefined) return false;
    const navigated = this.#navigateWithoutHistory(location);
    this.#syncHistoryAvailability();
    return navigated;
  }

  navigateForward(): boolean {
    const location = this.#history.navigateForward();
    if (location === undefined) return false;
    const navigated = this.#navigateWithoutHistory(location);
    this.#syncHistoryAvailability();
    return navigated;
  }

  find(options: PdfFindOptions): void {
    this.#nextViewHistoryMode = "hard";
    this.#adapter.find(options);
  }

  closeFind(source?: object): void {
    this.#adapter.closeFind(source);
  }

  changeScale(difference: number, minimum = 0.5, maximum = 3): void {
    this.#adapter.changeScale(difference, minimum, maximum);
  }

  fitToWidth(): void {
    this.#adapter.fitToWidth();
  }

  updateScaleAt(scaleFactor: number, origin: readonly [number, number]): void {
    this.#adapter.updateScaleAt(scaleFactor, origin);
  }

  focus(): void {
    this.#adapter.focus();
  }

  clientRectForPageRect(pageIndex: number, rect: SourceRect): DOMRect | undefined {
    return this.#adapter.clientRectForPageRect(pageIndex, rect);
  }

  extractPageTexts(signal?: AbortSignal): Promise<readonly PageText[]> {
    return this.#adapter.extractPageTexts(signal);
  }

  renderThumbnail(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.#adapter.renderThumbnail(pageNumber, canvas, signal);
  }

  renderPageRegionPng(
    pageIndex: number,
    rect: SourceRect,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.#adapter.renderPageRegionPng(pageIndex, rect, signal);
  }

  async flushReadingState(): Promise<boolean> {
    if (this.#saveTimer !== undefined) window.clearTimeout(this.#saveTimer);
    this.#saveTimer = undefined;
    const pending = this.#pendingReadingState;
    this.#pendingReadingState = undefined;
    if (pending === undefined) return true;
    try {
      await this.#saveReadingState(pending.viewState);
      return true;
    } catch (reason: unknown) {
      this.#pendingReadingState = pending;
      this.setStatus(`保存阅读位置失败：${reason instanceof Error ? reason.message : String(reason)}`);
      return false;
    }
  }

  #adapterCallbacks(): PdfViewAdapterCallbacks {
    return {
      onDocumentReady: (pageCount) => { this.#update({ ...this.#snapshot, pageCount }); },
      onPageLabelsChange: (pageLabels) => { this.#update({ ...this.#snapshot, pageLabels }); },
      onNavigate: (location) => { this.navigate(location); },
      onReady: (event) => {
        this.#history.clear();
        this.#history.save({
          pageIndex: event.viewState.pageIndex,
          scale: event.viewState.scale,
          ...(event.viewState.top === undefined ? {} : { top: event.viewState.top }),
          ...(event.viewState.left === undefined ? {} : { left: event.viewState.left }),
        }, "hard");
        const history = this.#history.snapshot();
        this.#update({
          ...this.#snapshot,
          ready: true,
          pageCount: event.pageCount,
          pageIndex: event.pageIndex,
          pageLabels: event.pageLabels,
          scalePercent: Math.round(event.scale * 100),
          canNavigateBack: history.canNavigateBack,
          canNavigateForward: history.canNavigateForward,
        });
      },
      onPageChange: (pageIndex) => {
        this.#update({ ...this.#snapshot, pageIndex: this.#clampPageIndex(pageIndex) });
      },
      onScaleChange: (scale) => {
        this.#update({ ...this.#snapshot, scalePercent: Math.round(scale * 100) });
      },
      onViewAreaChange: (event) => {
        const pageIndex = this.#clampPageIndex(event.viewState.pageIndex);
        const viewState = { ...event.viewState, pageIndex, schemaVersion: 2 as const };
        this.#pendingReadingState = { viewState };
        this.#update({ ...this.#snapshot, pageIndex });
        if (this.#saveTimer !== undefined) window.clearTimeout(this.#saveTimer);
        this.#saveTimer = window.setTimeout(() => void this.flushReadingState(), this.#saveDebounceMs);
        this.#history.save({
          pageIndex,
          scale: viewState.scale,
          ...(viewState.top === undefined ? {} : { top: viewState.top }),
          ...(viewState.left === undefined ? {} : { left: viewState.left }),
        }, this.#nextViewHistoryMode);
        this.#nextViewHistoryMode = "transient";
        this.#syncHistoryAvailability();
      },
      onPageHostsChange: (pageHosts) => {
        if (
          this.#snapshot.pageHosts.length === pageHosts.length
          && this.#snapshot.pageHosts.every((host, index) => host.pageIndex === pageHosts[index]?.pageIndex
            && host.element === pageHosts[index]?.element)
        ) {
          return;
        }
        this.#update({ ...this.#snapshot, pageHosts });
      },
      onFindMatchesChange: (findCurrent, findTotal) => {
        this.#update({ ...this.#snapshot, findCurrent, findTotal });
      },
      onOutlineChange: (outline) => {
        this.#update({ ...this.#snapshot, outline });
      },
      onCharacterSelectionAvailabilityChange: (characterSelectionAvailable) => {
        this.#update({ ...this.#snapshot, characterSelectionAvailable });
      },
      onResourceChange: (resources) => {
        this.#update({ ...this.#snapshot, resources, ...(resources.suspended ? { lifecycle: nextReaderLifecycleState(this.#snapshot.lifecycle, "suspend") } : {}) });
      },
      onStatus: (status) => this.setStatus(status),
    };
  }

  #clampPageIndex(pageIndex: number): number {
    if (!Number.isFinite(pageIndex)) return 0;
    if (this.#snapshot.pageCount <= 0) return Math.max(0, Math.trunc(pageIndex));
    return Math.max(0, Math.min(this.#snapshot.pageCount - 1, Math.trunc(pageIndex)));
  }

  #pageIndexForLocation(location: ReaderLocation): number | undefined {
    if (location.pageIndex !== undefined) return location.pageIndex;
    const positionPageIndex = location.position?.segments[0]?.pageIndex;
    if (positionPageIndex !== undefined) return positionPageIndex;
    if (location.pageLabel !== undefined) {
      const label = location.pageLabel.toLocaleLowerCase();
      const index = this.#snapshot.pageLabels.findIndex((candidate) => candidate.toLocaleLowerCase() === label);
      return index >= 0 ? index : undefined;
    }
    return undefined;
  }

  #navigateWithoutHistory(location: ReaderLocation): boolean {
    const pageIndex = this.#pageIndexForLocation(location);
    if (pageIndex === undefined && location.destination === undefined) return false;
    const target = pageIndex === undefined ? undefined : Math.max(0, Math.min(this.#snapshot.pageCount - 1, pageIndex));
    if (!this.#adapter.navigate(location, target)) return false;
    this.#adapter.focus();
    return true;
  }

  #syncHistoryAvailability(): void {
    const history = this.#history.snapshot();
    if (
      history.canNavigateBack === this.#snapshot.canNavigateBack
      && history.canNavigateForward === this.#snapshot.canNavigateForward
    ) {
      return;
    }
    this.#update({
      ...this.#snapshot,
      canNavigateBack: history.canNavigateBack,
      canNavigateForward: history.canNavigateForward,
    });
  }

  #deactivate(): void {
    const hidden = nextReaderLifecycleState(this.#snapshot.lifecycle, "hide");
    this.#view.setActive(false);
    this.#update({
      ...this.#snapshot,
      lifecycle: nextReaderLifecycleState(hidden, "trim"),
    });
    void this.flushReadingState();
  }

  #update(snapshot: ReaderSessionSnapshot): void {
    if (this.#closed && snapshot.lifecycle !== "disposed") return;
    this.#snapshot = snapshot;
    this.#listeners.forEach((listener) => listener());
  }
}
