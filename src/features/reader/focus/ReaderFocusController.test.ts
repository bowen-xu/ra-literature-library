// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { ReaderFocusController } from "./ReaderFocusController";

describe("ReaderFocusController", () => {
  it("identifies nested focus owners and moves focus within a named group", () => {
    const workspace = document.createElement("div");
    workspace.innerHTML = `
      <header data-reader-focus-group="toolbar"><button>Zoom</button></header>
      <main data-reader-focus-group="view" tabindex="0"><span>PDF</span></main>
      <aside data-reader-focus-group="notes-sidebar"><textarea></textarea></aside>
    `;
    document.body.append(workspace);
    const controller = new ReaderFocusController(() => workspace);
    const textarea = workspace.querySelector("textarea");
    expect(controller.ownerForTarget(textarea)).toBe("notes-sidebar");
    expect(controller.focus("view")).toBe(true);
    expect(document.activeElement).toBe(workspace.querySelector("main"));
    workspace.remove();
  });
});
