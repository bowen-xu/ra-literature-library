// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { panelItem } from "../features/ai/paperOverviewTestFixtures";
import { LiteratureAttachmentRows } from "./LiteratureAttachmentRows";

it("expands independently of selection and opens or targets the exact child attachment", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const base = panelItem(); const first = base.attachments[0]!;
  const second = { ...first, id: "supplement", displayName: "supplement.pdf" };
  const item = { ...base, attachments: [first, second] }; const select = vi.fn(); const open = vi.fn(); const context = vi.fn();
  function Harness() {
    const [expanded, setExpanded] = useState(false);
    return <LiteratureAttachmentRows item={item} expanded={expanded} onExpandedChange={setExpanded} onOpen={open} onContextMenu={context}><button type="button" className="literature-row" onClick={select}>Parent</button></LiteratureAttachmentRows>;
  }
  try {
    await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
    const toggle = host.querySelector<HTMLButtonElement>(".literature-attachment-toggle")!;
    const children = host.querySelector<HTMLDivElement>(".literature-attachment-children")!;
    expect(children.hidden).toBe(true);
    await act(async () => toggle.click());
    expect(children.hidden).toBe(false); expect(select).not.toHaveBeenCalled();
    const child = host.querySelectorAll<HTMLButtonElement>(".literature-attachment-row")[1]!;
    await act(async () => child.click()); expect(open).toHaveBeenCalledWith(second);
    await act(async () => child.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    expect(context.mock.calls[0]?.[1]).toEqual(second); expect(select).not.toHaveBeenCalled();
    const parent = host.querySelector<HTMLButtonElement>(".literature-row")!;
    await act(async () => parent.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(children.hidden).toBe(true);
    await act(async () => parent.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(children.hidden).toBe(false); expect(select).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
