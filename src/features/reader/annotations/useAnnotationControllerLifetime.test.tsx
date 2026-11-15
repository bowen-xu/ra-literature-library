// @vitest-environment happy-dom
import { act, StrictMode, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { noteBlockId, type ReadingNoteBlock } from "@research-assistant/core/notes";
import type { NotesGateway } from "@research-assistant/data/notes";
import { AnnotationController } from "./AnnotationController";
import { useAnnotationControllerLifetime } from "./useAnnotationControllerLifetime";

const note: ReadingNoteBlock = {
  id: noteBlockId("saved-highlight"), noteType: "highlight", body: "", color: "#f4cf65", status: "active", isFavorite: false,
  revision: 1, projectIds: [], tagIds: [], createdAt: "now", updatedAt: "now",
  source: { paperId: "paper", paperTitle: "Paper", attachmentId: "pdf", contentSha256: "a".repeat(64), pageIndex: 0,
    rects: [{ x: .1, y: .1, width: .4, height: .02 }], quoteExact: "Source", quotePrefix: "", quoteSuffix: "", state: "exact" },
};
function controller() {
  const gateway = {
    listReadingNotes: vi.fn(async (query: { status?: string }) => query.status === "active" ? [note] : []),
    createReadingNote: vi.fn(async () => ({ ...note, id: noteBlockId("new-highlight") })),
  };
  const owner = new AnnotationController({ gateway: gateway as unknown as NotesGateway });
  const dispose = vi.spyOn(owner, "dispose");
  return { owner, gateway, dispose };
}
function Harness({ owner }: { readonly owner: AnnotationController }) {
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  useAnnotationControllerLifetime(owner);
  useEffect(() => { void owner.load("paper", "pdf"); }, [owner]);
  return <span>{state.annotations.map(value => value.id).join(",")}</span>;
}
let root: ReturnType<typeof createRoot>, container: HTMLDivElement, unmounted: boolean;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); unmounted = false;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { if (!unmounted) await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("keeps persisted and newly created highlights observable across StrictMode effect restart", async () => {
  const fixture = controller();
  await act(async () => root.render(<StrictMode><Harness owner={fixture.owner} /></StrictMode>));
  expect(fixture.dispose).not.toHaveBeenCalled();
  expect(container.textContent).toBe("saved-highlight");
  await act(async () => fixture.owner.create({ itemId: "paper", attachmentId: "pdf", pageIndex: 0, noteType: "highlight", body: "", rects: note.source.rects, quoteExact: "New source" }));
  expect(container.textContent).toBe("saved-highlight,new-highlight");
  expect(fixture.owner.getSnapshot().canUndo).toBe(true);
});
it("disposes the previous attachment owner while retaining its replacement", async () => {
  const first = controller(), second = controller();
  await act(async () => root.render(<StrictMode><Harness owner={first.owner} /></StrictMode>));
  await act(async () => root.render(<StrictMode><Harness owner={second.owner} /></StrictMode>));
  expect(first.dispose).toHaveBeenCalledOnce(); expect(second.dispose).not.toHaveBeenCalled();
  expect(container.textContent).toBe("saved-highlight");
  await act(async () => root.unmount()); unmounted = true;
  expect(second.dispose).toHaveBeenCalledOnce();
});
it("ignores a late annotation load after actual unmount", async () => {
  const fixture = controller(); let resolve!: (value: ReadingNoteBlock[]) => void;
  const pending = new Promise<ReadingNoteBlock[]>(yes => { resolve = yes; });
  fixture.gateway.listReadingNotes.mockImplementation(async () => pending);
  await act(async () => root.render(<StrictMode><Harness owner={fixture.owner} /></StrictMode>));
  await act(async () => root.unmount()); unmounted = true;
  expect(fixture.dispose).toHaveBeenCalledOnce();
  await act(async () => { resolve([note]); await pending; });
  expect(fixture.owner.getSnapshot().annotations).toEqual([]);
});
