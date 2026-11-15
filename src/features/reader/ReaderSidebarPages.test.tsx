// @vitest-environment happy-dom
import { act, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ReaderSidebarPages } from "./ReaderSidebarPages";

it("switches sidebar pages with the keyboard while retaining editors and independent scroll state", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const unmounted = vi.fn();
  function Editor() { const [body, setBody] = useState(""); useEffect(() => () => unmounted(), []); return <input aria-label="draft" value={body} onChange={event => setBody(event.target.value)} />; }
  try {
    await act(async () => root.render(<StrictMode><ReaderSidebarPages reading={<Editor />} notes={<p>Saved note</p>} /></StrictMode>));
    unmounted.mockClear();
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const panels = host.querySelectorAll<HTMLDivElement>('[role="tabpanel"]');
    expect(tabs[0]?.getAttribute("aria-label")).toBe("辅助阅读");
    expect(tabs[1]?.getAttribute("aria-label")).toBe("高亮与笔记");
    expect([...tabs].map(tab => tab.textContent)).toEqual(["", ""]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    const input = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(input, "Unfinished draft"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    panels[0]!.scrollTop = 80;
    await act(async () => tabs[1]!.click());
    expect(panels[0]!.hidden).toBe(true); expect(panels[1]!.hidden).toBe(false);
    panels[1]!.scrollTop = 40;
    await act(async () => { tabs[1]!.focus(); tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector("input")).toBe(input); expect(input.value).toBe("Unfinished draft");
    expect(panels[0]!.scrollTop).toBe(80); expect(panels[1]!.scrollTop).toBe(40); expect(unmounted).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
