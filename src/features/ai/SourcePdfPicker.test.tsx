// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentSummary } from "@research-assistant/core/literature";
import { SourcePdfPicker } from "./SourcePdfPicker";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const attachments: readonly AttachmentSummary[] = [
  { id: "pdf-1", displayName: "A very long primary paper filename that must remain inside the detail panel.pdf", mimeType: "application/pdf", byteSize: 2 * 1024 * 1024, contentSha256: "a".repeat(64) },
  { id: "pdf-2", displayName: "Supplementary methods.pdf", mimeType: "application/pdf", byteSize: 512 * 1024, contentSha256: "b".repeat(64) },
];
let container: HTMLDivElement, root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function settle(): Promise<void> { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
describe("SourcePdfPicker", () => {
  it("adds one attachment and closes after transient blur without checkbox selection", async () => {
    const onSelectionChange = vi.fn();
    await act(async () => root.render(<StrictMode><SourcePdfPicker attachments={attachments} busy={false} onOpen={vi.fn()} onSelectionChange={onSelectionChange} selectedAttachmentIds={["pdf-1"]} /></StrictMode>));
    const trigger = container.querySelector<HTMLButtonElement>(".source-pdf-trigger")!;
    expect(container.querySelectorAll(".source-pdf-tag")).toHaveLength(1);
    await act(async () => trigger.click()); await settle();
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    const added = document.querySelector<HTMLButtonElement>(`[aria-label="添加 ${attachments[0]!.displayName}"]`)!;
    expect(added.disabled).toBe(true);
    const add = document.querySelector<HTMLButtonElement>(`[aria-label="添加 ${attachments[1]!.displayName}"]`)!;
    await act(async () => { add.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })); add.dispatchEvent(new FocusEvent("blur", { bubbles: true, relatedTarget: null })); add.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 })); add.click(); }); await settle();
    expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith(["pdf-1", "pdf-2"]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
  it("uses a jump icon only for other PDFs and restores focus after Escape", async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(<StrictMode><SourcePdfPicker attachments={attachments} currentAttachmentId="pdf-1" busy={false} onOpen={onOpen} onSelectionChange={vi.fn()} selectedAttachmentIds={["pdf-1", "pdf-2"]} /></StrictMode>));
    expect(container.querySelector(`button[aria-label="跳转到 ${attachments[0]!.displayName}"]`)).toBeNull();
    const jump = container.querySelector<HTMLButtonElement>(`.source-pdf-tag-name[aria-label="跳转到 ${attachments[1]!.displayName}"]`)!;
    expect(jump.querySelector(".lucide-arrow-up-right")).not.toBeNull();
    await act(async () => jump.click()); expect(onOpen).toHaveBeenCalledExactlyOnceWith(attachments[1]);
    const trigger = container.querySelector<HTMLButtonElement>(".source-pdf-trigger")!;
    await act(async () => trigger.click()); await settle();
    expect(document.querySelector(`.source-pdf-open-action[aria-label="跳转到 ${attachments[0]!.displayName}"]`)).toBeNull();
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))); await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(trigger);
  });
  it("supports keyboard activation and navigation without adding already selected files", async () => {
    const changed = vi.fn();
    await act(async () => root.render(<StrictMode><SourcePdfPicker attachments={attachments} busy={false} onOpen={vi.fn()} onSelectionChange={changed} selectedAttachmentIds={["pdf-1"]} /></StrictMode>));
    const trigger = container.querySelector<HTMLButtonElement>(".source-pdf-trigger")!;
    await act(async () => { trigger.focus(); trigger.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })); }); await settle();
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu).not.toBeNull();
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }))); await settle();
    const add = document.querySelector<HTMLButtonElement>(`[aria-label="添加 ${attachments[1]!.displayName}"]`)!;
    await act(async () => { add.focus(); add.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })); }); await settle();
    expect(changed).toHaveBeenCalledExactlyOnceWith(["pdf-1", "pdf-2"]);
  });
  it("has an inert empty state and never exceeds the eight attachment limit", async () => {
    await act(async () => root.render(<SourcePdfPicker attachments={[]} busy={false} onOpen={vi.fn()} onSelectionChange={vi.fn()} selectedAttachmentIds={[]} />));
    expect(container.querySelector<HTMLButtonElement>(".source-pdf-trigger")?.disabled).toBe(true);
    expect(container.textContent).toContain("没有 PDF 附件");
    const many = Array.from({ length: 9 }, (_, i) => ({ ...attachments[0]!, id: `pdf-${i}`, displayName: `${i}.pdf` }));
    const changed = vi.fn();
    await act(async () => root.render(<SourcePdfPicker attachments={many} busy={false} onOpen={vi.fn()} onSelectionChange={changed} selectedAttachmentIds={many.slice(0, 8).map(a => a.id)} />));
    await act(async () => container.querySelector<HTMLButtonElement>(".source-pdf-trigger")!.click()); await settle();
    expect(document.querySelector<HTMLButtonElement>('[aria-label="添加 8.pdf"]')?.disabled).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });
});
