import type { PdfSelection } from "@research-assistant/core/pdf-view";
import type { SourceRect } from "@research-assistant/core/literature";
export { isPositionReadingNote as isPositionNote } from "@research-assistant/core/notes";

export function positionNoteSelection(pageIndex: number, rect: SourceRect): PdfSelection {
  return { text: "", segments: [{ pageIndex, rects: [rect], text: "", prefix: "", suffix: "" }], focusPageIndex: pageIndex, focusRect: rect };
}
