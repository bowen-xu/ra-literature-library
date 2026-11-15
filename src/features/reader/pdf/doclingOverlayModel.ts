import type { DoclingOverlayItem, DoclingOverlayRect, DoclingPageOverlay } from "@research-assistant/workbench-sdk/docling";

export interface DoclingOverlayPoint {
  readonly x: number;
  readonly y: number;
}

export interface DoclingOverlayHit {
  readonly item: DoclingOverlayItem;
  readonly rect: DoclingOverlayRect;
}

export class DoclingOverlayRequestTracker {
  #generation = 0;
  readonly #pendingPages = new Set<number>();

  reset(): void {
    this.#generation += 1;
    this.#pendingPages.clear();
  }

  startPageRequest(pageIndex: number, cached: boolean): number | undefined {
    if (cached || this.#pendingPages.has(pageIndex)) return undefined;
    this.#pendingPages.add(pageIndex);
    return this.#generation;
  }

  finishPageRequest(pageIndex: number): void {
    this.#pendingPages.delete(pageIndex);
  }

  accepts(generation: number): boolean {
    return generation === this.#generation;
  }

  pendingPages(): readonly number[] {
    return [...this.#pendingPages].sort((left, right) => left - right);
  }
}

export function hitTestDoclingOverlay(
  overlay: DoclingPageOverlay | undefined,
  point: DoclingOverlayPoint,
): DoclingOverlayHit | undefined {
  if (overlay === undefined || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return undefined;

  for (const item of overlay.items) {
    for (const region of item.regions) {
      if (region.pageIndex !== overlay.pageIndex) continue;
      const rect = region.rect;
      if (
        point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height
      ) {
        return { item, rect };
      }
    }
  }
  return undefined;
}

export function doclingOverlayItemLabel(item: DoclingOverlayItem, pageLabel: string): string {
  const kind = readableDoclingKind(item.kind);
  const preview = item.textPreview?.trim();
  return preview === undefined || preview.length === 0
    ? `${kind} · 第 ${pageLabel} 页`
    : `${kind} · 第 ${pageLabel} 页 · ${preview}`;
}

function readableDoclingKind(kind: string): string {
  switch (kind) {
    case "paragraph":
      return "段落";
    case "section_header":
      return "标题";
    case "title":
      return "标题";
    case "table":
      return "表格";
    case "picture":
      return "图片";
    case "list_item":
      return "列表项";
    case "caption":
      return "图表说明";
    case "formula":
      return "公式";
    default:
      return kind.replaceAll("_", " ");
  }
}
