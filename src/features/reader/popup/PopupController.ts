import {
  positionPdfSelectionPopover,
  type PdfSelectionPopoverPosition,
} from "@research-assistant/workbench-sdk/pdf-geometry";

export interface PopupControllerInput {
  readonly anchorElement: HTMLElement | undefined;
  readonly boundary: HTMLElement;
  readonly getAnchorClientRect: () => DOMRect | undefined;
  readonly getPreferredWidth?: () => number;
  readonly centerOnAnchor?: () => boolean;
  readonly getAnchorControlCenter?: () => number | undefined;
  readonly onPosition: (position: PdfSelectionPopoverPosition | undefined) => void;
  readonly onRestoreFocus: () => void;
  readonly popup: HTMLElement;
  readonly workspace: HTMLElement;
}

export class PopupController {
  #input: PopupControllerInput | undefined;
  #frame: number | undefined;
  #resizeObserver: ResizeObserver | undefined;
  #returnFocus: HTMLElement | undefined;

  open(input: PopupControllerInput): void {
    this.close(false);
    this.#input = input;
    const activeElement = window.document.activeElement;
    this.#returnFocus = activeElement instanceof HTMLElement && activeElement !== window.document.body
      ? activeElement
      : undefined;
    this.#resizeObserver = new ResizeObserver(this.schedule);
    if (input.anchorElement !== undefined) this.#resizeObserver.observe(input.anchorElement);
    this.#resizeObserver.observe(input.boundary);
    this.#resizeObserver.observe(input.popup);
    this.#resizeObserver.observe(input.workspace);
    input.boundary.addEventListener("scroll", this.schedule, { passive: true });
    window.addEventListener("resize", this.schedule);
    this.schedule();
  }

  close(restoreFocus = true): void {
    const input = this.#input;
    if (input !== undefined) {
      input.boundary.removeEventListener("scroll", this.schedule);
      window.removeEventListener("resize", this.schedule);
    }
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    if (this.#frame !== undefined) window.cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    this.#input = undefined;
    input?.onPosition(undefined);
    if (restoreFocus && input !== undefined) {
      if (this.#returnFocus?.isConnected === true) this.#returnFocus.focus({ preventScroll: true });
      else input.onRestoreFocus();
    }
    this.#returnFocus = undefined;
  }

  readonly schedule = (): void => {
    if (this.#frame !== undefined) return;
    this.#frame = window.requestAnimationFrame(() => {
      this.#frame = undefined;
      this.#updatePosition();
    });
  };

  #updatePosition(): void {
    const input = this.#input;
    const anchor = input?.getAnchorClientRect();
    if (input === undefined || anchor === undefined) {
      input?.onPosition(undefined);
      return;
    }
    const boundaryRect = input.boundary.getBoundingClientRect();
    const workspaceRect = input.workspace.getBoundingClientRect();
    input.popup.style.width = `${Math.max(0, Math.min(input.getPreferredWidth?.() ?? 380, boundaryRect.width - 20))}px`;
    input.popup.style.maxHeight = `${Math.max(0, boundaryRect.height - 20)}px`;
    const controlCenter = input.getAnchorControlCenter?.();
    const clientPosition = positionPdfSelectionPopover({
      anchor,
      boundary: boundaryRect,
      popup: { width: input.popup.offsetWidth, height: input.popup.offsetHeight },
      centerOnAnchor: input.centerOnAnchor?.() ?? false,
      ...(controlCenter === undefined ? {} : { anchorControlCenter: controlCenter }),
    });
    input.onPosition({
      left: clientPosition.left - workspaceRect.left - input.workspace.clientLeft,
      top: clientPosition.top - workspaceRect.top - input.workspace.clientTop,
      placement: clientPosition.placement,
    });
  }
}
