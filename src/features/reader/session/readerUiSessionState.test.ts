// @vitest-environment happy-dom

import { DEFAULT_READER_UI_SESSION_STATE } from "@research-assistant/core/reader";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadReaderUiSessionState,
  readerUiSessionStorageKey,
  saveReaderUiSessionState,
} from "./readerUiSessionState";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, value); }
}

const storage = new MemoryStorage();

describe("reader UI session persistence", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", { localStorage: storage });
  });

  it("keeps attachment sidebar preferences independent and rejects invalid widths", () => {
    const state = {
      ...DEFAULT_READER_UI_SESSION_STATE,
      navigationSidebar: { open: false, width: 240, view: "outline" as const },
    };
    saveReaderUiSessionState("attachment-a", state);
    expect(loadReaderUiSessionState("attachment-a")).toEqual(state);
    expect(loadReaderUiSessionState("attachment-b")).toEqual(DEFAULT_READER_UI_SESSION_STATE);
    window.localStorage.setItem(readerUiSessionStorageKey("attachment-c"), JSON.stringify({ ...state, notesSidebar: { open: true, width: 900 } }));
    expect(loadReaderUiSessionState("attachment-c")).toEqual(DEFAULT_READER_UI_SESSION_STATE);
  });
});
