// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLiteratureDraft, type LiteratureItem } from "@research-assistant/core/literature";
import { LIBRARY_SESSION_KEY, loadLibrarySession, restoreLibrarySession, saveLibrarySession } from "./librarySessionStorage";
import { ReaderSessionRegistry } from "./ReaderSessionRegistry";

const attachment = (id: string) => ({ id, displayName: `${id}.pdf`, mimeType: "application/pdf", byteSize: 10, contentSha256: "a".repeat(64) });
const item: LiteratureItem = { ...emptyLiteratureDraft(), id: "paper", title: "Paper",
  attachments: [attachment("a"), attachment("b")], readingStatus: "unread", projectIds: [],
  metadataSources: [], createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z" };
afterEach(() => localStorage.clear());

describe("library session persistence", () => {
  it("restores ordered attachment identities and the active tab, omitting old source jumps and closed tabs", async () => {
    const registry = new ReaderSessionRegistry().open({ item, attachment: item.attachments[0]! })
      .open({ item, attachment: item.attachments[1]! }).activate("reader:a");
    saveLibrarySession(registry);
    const get = vi.fn().mockResolvedValue(item);
    const restored = await restoreLibrarySession(loadLibrarySession(), { get });
    expect(get).toHaveBeenCalledTimes(1);
    expect(restored.registry.sessions.map(tab => tab.id)).toEqual(["reader:a", "reader:b"]);
    expect(restored.registry.activeTabId).toBe("reader:a");
    expect(restored.registry.sessions.every(tab => tab.source === undefined)).toBe(true);
    expect(localStorage.getItem(LIBRARY_SESSION_KEY)).not.toContain("title");
    saveLibrarySession(restored.registry.close("reader:a"));
    expect(loadLibrarySession().tabs.map(tab => tab.attachmentId)).toEqual(["b"]);
  });

  it("keeps list selection and restores available tabs independently of missing papers or changed attachments", async () => {
    localStorage.setItem(LIBRARY_SESSION_KEY, JSON.stringify({ version: 1, activeTabId: "library", tabs: [
      { itemId: "gone", attachmentId: "gone", contentSha256: "a".repeat(64) },
      { itemId: "paper", attachmentId: "a", contentSha256: "b".repeat(64) },
      { itemId: "paper", attachmentId: "b", contentSha256: "a".repeat(64) },
    ] }));
    const restored = await restoreLibrarySession(loadLibrarySession(), { get: async id => {
      if (id === "gone") throw new Error("missing"); return item;
    } });
    expect(restored.unavailable).toBe(2);
    expect(restored.registry.activeTabId).toBe("library");
    expect(restored.registry.sessions.map(tab => tab.id)).toEqual(["reader:b"]);
  });

  it("validates stored records, rejects unsupported versions and deduplicates attachment identities", () => {
    localStorage.setItem(LIBRARY_SESSION_KEY, "{"); expect(loadLibrarySession().tabs).toEqual([]);
    localStorage.setItem(LIBRARY_SESSION_KEY, JSON.stringify({ version: 2, tabs: [], activeTabId: "reader:a" }));
    expect(loadLibrarySession().activeTabId).toBe("library");
    localStorage.setItem(LIBRARY_SESSION_KEY, JSON.stringify({ version: 1, activeTabId: "reader:invalid", tabs: [
      null, {}, { itemId: "paper", attachmentId: "a", contentSha256: "a".repeat(64) },
      { itemId: "other", attachmentId: "a", contentSha256: "a".repeat(64) },
    ] }));
    expect(loadLibrarySession()).toMatchObject({ tabs: [{ itemId: "paper", attachmentId: "a" }], activeTabId: "library" });
  });
});
