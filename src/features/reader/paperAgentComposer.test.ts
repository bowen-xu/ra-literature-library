import { describe, expect, it } from "vitest";
import { paperAgentComposerAction } from "./paperAgentComposer";

describe("paper agent composer key ownership", () => {
  const base = { activeTurn: true, hasText: true, speechIdle: true };

  it("uses Enter for same-turn steer", () => {
    expect(paperAgentComposerAction({ ...base, key: "Enter" })).toBe("steer");
  });

  it.each([false, true])("leaves ordinary Tab input unhandled, active=%s", activeTurn => {
    for (const shiftKey of [false, true]) {
      expect(paperAgentComposerAction({ ...base, activeTurn, key: "Tab", shiftKey })).toBe("none");
    }
  });

  it("uses Enter to start an idle turn and Escape to interrupt", () => {
    expect(paperAgentComposerAction({ ...base, key: "Enter", activeTurn: false })).toBe("send");
    expect(paperAgentComposerAction({ ...base, key: "Escape" })).toBe("interrupt");
  });

  it("does not claim keyboard ownership during IME or for incomplete input", () => {
    expect(paperAgentComposerAction({ ...base, key: "Enter", isComposing: true })).toBe("none");
    expect(paperAgentComposerAction({ ...base, key: "Enter", hasText: false })).toBe("none");
    expect(paperAgentComposerAction({ ...base, key: "Enter", speechIdle: false })).toBe("none");
    expect(paperAgentComposerAction({ ...base, key: "Enter", shiftKey: true })).toBe("none");
  });
});
