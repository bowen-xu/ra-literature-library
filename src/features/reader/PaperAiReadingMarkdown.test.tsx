/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaperAiReadingMarkdown } from "./PaperAiReadingMarkdown";

describe("Paper AI reading Markdown", () => {
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
    vi.useRealTimers();
  });

  it("renders GFM, LaTeX, external links, and traceable source controls", async () => {
    const onJump = vi.fn();
    const value = [
      "## 结论",
      "",
      "结果来自 **正文** [P1-T3]，并见 [外部资料](https://example.com).",
      "",
      "| 指标 | 数值 |",
      "| --- | ---: |",
      "| accuracy | 0.91 |",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
      "`代码中的 [P1-F2] 不应跳转`",
    ].join("\n");

    await act(async () => root.render(<PaperAiReadingMarkdown onJump={onJump} value={value} />));

    expect(container.querySelector("h2")?.textContent).toBe("结论");
    expect(container.querySelector("table")?.textContent).toContain("accuracy");
    expect(container.querySelector(".katex-display")?.textContent).toContain("E=mc2");
    expect(container.querySelector('a[href="https://example.com"]')?.getAttribute("target")).toBe("_blank");
    const source = container.querySelector<HTMLButtonElement>(".paper-ai-reading-citation");
    expect(source?.textContent).toBe("[P1-T3]");
    await act(async () => source?.click());
    expect(onJump).toHaveBeenCalledWith("P1-T3");
    expect(container.querySelector("code")?.querySelector("button")).toBeNull();
  });

  it("paces bursty streaming text, heals incomplete block markup, and snaps to the final answer", async () => {
    vi.useFakeTimers();
    const onJump = vi.fn();
    await act(async () => root.render(<PaperAiReadingMarkdown
      onJump={onJump}
      streaming
      value=""
    />));

    const incompleteMath = ["## 结果", "", "$$", "E = mc^2"].join("\n");
    await act(async () => root.render(<PaperAiReadingMarkdown
      onJump={onJump}
      streaming
      value={incompleteMath}
    />));
    expect(container.textContent).not.toContain("结果");

    await act(async () => vi.advanceTimersByTime(24));
    expect(container.querySelector("h2")?.textContent).toBe("结果");
    expect(container.querySelector(".katex-display")?.textContent).toContain("E=mc2");
    const stableHeading = container.querySelector("h2");

    const burst = `${incompleteMath}\n$$\n\n${"streaming text ".repeat(80)}[P1-T3]`;
    await act(async () => root.render(<PaperAiReadingMarkdown
      onJump={onJump}
      streaming
      value={burst}
    />));
    await act(async () => vi.advanceTimersByTime(24));
    expect(container.textContent?.length ?? 0).toBeLessThan(burst.length);

    await act(async () => vi.runAllTimers());
    expect(container.querySelector(".paper-ai-reading-citation")?.textContent).toBe("[P1-T3]");
    expect(container.querySelector("h2")).toBe(stableHeading);

    const final = `${burst}\n\n最终完成。`;
    await act(async () => root.render(<PaperAiReadingMarkdown
      onJump={onJump}
      streaming={false}
      value={final}
    />));
    expect(container.textContent).toContain("最终完成。");
    expect(container.querySelector(".paper-ai-reading-assistant")?.getAttribute("aria-busy")).toBe("false");
  });
});
