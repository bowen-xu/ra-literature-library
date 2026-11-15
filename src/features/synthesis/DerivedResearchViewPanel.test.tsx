/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ResearchProject } from "@research-assistant/core/project";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/derivedViewGateway", () => ({
  getDerivedResearchViewGateway: () => ({ list: () => Promise.resolve([]) }),
}));

vi.mock("../../services/evidenceMatrixGateway", () => ({
  getEvidenceMatrixGateway: () => ({
    list: () => Promise.resolve([]),
    listCells: () => Promise.resolve([]),
  }),
}));

vi.mock("../../services/literatureGateway", () => ({
  getLiteratureGateway: () => ({ list: () => Promise.resolve([]) }),
}));

import { DerivedResearchViewPanel } from "./DerivedResearchViewPanel";

describe("DerivedResearchViewPanel refresh", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderPanel(refreshVersion: number): Promise<void> {
    await act(async () => root.render(<DerivedResearchViewPanel
      onAiRunStarted={() => undefined}
      onOpenSource={() => Promise.resolve()}
      project={{ id: "project" } as ResearchProject}
      refreshVersion={refreshVersion}
      sources={[]}
    />));
  }

  it("reloads accepted views without discarding an unsaved manual draft", async () => {
    await renderPanel(0);
    const newButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "＋ 新建人工派生视图");
    await act(async () => newButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const titleInput = [...container.querySelectorAll("input")]
      .find((input) => input.closest("label")?.textContent?.startsWith("标题"));
    expect(titleInput).toBeDefined();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(titleInput, "Unsaved human synthesis");
      titleInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await renderPanel(1);
    const refreshedTitle = [...container.querySelectorAll("input")]
      .find((input) => input.closest("label")?.textContent?.startsWith("标题"));
    expect(refreshedTitle?.value).toBe("Unsaved human synthesis");
  });

  it("keeps an unsaved manual draft when the user cancels clearing it", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    await renderPanel(0);
    const newButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "＋ 新建人工派生视图");
    await act(async () => newButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const titleInput = [...container.querySelectorAll("input")]
      .find((input) => input.closest("label")?.textContent?.startsWith("标题"));
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(titleInput, "Keep this draft");
      titleInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const clearButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "清空");
    await act(async () => clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(confirm).toHaveBeenCalledOnce();
    expect(titleInput?.value).toBe("Keep this draft");
  });
});
