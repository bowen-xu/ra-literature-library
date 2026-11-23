import type { LiteratureItem } from "@research-assistant/core/literature";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLiteratureGateway, literatureItemMatchesQuery } from "./literatureGateway";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", { localStorage: storage });
});

const item: LiteratureItem = {
  id: "item-1",
  itemType: "journalArticle",
  title: "JaxLife: An Open-Ended Agentic Simulator",
  abstractText: "",
  issuedYear: 2024,
  containerTitle: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "10.1000/JAXLIFE",
  url: "",
  language: "",
  bibtexKey: "JaxLife2024",
  creators: [{ familyName: "Lu", givenName: "Chris", literalName: "", role: "author" }],
  tags: ["Agentic AI"],
  readingStatus: "unread",
  attachments: [],
  projectIds: [],
  metadataSources: [],
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};

describe("literature browser search", () => {
  it("matches only titles, creators, and years without case sensitivity", () => {
    expect(literatureItemMatchesQuery(item, "jaxlife")).toBe(true);
    expect(literatureItemMatchesQuery(item, "JAXLIFE")).toBe(true);
    expect(literatureItemMatchesQuery(item, "CHRIS")).toBe(true);
    expect(literatureItemMatchesQuery(item, "LU")).toBe(true);
    expect(literatureItemMatchesQuery(item, "2024")).toBe(true);
    expect(literatureItemMatchesQuery(item, "10.1000")).toBe(false);
    expect(literatureItemMatchesQuery(item, "agentic ai")).toBe(false);
  });
});

describe("browser-only attachment actions", () => {
  it("renames and removes only an exact attachment without changing content identity or its parent", async () => {
    const attachments = ["one", "two"].map(id => ({id,displayName:`${id}.pdf`,mimeType:"application/pdf",byteSize:12,contentSha256:id.repeat(64).slice(0,64)}));
    storage.setItem("research-assistant.literature.v1", JSON.stringify([{...item,attachments}]));
    const gateway = getLiteratureGateway();
    await gateway.renameAttachment(item.id, "two", "  自定义.pdf  ");
    const renamed = await gateway.get(item.id);
    expect(renamed.attachments).toEqual([attachments[0], {...attachments[1],displayName:"自定义.pdf"}]);
    await expect(gateway.renameAttachment("wrong", "two", "wrong.pdf")).rejects.toThrow("not_found");
    await expect(gateway.renameAttachment(item.id, "two", "\n")).rejects.toThrow("attachment_name_invalid");
    await expect(gateway.removeAttachment("wrong", "two")).rejects.toThrow("not_found");
    await gateway.removeAttachment(item.id, "two");
    expect((await gateway.get(item.id)).attachments).toEqual([attachments[0]]);
    expect((await gateway.get(item.id)).title).toBe(item.title);
  });
  it("does not pretend that Finder reveal is available", async () => {
    await expect(getLiteratureGateway().revealAttachments(["attachment-1"]))
      .rejects.toThrow("只在 Tauri 桌面模式中可用");
  });

  it("round-trips the complete ReaderViewStateV2 per attachment", async () => {
    const gateway = getLiteratureGateway();
    const viewState = {
      schemaVersion: 2 as const,
      pageIndex: 7,
      scale: { kind: "page-width" as const },
      top: 511,
      left: 13,
      scrollMode: "vertical" as const,
      spreadMode: "none" as const,
    };
    await gateway.saveReadingState("paper-1", "attachment-1", viewState);
    expect(await gateway.getReadingState("paper-1", "attachment-1")).toEqual(viewState);
    expect(await gateway.getReadingState("paper-1", "attachment-2")).toBeUndefined();
  });
});

describe("browser metadata confirmation", () => {
  it("confirms a tracked field without replacing its source kind", async () => {
    const gateway = getLiteratureGateway();
    const { id: _id, ...draft } = item;
    const saved = await gateway.save({ ...draft, sourceKind: "crossref" });
    const updated = await gateway.confirmMetadataFields(saved.id, ["doi"]);

    expect(updated.metadataSources.find((source) => source.fieldName === "doi")).toEqual({
      fieldName: "doi",
      sourceKind: "crossref",
      confirmedByUser: true,
    });
    expect(updated.metadataSources.find((source) => source.fieldName === "title")?.confirmedByUser)
      .toBe(false);
  });

  it("keeps an edited pending field reviewable until it is confirmed", async () => {
    const gateway = getLiteratureGateway();
    const { id: _id, ...draft } = item;
    const saved = await gateway.save({ ...draft, sourceKind: "crossref" });
    const updated = await gateway.updateMetadataField(saved.id, {
      fieldName: "title",
      value: "A revised title",
    });

    expect(updated.title).toBe("A revised title");
    expect(updated.metadataSources.find((source) => source.fieldName === "title")).toEqual({
      fieldName: "title",
      sourceKind: "user_edit",
      confirmedByUser: false,
    });
    expect(updated.metadataSources.find((source) => source.fieldName === "doi")).toEqual({
      fieldName: "doi",
      sourceKind: "crossref",
      confirmedByUser: false,
    });
  });
});
