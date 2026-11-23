// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfSelectionPopover } from "./PdfSelectionPopover";

class TestResizeObserver implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

describe("PDF selection popover", () => {
  let anchor: HTMLDivElement;
  let boundary: HTMLDivElement;
  let container: HTMLDivElement;
  let root: Root;
  let workspace: HTMLDivElement;
  let anchorRect: DOMRect;
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = TestResizeObserver;
    workspace = document.createElement("div");
    boundary = document.createElement("div");
    anchor = document.createElement("div");
    container = document.createElement("div");
    workspace.append(boundary, anchor, container);
    document.body.append(workspace);
    root = createRoot(container);
    workspace.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 700);
    boundary.getBoundingClientRect = () => new DOMRect(100, 50, 800, 600);
    anchorRect = new DOMRect(400, 180, 60, 20);
    anchor.getBoundingClientRect = () => anchorRect;
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function offsetWidth(this: HTMLElement) {
      return this.classList.contains("reader-selection-popover") ? 320 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function offsetHeight(this: HTMLElement) {
      return this.classList.contains("reader-selection-popover") ? 180 : 0;
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    workspace.remove();
    globalThis.ResizeObserver = originalResizeObserver;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function renderPopover(annotation = false): Promise<HTMLDivElement> {
    await act(async () => root.render(
      <PdfSelectionPopover
        active
        annotation={annotation}
        anchorElement={anchor}
        boundaryRef={{ current: boundary }}
        getAnchorClientRect={() => anchorRect}
        onRestoreFocus={() => anchor.focus()}
        workspaceRef={{ current: workspace }}
      >
        <span>selection actions</span>
      </PdfSelectionPopover>,
    ));
    await act(async () => vi.runAllTimers());
    const popover = document.querySelector<HTMLDivElement>(".reader-selection-popover");
    if (popover === null) throw new Error("selection popover was not rendered");
    return popover;
  }

  it("flips and follows its anchor on scroll while remaining inside the reader boundary", async () => {
    const popover = await renderPopover();
    expect(popover.dataset.placement).toBe("below");
    expect(popover.style.top).toBe("208px");

    anchorRect = new DOMRect(400, 570, 60, 20);
    boundary.dispatchEvent(new Event("scroll"));
    await act(async () => vi.runAllTimers());
    expect(popover.dataset.placement).toBe("above");
    expect(popover.style.top).toBe("382px");

    anchorRect = new DOMRect(400, 720, 60, 20);
    boundary.dispatchEvent(new Event("scroll"));
    await act(async () => vi.runAllTimers());
    expect(popover.dataset.placement).toBe("above");
    expect(popover.style.top).toBe("460px");
  });

  it("restores focus to the previously focused reader control when it closes", async () => {
    anchor.tabIndex = 0;
    anchor.focus();
    await renderPopover();
    expect(document.activeElement).toBe(anchor);
    await act(async () => root.render(
      <PdfSelectionPopover
        active={false}
        anchorElement={anchor}
        boundaryRef={{ current: boundary }}
        getAnchorClientRect={() => anchorRect}
        onRestoreFocus={() => anchor.focus()}
        workspaceRef={{ current: workspace }}
      >
        <span>selection actions</span>
      </PdfSelectionPopover>,
    ));
    expect(document.activeElement).toBe(anchor);
  });
  it("resizes the same popup when switching between actions and annotation, respecting a narrow reader boundary",async()=>{
    const actions=await renderPopover();expect(actions.style.width).toBe("380px");
    const annotation=await renderPopover(true);expect(annotation.style.width).toBe("295px");
    expect(annotation.classList.contains("is-annotation")).toBe(true);
    boundary.getBoundingClientRect=()=>new DOMRect(100,50,250,600);
    boundary.dispatchEvent(new Event("scroll"));await act(async()=>vi.runAllTimers());
    expect(annotation.style.width).toBe("230px");
  });
});
