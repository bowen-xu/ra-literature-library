// @vitest-environment happy-dom

import type { ReadingNoteBlock } from "@research-assistant/core/notes";
import { NotesGatewayError, type NotesGateway } from "@research-assistant/data/notes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationController } from "./AnnotationController";

function note(overrides: Partial<ReadingNoteBlock> = {}): ReadingNoteBlock {
  return {
    id: "note-1" as ReadingNoteBlock["id"],
    noteType: "annotation",
    body: "before",
    color: "#f4cf65",
    status: "active",
    isFavorite: false,
    revision: 0,
    source: {
      anchorId: "anchor-1",
      paperId: "paper-1",
      paperTitle: "Paper",
      attachmentId: "attachment-1",
      contentSha256: "a".repeat(64),
      pageIndex: 2,
      rects: [],
      quoteExact: "quote",
      quotePrefix: "",
      quoteSuffix: "",
      state: "exact",
    },
    projectIds: [],
    tagIds: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function gateway(initial = note()): NotesGateway {
  return {
    listReadingNotes: vi.fn().mockImplementation(async (query) => initial.status === (query?.status ?? "active") ? [initial] : []),
    getReadingNote: vi.fn().mockResolvedValue(initial),
    createReadingNote: vi.fn().mockImplementation(async () => initial),
    updateReadingNote: vi.fn().mockImplementation(async (request) => note({
      body: initial.body,
      color: request.color ?? initial.color,
      revision: request.expectedRevision + 1,
    })),
    setReadingNoteStatus: vi.fn().mockImplementation(async (request) => note({
      status: request.status,
      revision: request.expectedRevision + 1,
    })),
  } as unknown as NotesGateway;
}

describe("AnnotationController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps an optimistic local change dirty until the debounced save commits", async () => {
    const notes = gateway();
    const committed = vi.fn();
    const controller = new AnnotationController({ gateway: notes, onCommitted: committed });
    await controller.load("paper-1", "attachment-1");
    expect(controller.update(note().id, { color: "#123456" })).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ saveState: "dirty", annotations: [{ color: "#123456" }] });
    vi.advanceTimersByTime(349);
    expect(notes.updateReadingNote).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(notes.updateReadingNote).toHaveBeenCalledWith(expect.objectContaining({ color: "#123456", expectedRevision: 0 }));
    expect(controller.getSnapshot().saveState).toBe("saved");
    expect(committed).toHaveBeenCalledOnce();
  });

  it("forces continuous edits through the maximum wait", async () => {
    const notes = gateway();
    const controller = new AnnotationController({ gateway: notes, debounceMs: 350, maximumWaitMs: 2_000 });
    await controller.load("paper-1", "attachment-1");
    for (let elapsed = 0; elapsed < 2_000; elapsed += 300) {
      controller.update(note().id, { color: `#${elapsed.toString(16).padStart(6, "0")}` });
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(notes.updateReadingNote).toHaveBeenCalled();
  });

  it("rebases edits made during an in-flight save instead of dropping them", async () => {
    let resolveFirst: ((value: ReadingNoteBlock) => void) | undefined;
    const notes = gateway();
    vi.mocked(notes.updateReadingNote)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async (request) => note({ color: request.color ?? "#f4cf65", revision: request.expectedRevision + 1 }));
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    controller.update(note().id, { color: "#111111" });
    const firstFlush = controller.flush();
    await Promise.resolve();
    controller.update(note().id, { color: "#222222" });
    resolveFirst?.(note({ color: "#111111", revision: 1 }));
    await firstFlush;
    expect(controller.getSnapshot()).toMatchObject({ saveState: "dirty", annotations: [{ color: "#222222" }] });
    await vi.advanceTimersByTimeAsync(350);
    expect(notes.updateReadingNote).toHaveBeenLastCalledWith(expect.objectContaining({
      color: "#222222",
      expectedRevision: 1,
    }));
    expect(controller.getSnapshot().saveState).toBe("saved");
  });

  it("keeps failed and conflicted mutations dirty and retryable", async () => {
    const notes = gateway();
    vi.mocked(notes.updateReadingNote)
      .mockRejectedValueOnce(new Error("disk busy"))
      .mockRejectedValueOnce(new NotesGatewayError("revision_conflict", "stale", 3))
      .mockResolvedValueOnce(note({ color: "#123456", revision: 1 }));
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    controller.update(note().id, { color: "#123456" });
    await controller.flush();
    expect(controller.getSnapshot()).toMatchObject({ saveState: "failed", error: "disk busy" });
    expect(controller.getSnapshot().dirtyIds.has(note().id)).toBe(true);
    await controller.retry();
    expect(controller.getSnapshot().saveState).toBe("conflict");
    vi.mocked(notes.getReadingNote).mockResolvedValueOnce(note({ color: "#abcdef", revision: 3 }));
    await controller.retry();
    expect(controller.getSnapshot().saveState).toBe("saved");
    expect(notes.updateReadingNote).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 3 }));
  });

  it("undoes and redoes annotation transactions without rewriting global note history", async () => {
    const notes = gateway();
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    controller.update(note().id, { color: "#123456" });
    await controller.flush();
    expect(await controller.undo()).toBe(true);
    expect(controller.getSnapshot().annotations[0]?.color).toBe("#f4cf65");
    expect(await controller.redo()).toBe(true);
    expect(controller.getSnapshot().annotations[0]?.color).toBe("#123456");
  });

  it("makes read-only, unavailable-source, and trash command boundaries explicit", async () => {
    const unavailable = note({ source: { ...note().source, state: "unavailable" } });
    const controller = new AnnotationController({ gateway: gateway(unavailable), readOnly: true });
    await controller.load("paper-1", "attachment-1");
    expect(controller.update(unavailable.id, { color: "#000000" })).toBe(false);
    expect(controller.commandAvailability(unavailable.id)).toEqual({
      canUpdate: false,
      canTrash: false,
      canRestore: false,
      canNavigate: false,
    });
  });

  it("keeps one selected annotation while preserving whether page or sidebar selected it", async () => {
    const controller = new AnnotationController({ gateway: gateway() });
    await controller.load("paper-1", "attachment-1");
    controller.select(note().id, "page");
    expect(controller.getSnapshot().selected).toEqual({ id: note().id, origin: "page" });
    controller.select(note().id, "sidebar");
    expect(controller.getSnapshot().selected).toEqual({ id: note().id, origin: "sidebar" });
  });

  it("keeps a trashed annotation available for local undo and restore", async () => {
    const notes = gateway();
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    expect(controller.setStatus(note().id, "trashed")).toBe(true);
    await controller.flush();
    expect(controller.getSnapshot().annotations[0]?.status).toBe("trashed");
    expect(controller.commandAvailability(note().id).canRestore).toBe(true);
    expect(controller.setStatus(note().id, "active")).toBe(true);
    await controller.flush();
    expect(controller.getSnapshot().annotations[0]?.status).toBe("active");
  });

  it("refuses to dispose while dirty mutations still fail to save", async () => {
    const notes = gateway();
    vi.mocked(notes.updateReadingNote).mockRejectedValue(new Error("offline"));
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    controller.update(note().id, { color: "#999999" });
    await expect(controller.close()).rejects.toThrow("offline");
    expect(controller.getSnapshot().dirtyIds.has(note().id)).toBe(true);
  });

  it("restores a stashed annotation edit and resumes autosave at the recorded base revision", async () => {
    const notes = gateway();
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    expect(controller.restoreRecoveryDrafts([{
      id: note().id,
      baseRevision: 0,
      color: "#123456",
      status: "active",
    }])).toEqual({ restored: 1, conflicts: 0, missing: 0, missingDrafts: [] });
    expect(controller.getSnapshot()).toMatchObject({ saveState: "dirty", annotations: [{ color: "#123456" }] });
    expect(controller.getRecoveryDrafts()).toEqual([expect.objectContaining({ color: "#123456", baseRevision: 0 })]);
    await vi.advanceTimersByTimeAsync(350);
    expect(notes.updateReadingNote).toHaveBeenCalledWith(expect.objectContaining({ color: "#123456", expectedRevision: 0 }));
  });

  it("keeps a recovered edit conflicted when the database revision has moved", async () => {
    const current = note({ revision: 3, color: "#abcdef" });
    const notes = gateway(current);
    const controller = new AnnotationController({ gateway: notes });
    await controller.load("paper-1", "attachment-1");
    expect(controller.restoreRecoveryDrafts([{
      id: current.id,
      baseRevision: 1,
      color: "#fedcba",
      status: "active",
    }])).toEqual({ restored: 1, conflicts: 1, missing: 0, missingDrafts: [] });
    expect(controller.getSnapshot()).toMatchObject({ saveState: "conflict", annotations: [{ color: "#fedcba" }] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(notes.updateReadingNote).not.toHaveBeenCalled();
  });
});

it("PDF undo and redo change metadata without replaying an old document body", async () => {
  let persisted = note();
  const notes = gateway();
  vi.mocked(notes.listReadingNotes).mockImplementation(async query => persisted.status === (query?.status ?? "active") ? [persisted] : []);
  vi.mocked(notes.updateReadingNote).mockImplementation(async request => {
    expect(request).not.toHaveProperty("body");
    persisted = { ...persisted, color: request.color ?? persisted.color, revision: request.expectedRevision + 1 };
    return persisted;
  });
  const controller = new AnnotationController({ gateway: notes });
  await controller.load("paper-1", "attachment-1");
  controller.update(persisted.id, { color: "#123456" }); await controller.flush();
  persisted = { ...persisted, body: "Later document input", revision: persisted.revision + 1 };
  await controller.load("paper-1", "attachment-1");
  await controller.undo(); expect(persisted.body).toBe("Later document input"); expect(persisted.color).toBe(note().color);
  await controller.redo(); expect(persisted.body).toBe("Later document input"); expect(persisted.color).toBe("#123456");
  controller.dispose();
});

it("preserves positional metadata in undo and recovery without copying document content", async () => {
  const { readingNoteSourceAt } = await import("@research-assistant/core/notes");
  vi.useFakeTimers();
  try {
    const origin = { x: .2, y: .3, width: .00001, height: .00001 }, target = { ...origin, x: .6 };
    const initial = note({ source: { ...note().source, quoteExact: "", rects: [origin] } });
    const notes = gateway(initial);
    vi.mocked(notes.updateReadingNote).mockImplementation(async request => ({ ...initial, revision: request.expectedRevision + 1, source: request.position ? readingNoteSourceAt(initial.source, request.position) : initial.source }));
    const controller = new AnnotationController({ gateway: notes }); await controller.load("paper-1", "attachment-1");
    expect(controller.update(initial.id, { position: target })).toBe(true);
    expect(controller.getRecoveryDrafts()[0]).toMatchObject({ position: target });
    expect(controller.getRecoveryDrafts()[0]).not.toHaveProperty("body");
    await controller.flush();
    expect(notes.updateReadingNote).toHaveBeenLastCalledWith({ id: initial.id, color: initial.color, position: target, expectedRevision: 0 });
    await controller.undo(); await controller.flush();
    expect(controller.getSnapshot().annotations[0]?.source.rects).toEqual([origin]);
    const restored = new AnnotationController({ gateway: notes }); await restored.load("paper-1", "attachment-1");
    restored.restoreRecoveryDrafts([{ id: initial.id, color: initial.color, status: "active", baseRevision: 0, position: target }]);
    expect(restored.getSnapshot().annotations[0]?.source.rects).toEqual([target]);
    controller.dispose(); restored.dispose();
  } finally { vi.useRealTimers(); }
});
