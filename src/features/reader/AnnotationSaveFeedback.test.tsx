// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AnnotationSaveFeedback } from "./AnnotationSaveFeedback";

it("omits saved status while retaining pending feedback and actionable failure recovery", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const retry = vi.fn();
  try {
    for (const [state, text] of [["dirty", "有未保存更改"], ["saving", "正在保存…"], ["failed", "保存失败"], ["conflict", "版本冲突，需重试"], ["saved", ""]] as const) {
      await act(async () => root.render(<AnnotationSaveFeedback state={state} error="写入受阻" onRetry={retry} />));
      expect(host.textContent).toContain(text);
      if (state === "saved") expect(host.children).toHaveLength(0);
      else expect(host.querySelector("[aria-live=polite]")).not.toBeNull();
      if (state === "failed" || state === "conflict") {
        await act(async () => {
          host.querySelector("span")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          host.querySelector("span")!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        });
        await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("写入受阻"));
        await act(async () => host.querySelector("span")!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
        await act(async () => host.querySelector("button")!.click());
      } else expect(host.querySelector("button")).toBeNull();
    }
    expect(retry).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
