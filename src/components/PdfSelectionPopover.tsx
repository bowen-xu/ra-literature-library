import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  type PdfSelectionPopoverPosition,
} from "@research-assistant/workbench-sdk/pdf-geometry";
import { PopupController } from "../features/reader/popup/PopupController";
import { createPortal } from "react-dom";
import { useOverlayTarget } from "@research-assistant/workbench-sdk/overlay";

interface PdfSelectionPopoverProps {
  readonly active: boolean;
  readonly anchorElement: HTMLElement | undefined;
  readonly boundaryRef: RefObject<HTMLDivElement | null>;
  readonly children: ReactNode;
  readonly getAnchorClientRect: () => DOMRect | undefined;
  readonly onRestoreFocus: () => void;
  readonly compact?: boolean;
  readonly annotation?: boolean;
  readonly preferredWidth?: number;
  readonly centerOnAnchor?: boolean;
  readonly anchorControlCenter?: number;
  readonly workspaceRef: RefObject<HTMLDivElement | null>;
}

export function PdfSelectionPopover({
  active,
  anchorElement,
  boundaryRef,
  children,
  getAnchorClientRect,
  onRestoreFocus,
  compact = false,
  annotation = false,
  preferredWidth,
  centerOnAnchor = false,
  anchorControlCenter,
  workspaceRef,
}: PdfSelectionPopoverProps): React.JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null);
  const overlayTarget = useOverlayTarget("popup", workspaceRef);
  const [position, setPosition] = useState<PdfSelectionPopoverPosition>();
  const controller = useMemo(() => new PopupController(), []);
  const getAnchorRef = useRef(getAnchorClientRect);
  const restoreFocusRef = useRef(onRestoreFocus);
  const widthRef = useRef(380);
  const centerRef = useRef(centerOnAnchor);
  const controlCenterRef = useRef(anchorControlCenter);
  controlCenterRef.current = anchorControlCenter;
  centerRef.current = centerOnAnchor;
  widthRef.current = annotation ? 295 : preferredWidth ?? (compact ? 236 : 380);
  getAnchorRef.current = getAnchorClientRect;
  restoreFocusRef.current = onRestoreFocus;

  const acceptPosition = (nextPosition: PdfSelectionPopoverPosition | undefined): void => {
    setPosition((current) => current?.left === nextPosition?.left
      && current?.top === nextPosition?.top
      && current?.placement === nextPosition?.placement
      ? current
      : nextPosition);
  };

  useLayoutEffect(() => {
    if (!active) {
      setPosition(undefined);
      return;
    }
    const boundary = boundaryRef.current;
    const workspace = workspaceRef.current;
    const popover = popoverRef.current;
    if (boundary === null || workspace === null || popover === null) return;
    controller.open({
      anchorElement,
      boundary,
      getAnchorClientRect: () => getAnchorRef.current(),
      getPreferredWidth: () => widthRef.current,
      centerOnAnchor: () => centerRef.current,
      getAnchorControlCenter: () => controlCenterRef.current,
      onPosition: acceptPosition,
      onRestoreFocus: () => restoreFocusRef.current(),
      popup: popover,
      workspace,
    });
    return () => controller.close();
  }, [active, anchorElement, boundaryRef, controller, workspaceRef]);

  useLayoutEffect(() => controller.schedule(), [annotation, compact, preferredWidth, centerOnAnchor, anchorControlCenter, controller]);

  const workspaceBounds = workspaceRef.current?.getBoundingClientRect();
  return createPortal(
    <div
      className={active ? `reader-selection-popover${annotation ? " is-annotation" : ""}` : "selection-draft-state-host"}
      data-reader-focus-group={active ? "popup" : undefined}
      data-placement={active ? position?.placement : undefined}
      ref={popoverRef}
      style={active ? {
        position: "fixed",
        left: position === undefined ? undefined : position.left + (workspaceBounds?.left ?? 0) + (workspaceRef.current?.clientLeft ?? 0),
        top: position === undefined ? undefined : position.top + (workspaceBounds?.top ?? 0) + (workspaceRef.current?.clientTop ?? 0),
        visibility: position === undefined ? "hidden" : "visible",
      } : undefined}
    >
      {children}
    </div>, overlayTarget
  );
}
