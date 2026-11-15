// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PaperPortraitSummary } from "./PaperPortraitSummary";
import type { PaperPortraitCandidateV1 } from "@research-assistant/core/ai";

it("keeps a missing portrait compact in its heading while retaining direct generation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const generate = vi.fn();
  const props = { payload: undefined, loading: false, failed: false, adopted: false, rejected: false, running: false, buttonRef: null, onOpen: vi.fn(), onGenerate: generate, generateDisabled: false };
  try {
    await act(async () => root.render(<PaperPortraitSummary {...props} />));
    expect(host.querySelector("h3")?.textContent).toBe("文献画像（待生成）");
    expect(host.querySelector("p")).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="生成画像"]')!.click());
    expect(generate).toHaveBeenCalledOnce();
    await act(async () => root.render(<PaperPortraitSummary {...props} loading />));
    expect(host.querySelector("h3")?.textContent).toBe("文献画像");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("正在读取");
    await act(async () => root.render(<PaperPortraitSummary {...props} running generateDisabled />));
    expect(host.querySelector("h3")?.textContent).toBe("文献画像");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("正在生成画像…");
    await act(async () => root.render(<PaperPortraitSummary {...props} running canceling generateDisabled />));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("正在取消画像生成…");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("replaces generation with a usable cancel icon, including regeneration of an existing portrait", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const cancel = vi.fn(), generate = vi.fn();
  const openConversation = vi.fn();
  const saved: PaperPortraitCandidateV1 = { kind: "paper_portrait_v1", schemaVersion: 1, coverage: "fixture", claims: [], template: [] };
  const props = { loading: false, failed: false, adopted: false, rejected: false, running: true, buttonRef: null,
    onOpen: vi.fn(), onGenerate: generate, onCancel: cancel, onOpenConversation: openConversation, generateDisabled: true };
  try {
    for (const payload of [undefined, saved]) {
      await act(async () => root.render(<PaperPortraitSummary {...props} payload={payload}/>));
      const button = host.querySelector<HTMLButtonElement>('[aria-label="取消生成"]')!;
      expect(button.disabled).toBe(false);
      expect(button.querySelector("svg.lucide-x")).not.toBeNull();
      expect(host.querySelector('[aria-label="生成画像"]')).toBeNull();
      await act(async () => button.click());
      const conversation = host.querySelector<HTMLButtonElement>('[aria-label="打开画像内部对话"]')!;
      expect(conversation.disabled).toBe(false);
      await act(async () => conversation.click());
    }
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(openConversation).toHaveBeenCalledTimes(2);
    expect(generate).not.toHaveBeenCalled();
    await act(async () => root.render(<PaperPortraitSummary {...props} payload={undefined} canceling/>));
    const pending = host.querySelector<HTMLButtonElement>('[aria-label="取消生成"]')!;
    expect(pending.disabled).toBe(true);
    await act(async () => pending.click());
    expect(cancel).toHaveBeenCalledTimes(2);
    await act(async () => root.render(<PaperPortraitSummary {...props} payload={saved} running={false}/>));
    expect(host.querySelector('[aria-label="取消生成"], [aria-label="生成画像"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
