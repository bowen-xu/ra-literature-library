import type { NoteAnnotationGateway } from "@research-assistant/workbench-sdk/note-resources";
import { stageLegacyAnnotationDocument } from "@research-assistant/workbench-sdk/literature-notes";
import type {
  NoteBlockId,
  NoteLifecycleStatus,
  ReadingNoteBlock,
  ReadingNoteDraft,
} from "@research-assistant/core/notes";
import { NotesGatewayError } from "@research-assistant/data/notes";
import { isPositionReadingNote, readingNoteSourceAt } from "@research-assistant/core/notes";
import type { SourceRect } from "@research-assistant/core/literature";

export type AnnotationSaveState = "saved" | "dirty" | "saving" | "failed" | "conflict";
export type AnnotationSelectionOrigin = "page" | "sidebar";

export interface AnnotationSelection {
  readonly id: NoteBlockId;
  readonly origin: AnnotationSelectionOrigin;
}

export interface AnnotationControllerSnapshot {
  readonly annotations: readonly ReadingNoteBlock[];
  readonly selected: AnnotationSelection | undefined;
  readonly dirtyIds: ReadonlySet<NoteBlockId>;
  readonly saveState: AnnotationSaveState;
  readonly error: string | undefined;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly readOnly: boolean;
}

export interface AnnotationRecoveryDraft {
  readonly id: NoteBlockId;
  readonly baseRevision: number;
  /** Read-only decoder support for pre-migration recovery envelopes. */
  readonly body?: string;
  readonly color: string;
  readonly position?: SourceRect;
  readonly status: Extract<NoteLifecycleStatus, "active" | "trashed">;
}

export interface AnnotationRecoveryResult {
  readonly restored: number;
  readonly conflicts: number;
  readonly missing: number;
  readonly missingDrafts: readonly AnnotationRecoveryDraft[];
  readonly documentDrafts?: number;
}

interface PendingMutation {
  readonly base: ReadingNoteBlock;
  readonly optimistic: ReadingNoteBlock;
  readonly kind: "update" | "status";
}

type AnnotationMetadata = Pick<ReadingNoteBlock, "id" | "color" | "status"> & { readonly position?: SourceRect };
function metadata(note: ReadingNoteBlock): AnnotationMetadata { return { id: note.id, color: note.color, status: note.status,
  ...(isPositionReadingNote(note) ? { position: note.source.rects[0] } : {}) }; }
function withMetadata(note: ReadingNoteBlock, value: AnnotationMetadata): ReadingNoteBlock {
  return { ...note, id: value.id, color: value.color, status: value.status,
    ...(value.position ? { source: readingNoteSourceAt(note.source, value.position) } : {}) };
}
interface AnnotationTransaction { readonly before: AnnotationMetadata; readonly after: AnnotationMetadata; }

export interface AnnotationControllerOptions {
  readonly gateway: NoteAnnotationGateway;
  readonly onCommitted?: () => void;
  readonly debounceMs?: number;
  readonly maximumWaitMs?: number;
  readonly readOnly?: boolean;
}

const INITIAL_SNAPSHOT: AnnotationControllerSnapshot = {
  annotations: [],
  selected: undefined,
  dirtyIds: new Set(),
  saveState: "saved",
  error: undefined,
  canUndo: false,
  canRedo: false,
  readOnly: false,
};

function replaceAnnotation(
  annotations: readonly ReadingNoteBlock[],
  replacement: ReadingNoteBlock,
): readonly ReadingNoteBlock[] {
  return annotations.map((annotation) => annotation.id === replacement.id ? replacement : annotation);
}

export class AnnotationController {
  readonly #gateway: NoteAnnotationGateway;
  readonly #onCommitted: () => void;
  readonly #debounceMs: number;
  readonly #maximumWaitMs: number;
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Map<NoteBlockId, PendingMutation>();
  readonly #conflicted = new Set<NoteBlockId>();
  readonly #debounceTimers = new Map<NoteBlockId, number>();
  readonly #maximumWaitTimers = new Map<NoteBlockId, number>();
  readonly #inflight = new Map<NoteBlockId, Promise<void>>();
  #snapshot: AnnotationControllerSnapshot;
  #undo: AnnotationTransaction[] = [];
  #redo: AnnotationTransaction[] = [];
  #disposed = false;

  constructor(options: AnnotationControllerOptions) {
    this.#gateway = options.gateway;
    this.#onCommitted = options.onCommitted ?? (() => undefined);
    this.#debounceMs = options.debounceMs ?? 350;
    this.#maximumWaitMs = options.maximumWaitMs ?? 2_000;
    this.#snapshot = { ...INITIAL_SNAPSHOT, readOnly: options.readOnly ?? false };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): AnnotationControllerSnapshot => this.#snapshot;

  async load(paperId: string, attachmentId: string): Promise<void> {
    const annotations = (await Promise.all([
      this.#gateway.listReadingNotes({ paperId, status: "active" }),
      this.#gateway.listReadingNotes({ paperId, status: "trashed" }),
    ]))
      .flat()
      .filter((annotation) => annotation.source.attachmentId === attachmentId);
    if (this.#disposed) return;
    const dirty = new Set(this.#pending.keys());
    const merged = [...new Map(annotations.map((annotation) => [annotation.id, annotation])).values()]
      .map((annotation) => { const pending = this.#pending.get(annotation.id); return pending ? withMetadata(annotation, metadata(pending.optimistic)) : annotation; });
    for (const pending of this.#pending.values()) {
      if (!merged.some((annotation) => annotation.id === pending.optimistic.id)) {
        merged.push(pending.optimistic);
      }
    }
    const selected = this.#snapshot.selected !== undefined
      && merged.some((annotation) => annotation.id === this.#snapshot.selected?.id)
      ? this.#snapshot.selected
      : undefined;
    this.#update({
      ...this.#snapshot,
      annotations: merged,
      selected,
      dirtyIds: dirty,
    });
  }

  async create(draft: ReadingNoteDraft): Promise<ReadingNoteBlock> {
    this.#assertWritable();
    const created = await this.#gateway.createReadingNote(draft);
    if (this.#disposed) return created;
    this.#undo.push({ before: { ...metadata(created), status: "trashed" }, after: metadata(created) });
    this.#redo = [];
    this.#onCommitted();
    this.#update({
      ...this.#snapshot,
      annotations: [...this.#snapshot.annotations, created],
      saveState: "saved",
      canUndo: true,
      canRedo: false,
    });
    return created;
  }

  update(id: NoteBlockId, patch: { readonly color?: string; readonly position?: SourceRect }): boolean {
    if (this.#snapshot.readOnly) return false;
    const current = this.#annotation(id);
    if (current === undefined || current.status !== "active") return false;
    if (patch.position && (!isPositionReadingNote(current) || current.source.state !== "exact")) return false;
    const optimistic = { ...current, ...(patch.color === undefined ? {} : { color: patch.color }),
      ...(patch.position ? { source: readingNoteSourceAt(current.source, patch.position) } : {}) };
    if (optimistic.color === current.color && JSON.stringify(optimistic.source.rects) === JSON.stringify(current.source.rects)) return true;
    this.#recordAndQueue(current, optimistic, "update");
    return true;
  }

  setStatus(id: NoteBlockId, status: Extract<NoteLifecycleStatus, "active" | "trashed">): boolean {
    if (this.#snapshot.readOnly) return false;
    const current = this.#annotation(id);
    if (current === undefined || current.status === status) return false;
    const { trashedAt: _trashedAt, ...withoutTrash } = current;
    const optimistic: ReadingNoteBlock = {
      ...withoutTrash,
      status,
      ...(status === "trashed" ? { trashedAt: new Date().toISOString() } : {}),
    };
    this.#recordAndQueue(current, optimistic, "status");
    void this.flush(id);
    return true;
  }

  select(id: NoteBlockId | undefined, origin: AnnotationSelectionOrigin = "page"): boolean {
    if (id !== undefined && this.#annotation(id) === undefined) return false;
    this.#update({
      ...this.#snapshot,
      selected: id === undefined ? undefined : { id, origin },
    });
    return true;
  }

  commandAvailability(id: NoteBlockId): {
    readonly canUpdate: boolean;
    readonly canTrash: boolean;
    readonly canRestore: boolean;
    readonly canNavigate: boolean;
  } {
    const annotation = this.#annotation(id);
    return {
      canUpdate: annotation !== undefined && !this.#snapshot.readOnly && annotation.status === "active",
      canTrash: annotation !== undefined && !this.#snapshot.readOnly && annotation.status === "active",
      canRestore: annotation !== undefined && !this.#snapshot.readOnly && annotation.status === "trashed",
      canNavigate: annotation !== undefined
        && annotation.status === "active"
        && annotation.source.state !== "unavailable"
        && annotation.source.state !== "paper_in_trash",
    };
  }

  async flush(id?: NoteBlockId): Promise<void> {
    const ids = id === undefined ? [...this.#pending.keys()] : [id];
    await Promise.all(ids.map((candidate) => this.#flushOne(candidate)));
  }

  async retry(): Promise<void> {
    await Promise.all([...this.#conflicted].map(async (id) => {
      const pending = this.#pending.get(id);
      if (pending === undefined) return;
      const current = await this.#gateway.getReadingNote(id);
      this.#pending.set(id, {
        base: current,
        optimistic: { ...current, ...metadata(pending.optimistic) },
        kind: pending.optimistic.status === current.status ? "update" : "status",
      });
      this.#conflicted.delete(id);
    }));
    await this.flush();
  }

  async undo(): Promise<boolean> {
    const transaction = this.#undo.pop();
    if (transaction === undefined || this.#snapshot.readOnly) return false;
    this.#redo.push(transaction);
    this.#queueHistoricalState(transaction.before);
    await this.flush(transaction.before.id);
    return true;
  }

  async redo(): Promise<boolean> {
    const transaction = this.#redo.pop();
    if (transaction === undefined || this.#snapshot.readOnly) return false;
    this.#undo.push(transaction);
    this.#queueHistoricalState(transaction.after);
    await this.flush(transaction.after.id);
    return true;
  }

  async close(): Promise<void> {
    if (!(await this.prepareClose())) {
      throw new Error(this.#snapshot.error ?? "仍有尚未保存的阅读批注");
    }
    this.dispose();
  }

  async prepareClose(): Promise<boolean> {
    await this.flush();
    return this.#pending.size === 0;
  }

  getRecoveryDrafts(): readonly AnnotationRecoveryDraft[] {
    return [...this.#pending.values()].map(({ base, optimistic }) => ({
      id: optimistic.id,
      baseRevision: base.revision,
      color: optimistic.color,
      ...(isPositionReadingNote(optimistic) ? { position: optimistic.source.rects[0] } : {}),
      status: optimistic.status === "trashed" ? "trashed" : "active",
    }));
  }

  restoreRecoveryDrafts(drafts: readonly AnnotationRecoveryDraft[]): AnnotationRecoveryResult {
    let restored = 0;
    let conflicts = 0;
    let missing = 0;
    let documentDrafts = 0;
    const missingDrafts: AnnotationRecoveryDraft[] = [];
    for (const draft of drafts) {
      const current = this.#annotation(draft.id);
      if (current === undefined) {
        missing += 1;
        missingDrafts.push(draft);
        continue;
      }
      if (draft.body !== undefined && current.pageId) {
        stageLegacyAnnotationDocument(current.pageId, draft.baseRevision, draft.body);
        documentDrafts += 1;
      }
      const { trashedAt: previousTrashedAt, ...withoutTrash } = current;
      const optimistic: ReadingNoteBlock = {
        ...withMetadata(withoutTrash, { id: current.id, color: draft.color, status: draft.status, ...(draft.position ? { position: draft.position } : {}) }),
        color: draft.color,
        status: draft.status,
        ...(draft.status === "trashed" ? { trashedAt: previousTrashedAt ?? new Date().toISOString() } : {}),
      };
      const kind: PendingMutation["kind"] = current.status === draft.status ? "update" : "status";
      this.#pending.set(draft.id, {
        base: { ...current, revision: draft.baseRevision },
        optimistic,
        kind,
      });
      if (current.revision !== draft.baseRevision) {
        this.#conflicted.add(draft.id);
        conflicts += 1;
      } else {
        this.#scheduleMutation(draft.id);
      }
      restored += 1;
    }
    if (restored > 0) {
      const annotations = this.#snapshot.annotations.map((annotation) => (
        this.#pending.get(annotation.id)?.optimistic ?? annotation
      ));
      this.#update({
        ...this.#snapshot,
        annotations,
        dirtyIds: new Set(this.#pending.keys()),
        saveState: conflicts > 0 ? "conflict" : "dirty",
        error: conflicts > 0 ? "恢复草稿基于较早版本，请重试以重新应用" : undefined,
      });
    }
    return { restored, conflicts, missing, missingDrafts, ...(documentDrafts > 0 ? { documentDrafts } : {}) };
  }

  dispose(): void {
    this.#disposed = true;
    this.#clearTimers();
    this.#listeners.clear();
  }

  #recordAndQueue(before: ReadingNoteBlock, after: ReadingNoteBlock, kind: PendingMutation["kind"]): void {
    const pending = this.#pending.get(before.id);
    const last = this.#undo.at(-1);
    if (kind === "update" && pending?.kind === "update" && last?.after.id === before.id) {
      this.#undo[this.#undo.length - 1] = { before: last.before, after: metadata(after) };
    } else {
      this.#undo.push({ before: metadata(before), after: metadata(after) });
    }
    this.#redo = [];
    this.#queue(before, after, kind);
  }

  #queueHistoricalState(target: AnnotationMetadata): void {
    const current = this.#annotation(target.id);
    if (current === undefined) return;
    const kind = current.status === target.status ? "update" : "status";
    const optimistic = withMetadata(current, target);
    this.#queue(current, optimistic, kind);
  }

  #queue(base: ReadingNoteBlock, optimistic: ReadingNoteBlock, kind: PendingMutation["kind"]): void {
    const existing = this.#pending.get(base.id);
    this.#pending.set(base.id, { base: existing?.base ?? base, optimistic, kind });
    this.#scheduleMutation(base.id);
    this.#update({
      ...this.#snapshot,
      annotations: replaceAnnotation(this.#snapshot.annotations, optimistic),
      dirtyIds: new Set(this.#pending.keys()),
      saveState: "dirty",
      error: undefined,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    });
  }

  #scheduleMutation(id: NoteBlockId): void {
    this.#clearDebounce(id);
    this.#debounceTimers.set(id, window.setTimeout(() => void this.flush(id), this.#debounceMs));
    if (!this.#maximumWaitTimers.has(id)) {
      this.#maximumWaitTimers.set(id, window.setTimeout(() => void this.flush(id), this.#maximumWaitMs));
    }
  }

  async #flushOne(id: NoteBlockId): Promise<void> {
    const activeFlush = this.#inflight.get(id);
    if (activeFlush !== undefined) {
      await activeFlush;
      return;
    }
    const operation = this.#performFlush(id);
    this.#inflight.set(id, operation);
    try {
      await operation;
    } finally {
      if (this.#inflight.get(id) === operation) this.#inflight.delete(id);
    }
  }

  async #performFlush(id: NoteBlockId): Promise<void> {
    const pending = this.#pending.get(id);
    if (pending === undefined) return;
    this.#clearMutationTimers(id);
    this.#update({ ...this.#snapshot, saveState: "saving", error: undefined });
    try {
      let expectedRevision = pending.base.revision;
      const position = pending.optimistic.source.rects[0];
      if (pending.kind === "status" && isPositionReadingNote(pending.optimistic) && position
        && JSON.stringify(pending.base.source.rects) !== JSON.stringify(pending.optimistic.source.rects)) {
        const moved = await this.#gateway.updateReadingNote({ id, position, color: pending.optimistic.color, expectedRevision });
        expectedRevision = moved.revision;
      }
      const saved = pending.kind === "status"
        ? await this.#gateway.setReadingNoteStatus({
            id,
            status: pending.optimistic.status,
            expectedRevision,
          })
        : await this.#gateway.updateReadingNote({
            id,
            color: pending.optimistic.color,
            ...(isPositionReadingNote(pending.optimistic) ? { position: pending.optimistic.source.rects[0] } : {}),
            expectedRevision,
          });
      const current = this.#pending.get(id);
      this.#conflicted.delete(id);
      if (current === pending) {
        this.#pending.delete(id);
      } else if (current !== undefined) {
        this.#pending.set(id, {
          base: saved,
          optimistic: {
            ...current.optimistic,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          },
          kind: current.optimistic.status === saved.status ? "update" : "status",
        });
      }
      this.#onCommitted();
      const visible = this.#pending.get(id)?.optimistic ?? saved;
      this.#update({
        ...this.#snapshot,
        annotations: replaceAnnotation(this.#snapshot.annotations, visible),
        dirtyIds: new Set(this.#pending.keys()),
        saveState: this.#pending.size === 0 ? "saved" : "dirty",
        error: undefined,
      });
    } catch (reason: unknown) {
      const conflict = reason instanceof NotesGatewayError && reason.code === "revision_conflict";
      if (conflict) this.#conflicted.add(id);
      this.#update({
        ...this.#snapshot,
        dirtyIds: new Set(this.#pending.keys()),
        saveState: conflict ? "conflict" : "failed",
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  #annotation(id: NoteBlockId): ReadingNoteBlock | undefined {
    return this.#snapshot.annotations.find((annotation) => annotation.id === id);
  }

  #assertWritable(): void {
    if (this.#snapshot.readOnly) throw new Error("阅读器处于只读模式");
  }

  #clearDebounce(id: NoteBlockId): void {
    const timer = this.#debounceTimers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    this.#debounceTimers.delete(id);
  }

  #clearMutationTimers(id: NoteBlockId): void {
    this.#clearDebounce(id);
    const timer = this.#maximumWaitTimers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    this.#maximumWaitTimers.delete(id);
  }

  #clearTimers(): void {
    [...this.#pending.keys()].forEach((id) => this.#clearMutationTimers(id));
  }

  #update(snapshot: AnnotationControllerSnapshot): void {
    if (this.#disposed) return;
    this.#snapshot = snapshot;
    this.#listeners.forEach((listener) => listener());
  }
}
