import type { AttachmentSummary, LiteratureItem, SourceRect } from "@research-assistant/core/literature";
import type { DoclingParserGateway, DoclingOverlayItem } from "@research-assistant/workbench-sdk/docling";
import type { PdfPendingSelection } from "../../knowledge/PdfSelectionActions";

export type SelectionDoclingContext = {
  readonly state: "available"; readonly parseRunId: string; readonly parseStatus: "success" | "partial_success";
  readonly blocks: readonly { readonly ref: string; readonly kind: string; readonly regions: DoclingOverlayItem["regions"]; readonly content: Readonly<Record<string, unknown>> }[];
} | { readonly state: "unavailable"; readonly reason: "notParsed" | "noMatchingBlocks" | "budget" | "readFailed" };

function intersects(left: SourceRect, right: SourceRect): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width
    && left.y < right.y + right.height && right.y < left.y + left.height;
}

function itemAt(document: unknown, reference: string): Readonly<Record<string, unknown>> | undefined {
  if (!reference.startsWith("#/")) return undefined;
  let value = document;
  for (const key of reference.slice(2).split("/").map(key => key.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Read existing, exact-version parse data only; never trigger parsing or expand to the whole PDF. */
export async function selectionDoclingContext(gateway: Pick<DoclingParserGateway, "listParseRuns" | "getParseRun" | "getPageOverlay">,
  item: Pick<LiteratureItem, "id">, attachment: Pick<AttachmentSummary, "id" | "contentSha256">, selection: PdfPendingSelection): Promise<SelectionDoclingContext> {
  try {
    const runs = await gateway.listParseRuns(item.id);
    const run = runs.filter(run => run.itemId === item.id && run.attachmentId === attachment.id
      && run.contentSha256 === attachment.contentSha256 && (run.parseStatus === "success" || run.parseStatus === "partial_success"))
      .sort((left, right) => right.finishedAt.localeCompare(left.finishedAt) || right.id.localeCompare(left.id))[0];
    if (!run) return { state: "unavailable", reason: "notParsed" };
    const pages = [...new Set(selection.segments.map(segment => segment.pageIndex))];
    const [detail, overlays] = await Promise.all([gateway.getParseRun(run.id), Promise.all(pages.map(page => gateway.getPageOverlay(attachment.id, page, run.id)))]);
    if (detail.id !== run.id || detail.itemId !== item.id || detail.attachmentId !== attachment.id || detail.contentSha256 !== attachment.contentSha256
      || (detail.parseStatus !== "success" && detail.parseStatus !== "partial_success")) return { state: "unavailable", reason: "readFailed" };
    const blocks: Extract<SelectionDoclingContext, { state: "available" }>["blocks"][number][] = [];
    const seen = new Set<string>();
    for (const overlay of overlays) {
      if (overlay.attachmentId !== attachment.id || overlay.parseRunId !== run.id || !pages.includes(overlay.pageIndex)) return { state: "unavailable", reason: "readFailed" };
      for (const block of overlay.items) {
        const matches = block.regions.some(region => selection.segments.some(segment => segment.pageIndex === region.pageIndex && segment.rects.some(rect => intersects(rect, region.rect))));
        if (!matches || seen.has(block.rawRef)) continue;
        const raw = itemAt(detail.jsonContent, block.rawRef);
        if (!raw) return { state: "unavailable", reason: "readFailed" };
        // Keep text, table cells and provenance; binary images and local image URIs stay local.
        const content: Record<string, unknown> = {};
        for (const key of ["self_ref", "label", "text", "prov", "captions", "children"]) if (Object.hasOwn(raw, key)) content[key] = raw[key];
        if (block.rawRef.startsWith("#/tables/") && Object.hasOwn(raw, "data")) content.data = raw.data;
        blocks.push({ ref: block.rawRef, kind: block.kind, regions: block.regions, content });
        seen.add(block.rawRef);
      }
    }
    if (!blocks.length) return { state: "unavailable", reason: "noMatchingBlocks" };
    if (blocks.length > 64 || new TextEncoder().encode(JSON.stringify(blocks, null, 2)).length > 32 * 1024) return { state: "unavailable", reason: "budget" };
    return { state: "available", parseRunId: run.id, parseStatus: detail.parseStatus, blocks };
  } catch { return { state: "unavailable", reason: "readFailed" }; }
}
