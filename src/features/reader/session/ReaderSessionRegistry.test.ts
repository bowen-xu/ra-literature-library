import type { LiteratureItem } from "@research-assistant/core/literature";
import { describe, expect, it } from "vitest";

import {
  LIBRARY_TAB_ID,
  ReaderSessionRegistry,
  readerSessionId,
  type ReaderSessionInput,
} from "./ReaderSessionRegistry";

function sessionInput(itemId: string, attachmentId: string, title = itemId): ReaderSessionInput {
  const attachment = {
    id: attachmentId,
    displayName: `${title}.pdf`,
    mimeType: "application/pdf",
    byteSize: 1,
    contentSha256: "a".repeat(64),
  };
  return {
    item: {
      id: itemId,
      itemType: "document",
      title,
      abstractText: "",
      containerTitle: "",
      volume: "",
      issue: "",
      pages: "",
      doi: "",
      url: "",
      language: "",
      bibtexKey: "",
      creators: [],
      tags: [],
      readingStatus: "unread",
      attachments: [attachment],
      projectIds: [],
      metadataSources: [],
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    } satisfies LiteratureItem,
    attachment,
  };
}

it("refreshes renamed attachment metadata without navigation or reading session replacement", () => {
  const one = sessionInput("paper", "one"), two = sessionInput("paper", "two");
  const registry = new ReaderSessionRegistry().open(one).open(two);
  const updated = {...two.item, attachments:[one.attachment, {...two.attachment, displayName:"renamed.pdf"}]};
  const next = registry.refreshItem(updated);
  expect(next.activeTabId).toBe(registry.activeTabId);
  expect(next.sessions.map(value=>value.navigationRequestId)).toEqual(registry.sessions.map(value=>value.navigationRequestId));
  expect(next.sessions[1]?.attachment.displayName).toBe("renamed.pdf");
  expect(next.sessions[0]?.attachment.id).toBe("one");
  expect(next.sessions[1]?.attachment.contentSha256).toBe(two.attachment.contentSha256);
});

describe("ReaderSessionRegistry", () => {
  it("owns one session per attachment and refreshes navigation requests", () => {
    const first = sessionInput("paper-1", "attachment-1", "First title");
    const refreshed = sessionInput("paper-1", "attachment-1", "Updated title");
    const opened = new ReaderSessionRegistry().open(first);
    const updated = opened.open(refreshed);

    expect(updated.sessions).toHaveLength(1);
    expect(updated.sessions[0]).toMatchObject({
      id: readerSessionId("attachment-1"),
      lifecycle: "active",
      navigationRequestId: 2,
    });
    expect(updated.sessions[0]?.item.title).toBe("Updated title");
  });

  it("returns to the left session or library when closing the active session", () => {
    const first = sessionInput("paper-1", "attachment-1");
    const second = sessionInput("paper-2", "attachment-2");
    const registry = new ReaderSessionRegistry().open(first).open(second);
    const closedSecond = registry.close(readerSessionId("attachment-2"));
    expect(closedSecond.activeTabId).toBe(readerSessionId("attachment-1"));
    expect(closedSecond.activeSession?.lifecycle).toBe("active");
    expect(closedSecond.close(readerSessionId("attachment-1")).activeTabId).toBe(LIBRARY_TAB_ID);
  });

  it("creates a fresh active session when a closed attachment is reopened", () => {
    const input = sessionInput("paper-1", "attachment-1");
    const closed = new ReaderSessionRegistry().open(input).close(readerSessionId("attachment-1"));
    const reopened = closed.open(input);

    expect(reopened.sessions).toHaveLength(1);
    expect(reopened.activeSession).toMatchObject({
      id: readerSessionId("attachment-1"),
      lifecycle: "active",
      navigationRequestId: 2,
    });
  });

  it("closes every attachment for a trashed item without disturbing another active item", () => {
    const registry = new ReaderSessionRegistry()
      .open(sessionInput("paper-1", "attachment-1"))
      .open(sessionInput("paper-2", "attachment-2"));
    const next = registry.closeForItem("paper-1");
    expect(next.sessions.map((session) => session.item.id)).toEqual(["paper-2"]);
    expect(next.activeTabId).toBe(readerSessionId("attachment-2"));
    expect(next.closeForItem("paper-2").activeTabId).toBe(LIBRARY_TAB_ID);
  });
});
