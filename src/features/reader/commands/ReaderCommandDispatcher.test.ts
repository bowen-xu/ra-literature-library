import { describe, expect, it, vi } from "vitest";

import { dispatchReaderCommand } from "./ReaderCommandDispatcher";

const context = {
  platform: "macos" as const,
  activeLayer: "reader" as const,
  lifecycle: "active" as const,
  tool: "select" as const,
};

describe("ReaderCommandDispatcher", () => {
  it("runs button and keyboard invocations through the same enabled handler", () => {
    const handler = vi.fn();
    expect(dispatchReaderCommand("reader.zoom.in", context, { "reader.zoom.in": handler })).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not invoke disabled or unhandled commands", () => {
    const handler = vi.fn();
    expect(dispatchReaderCommand("reader.history.back", context, { "reader.history.back": handler })).toBe(false);
    expect(dispatchReaderCommand("reader.zoom.in", context, {})).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
