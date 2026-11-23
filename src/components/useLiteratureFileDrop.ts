import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import { subscribeWindowFileDrop } from "@research-assistant/workbench-sdk/library-capture";
import type { LiteratureItem } from "@research-assistant/core/literature";
import { isDesktopRuntime } from "@research-assistant/workbench-sdk/environment";
import { desktopDropClientPosition } from "@research-assistant/workbench-sdk/library-capture";
import type { LiteratureGateway } from "../public/literatureGateway";
import {
  attachDroppedLiteraturePdfs,
  literatureFileDropLabel,
  resolveLiteratureFileDropTarget,
  type LiteratureFileDropTarget,
} from "./literatureFileDrop";

interface LiteratureFileDropOptions {
  readonly enabled: boolean;
  readonly root: RefObject<HTMLElement | null>;
  readonly items: readonly LiteratureItem[];
  readonly selected: LiteratureItem | undefined;
  readonly isTrash: boolean;
  readonly gateway: LiteratureGateway;
  readonly reviewPdfPaths: (paths: readonly string[]) => void;
  readonly onAttached: (itemId: string) => Promise<void>;
  readonly onError: (message: string) => void;
  readonly onNotice: (message: string) => void;
  readonly onWarning: (message: string) => void;
}

export function useLiteratureFileDrop(options: LiteratureFileDropOptions) {
  const [target, setTarget] = useState<LiteratureFileDropTarget>();
  const current = useRef(options); current.current = options;

  function showTarget(next: LiteratureFileDropTarget | undefined): void {
    setTarget(previous => {
      if (previous?.kind !== next?.kind) return next;
      if (!previous || !next || previous.kind === "blocked" || next.kind === "blocked") return previous;
      if (previous.area !== next.area) return next;
      if (previous.kind === "item" && next.kind === "item" && previous.item !== next.item) return next;
      return previous;
    });
  }

  function resolve(element: Element | null): LiteratureFileDropTarget | undefined {
    const value = current.current;
    return value.enabled && value.root.current
      ? resolveLiteratureFileDropTarget(value.root.current, element, value.items, value.selected, value.isTrash)
      : undefined;
  }

  async function receive(paths: readonly string[], dropTarget: LiteratureFileDropTarget): Promise<void> {
    const value = current.current;
    if (dropTarget.kind === "blocked") { value.onWarning(literatureFileDropLabel(dropTarget)); return; }
    const pdfPaths = [...new Set(paths.filter(path => path.toLowerCase().endsWith(".pdf")))];
    if (paths.some(path => !path.toLowerCase().endsWith(".pdf"))) value.onWarning("仅支持 PDF 文件；非 PDF 文件未导入。");
    if (!pdfPaths.length) return;
    if (dropTarget.kind === "standalone") { value.reviewPdfPaths(pdfPaths); return; }
    const result = await attachDroppedLiteraturePdfs(dropTarget.item.id, pdfPaths,
      (id, path) => value.gateway.attachPdf(id, path));
    if (result.failures.length) value.onError(`PDF 附件添加失败：${result.failures.join("；")}`);
    if (result.added) {
      value.onNotice(`已为「${dropTarget.item.title}」添加 ${result.added} 个 PDF 附件`);
      await value.onAttached(dropTarget.item.id);
    }
  }

  useEffect(() => {
    if (!options.enabled) { setTarget(undefined); return; }
    if (!isDesktopRuntime()) return;
    let listening = true;
    let unlisten: (() => void) | undefined;
    void subscribeWindowFileDrop(event => {
      if (!listening) return;
      if (event.type === "leave") { setTarget(undefined); return; }
      const { x, y } = desktopDropClientPosition(event.position);
      const dropTarget = resolve(document.elementFromPoint(x, y));
      if (event.type !== "drop") { showTarget(dropTarget); return; }
      setTarget(undefined);
      if (dropTarget) void receive(event.paths, dropTarget).catch((reason: unknown) => {
        current.current.onError(reason instanceof Error ? reason.message : String(reason));
      });
    }).then(stop => { if (listening) unlisten = stop; else stop(); }).catch((reason: unknown) => {
      if (listening) current.current.onError(`无法监听文件拖放：${reason instanceof Error ? reason.message : String(reason)}`);
    });
    return () => { listening = false; unlisten?.(); };
  }, [options.enabled]);

  // The browser cannot supply trusted local paths to the desktop PDF gateway.
  // Still show the same target feedback and prevent the browser navigating away.
  function onDragOver(event: DragEvent<HTMLElement>): void {
    if (isDesktopRuntime() || !event.dataTransfer.types.includes("Files")) return;
    const dropTarget = resolve(event.target instanceof Element ? event.target : null);
    showTarget(dropTarget);
    if (!dropTarget) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: DragEvent<HTMLElement>): void {
    if (isDesktopRuntime() || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault(); setTarget(undefined);
    const dropTarget = resolve(event.target instanceof Element ? event.target : null);
    if (dropTarget) {
      current.current.onWarning(dropTarget.kind === "blocked" ? literatureFileDropLabel(dropTarget)
        : "请在桌面模式中拖入 PDF 文件；浏览器无法读取本机文件路径。");
    }
  }

  function onDragLeave(event: DragEvent<HTMLElement>): void {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTarget(undefined);
  }

  return { target: options.enabled ? target : undefined, onDragOver, onDrop, onDragLeave };
}
