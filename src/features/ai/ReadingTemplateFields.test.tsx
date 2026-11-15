// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PortraitTemplateField } from "@research-assistant/core/ai";
import { ReadingTemplateFields } from "./ReadingTemplateFields";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let dispose: (() => Promise<void>) | undefined;
afterEach(async () => { await dispose?.(); document.body.innerHTML = ""; vi.restoreAllMocks(); });
async function setup(reject = false) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  dispose = () => act(async () => root.unmount());
  const onChange = vi.fn();
  function Shell() {
    const [fields, setFields] = useState<readonly PortraitTemplateField[]>([
      { id: "a", title: "研究问题", question: "问题的范围", color: "#4b8e62", claimIds: [] },
      { id: "b", title: "方法", question: "采用的方法", color: "#4b82b2", claimIds: [] },
      { id: "c", title: "结果", question: "主要结果", color: "#b48738", claimIds: [] },
    ]);
    return <ReadingTemplateFields fields={fields} disabled={false} onChange={next => { onChange(next); if (reject) return false; setFields(next); return true; }} />;
  }
  await act(async () => root.render(<Shell />));
  const group = host.querySelector(".reorder-group")!;
  const rows = new Map([...group.children].map(row => [(row as HTMLElement).dataset.reorderId!, row as HTMLElement]));
  for (const row of rows.values()) {
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, [...group.children].indexOf(row) * 40, 320, 32));
    Object.defineProperty(row, "animate", { value: vi.fn(() => ({ cancel: vi.fn() })) });
  }
  return { host, rows, onChange, order: () => [...group.children].map(row => (row as HTMLElement).dataset.reorderId),
    pointer: (target: Element | Window, type: string, y: number) => act(async () => { target.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientY: y, bubbles: true })); }) };
}

it("uses shared boundary reordering while retaining field identity, color, editing and keyboard order", async () => {
  const f = await setup(), source = f.rows.get("a")!;
  await f.pointer(source.querySelector(".portrait-template-drag")!, "pointerdown", 10);
  await f.pointer(window, "pointermove", 41); // Boundary=36 +4px; before the next center at 56.
  expect(source.style.getPropertyValue("--reorder-y")).toBe("40px");
  await f.pointer(window, "pointerup", 41);
  expect(f.order()).toEqual(["b", "a", "c"]);
  expect(f.host.querySelector('[data-reorder-id="a"]')).toBe(source);
  expect(f.onChange).toHaveBeenCalledOnce();
  expect(f.onChange.mock.calls[0]![0].map((field: PortraitTemplateField) => [field.id, field.color])).toEqual([["b", "#4b82b2"], ["a", "#4b8e62"], ["c", "#b48738"]]);
  await act(async () => source.querySelector<HTMLButtonElement>('[aria-label="编辑研究问题"]')!.click());
  expect(source.querySelector<HTMLInputElement>('[aria-label="结构标题"]')?.value).toBe("研究问题");
  await act(async () => source.querySelector(".portrait-template-drag")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
  expect(f.order()).toEqual(["a", "b", "c"]);
});

it("keeps the original fields when the host rejects the reorder", async () => {
  const f = await setup(true);
  await f.pointer(f.rows.get("a")!.querySelector(".portrait-template-drag")!, "pointerdown", 10);
  await f.pointer(window, "pointermove", 41); await f.pointer(window, "pointerup", 41);
  expect(f.onChange).toHaveBeenCalledOnce(); expect(f.order()).toEqual(["a", "b", "c"]);
});
