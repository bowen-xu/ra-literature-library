import { beforeEach, describe, expect, it, vi } from "vitest";

import { listBrowserResearchRevisions } from "./browserResearchRevisionStore";
import { getEvidenceGateway } from "./evidenceGateway";

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

describe("browserEvidenceGateway", () => {
  it("rejects malformed claims without rewriting the stored research data", async () => {
    const browserEvidenceGateway = getEvidenceGateway();
    storage.setItem("research-assistant.claims.v2", JSON.stringify([
      { id: "claim-without-statement" },
    ]));
    const original = storage.getItem("research-assistant.claims.v2");
    await expect(browserEvidenceGateway.listClaims()).rejects.toThrow("原始记录未被修改");
    expect(storage.getItem("research-assistant.claims.v2")).toBe(original);
  });

  it("migrates legacy claim provenance and blocks stale overwrites", async () => {
    const browserEvidenceGateway = getEvidenceGateway();
    storage.setItem("research-assistant.claims.v1", JSON.stringify([{
      id: "legacy-ai", statement: "legacy", origin: "ai", evidenceCount: 2,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    }]));
    expect((await browserEvidenceGateway.listClaims())[0]).toEqual(expect.objectContaining({
      provenanceKind: "legacy_ai", revision: 1,
    }));
    const created = await browserEvidenceGateway.saveClaim({ statement: "人工观点", epistemicRole: "assertion" });
    const updated = await browserEvidenceGateway.saveClaim({
      id: created.id, statement: "人工修订", epistemicRole: "inference", expectedRevision: 1,
    });
    await expect(browserEvidenceGateway.saveClaim({
      id: created.id, statement: "迟到覆盖", epistemicRole: "assertion", expectedRevision: 1,
    })).rejects.toThrow("当前版本为 2");
    expect((await browserEvidenceGateway.listClaims()).find((claim) => claim.id === created.id))
      .toEqual(expect.objectContaining({ statement: "人工修订", revision: updated.revision }));
    expect(listBrowserResearchRevisions("claim", created.id)).toHaveLength(2);
  });
});
