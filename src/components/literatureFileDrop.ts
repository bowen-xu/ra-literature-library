import type { LiteratureItem } from "@research-assistant/core/literature";

export type LiteratureFileDropTarget =
  | { readonly kind: "item"; readonly item: LiteratureItem; readonly area: "row" | "detail" }
  | { readonly kind: "standalone"; readonly area: "list" | "detail" }
  | { readonly kind: "blocked" };

/** Only the visible literature list and detail pane own file ingress. A portal,
 * reader, toolbar or another workspace must never inherit a selection target. */
export function resolveLiteratureFileDropTarget(
  root: HTMLElement,
  element: Element | null,
  items: readonly LiteratureItem[],
  selected: LiteratureItem | undefined,
  isTrash: boolean,
): LiteratureFileDropTarget | undefined {
  if (!element || !root.contains(element)) return undefined;
  const zone = element.closest<HTMLElement>("[data-literature-drop-zone]");
  if (!zone || !root.contains(zone)) return undefined;
  if (isTrash) return { kind: "blocked" };
  if (zone.dataset.literatureDropZone === "detail") {
    return selected ? { kind: "item", item: selected, area: "detail" } : { kind: "standalone", area: "detail" };
  }
  const row = element.closest<HTMLElement>("[data-literature-drop-item]");
  if (row && zone.contains(row)) {
    const item = items.find(value => value.id === row.dataset.literatureDropItem);
    return item ? { kind: "item", item, area: "row" } : { kind: "blocked" };
  }
  return { kind: "standalone", area: "list" };
}

export function literatureFileDropLabel(target: LiteratureFileDropTarget): string {
  if (target.kind === "blocked") return "此处不能添加附件，请先返回文献列表或恢复文献";
  return target.kind === "item"
    ? `松开以添加到「${target.item.title}」的附件`
    : "松开以导入为独立文献 · 先检查 PDF 元数据";
}

/** Freeze item identity before the first asynchronous copy. Failures stay
 * attachments; they never fall through into standalone import. */
export async function attachDroppedLiteraturePdfs(
  itemId: string,
  paths: readonly string[],
  attach: (itemId: string, path: string) => Promise<unknown>,
): Promise<{ readonly added: number; readonly failures: readonly string[] }> {
  let added = 0;
  const failures: string[] = [];
  for (const path of [...new Set(paths)]) {
    try { await attach(itemId, path); added += 1; }
    catch (reason) {
      failures.push(`${path.split(/[\\/]/).pop()}: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }
  return { added, failures };
}
