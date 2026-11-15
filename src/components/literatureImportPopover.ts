import type { ImportPanel } from "./literatureWorkspaceModel";

export interface ImportPopoverAnchor {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface ImportPopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface ImportPopoverViewport {
  readonly width: number;
  readonly height: number;
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

const PANEL_WIDTHS: Record<Exclude<ImportPanel, undefined>, number> = {
  pdf: 1040,
  bibtex: 720,
  doi: 560,
  manual: 720,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateImportPopoverPosition(
  panel: Exclude<ImportPanel, undefined>,
  anchor: ImportPopoverAnchor,
  viewport: ImportPopoverViewport,
  panelHeight = 0,
): ImportPopoverPosition {
  const width = Math.min(PANEL_WIDTHS[panel], Math.max(280, viewport.width - VIEWPORT_MARGIN * 2));
  const desiredLeft = panel === "pdf" ? VIEWPORT_MARGIN : anchor.left - 28;
  const left = clamp(desiredLeft, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN));
  const below = anchor.bottom + ANCHOR_GAP;
  const above = anchor.top - panelHeight - ANCHOR_GAP;
  const top = panelHeight > 0 && below + panelHeight > viewport.height - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
    ? above
    : below;
  return { left, top, width };
}
