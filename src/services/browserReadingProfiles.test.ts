// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserKnowledgeStorage } from "./browserKnowledgeStorage";
import {
  getBrowserPaperProfileSelection,
  saveBrowserPaperProfileSelection,
} from "./browserReadingProfiles";

describe("browser reading profile selection", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    browserKnowledgeStorage.writeProfileSelections([]);
  });

  it("defaults to an unpersisted unspecified selection", () => {
    expect(getBrowserPaperProfileSelection("paper")).toEqual({
      paperId: "paper",
      profiles: [],
      revision: 0,
      isPersisted: false,
    });
  });

  it("persists and restores an explicit unspecified selection", () => {
    const saved = saveBrowserPaperProfileSelection({
      paperId: "paper",
      profiles: [],
      expectedRevision: 0,
      changeReason: "manual_profile_confirmation",
    });
    expect(saved.profiles).toEqual([]);
    expect(saved.isPersisted).toBe(true);
    expect(saved.revision).toBe(1);
    expect(getBrowserPaperProfileSelection("paper")).toEqual(saved);
  });
});
