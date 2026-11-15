// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLiteratureDraft, type LiteratureItem } from "@research-assistant/core/literature";
import type { LiteratureGateway } from "../../../services/literatureGateway";
import { LIBRARY_SESSION_KEY, loadLibrarySession } from "./librarySessionStorage";
import { useLibrarySessions } from "./useLibrarySessions";

afterEach(() => window.localStorage.clear());
const attachment = { id: "pdf", displayName: "Paper.pdf", mimeType: "application/pdf", byteSize: 1, contentSha256: "a".repeat(64) };
const item: LiteratureItem = { ...emptyLiteratureDraft(), id: "paper", attachments: [attachment],
  readingStatus: "unread", projectIds: [], metadataSources: [], createdAt: "now", updatedAt: "now" };

describe("library session hydration", () => {
  function prepare() {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.setItem(LIBRARY_SESSION_KEY, JSON.stringify({ version: 1, activeTabId: "reader:pdf", tabs: [
      { itemId: "paper", attachmentId: "pdf", contentSha256: attachment.contentSha256 },
    ] }));
    let resolve!: (item: LiteratureItem) => void;
    const get = vi.fn(() => new Promise<LiteratureItem>(done => { resolve = done; }));
    const gateway = { get } as unknown as LiteratureGateway;
    const onSessionsChanged = vi.fn();
    const onWarning = vi.fn();
    let sessions!: ReturnType<typeof useLibrarySessions>;
    function Harness() {
      sessions = useLibrarySessions({ gateway, onSessionsChanged, onWarning, requestedTabId: "reader:pdf" });
      return null;
    }
    const root = createRoot(document.createElement("div"));
    return { root, Harness, resolve: () => resolve(item), onSessionsChanged,
      get sessions() { return sessions; } };
  }

  it("does not publish or persist an empty registry while identities are resolving", async () => {
    const h = prepare();
    try {
      await act(async () => h.root.render(<h.Harness />));
      expect(h.sessions.ready).toBe(false);
      expect(h.onSessionsChanged).not.toHaveBeenCalled();
      expect(loadLibrarySession().activeTabId).toBe("reader:pdf");
      await act(async () => h.resolve());
      expect(h.sessions.ready).toBe(true);
      expect(h.sessions.registry.activeTabId).toBe("reader:pdf");
      expect(h.onSessionsChanged).toHaveBeenLastCalledWith(["reader:pdf"], "reader:pdf");
    } finally { await act(async () => h.root.unmount()); }
  });

  it("ignores a late restoration after the owning workspace unmounts", async () => {
    const h = prepare();
    await act(async () => h.root.render(<h.Harness />));
    await act(async () => h.root.unmount());
    await act(async () => h.resolve());
    expect(h.onSessionsChanged).not.toHaveBeenCalled();
    expect(loadLibrarySession().activeTabId).toBe("reader:pdf");
  });
});
