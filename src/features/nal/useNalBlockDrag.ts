import {useBlockControlsRoot} from "@research-assistant/workbench-sdk/block-controls";
import { useEffect, useRef, type PointerEvent } from "react";
import { startBlockPointerDrag } from "@research-assistant/workbench-sdk/block-controls";
import { getEditorScrollContainer } from "@research-assistant/workbench-sdk/block-controls";
import { useBlockDragAutoScroll } from "@research-assistant/workbench-sdk/block-controls";
import { nalBlockDragDom } from "./nalBlockDragDom";

/** Sibling-only destinations are a query AST constraint, not a second gesture engine. */
export function useNalBlockDrag(ids: readonly string[], disabled: boolean, move: (from: number, to: number, focus: boolean) => void) {
  const surface = useBlockControlsRoot();
  const cancel = useRef<(() => void) | undefined>(undefined);
  const autoScroll = useBlockDragAutoScroll();
  const identity = ids.join("\0");
  useEffect(() => () => cancel.current?.(), [disabled, identity]);
  return (event: PointerEvent<HTMLButtonElement>, id: string): void => {
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    const source = event.currentTarget;
    const root = surface.current;
    if (!root) return;
    event.preventDefault(); event.stopPropagation(); cancel.current?.();
    source.focus({preventScroll:true});
    const from = ids.indexOf(id);
    const destination = (target: {readonly blockId: string; readonly placement: string}): number => {
      const at = ids.indexOf(target.blockId);
      if (at < 0 || target.placement === "inside" || target.blockId === id) return -1;
      const insertion = at + (target.placement === "after" ? 1 : 0);
      return insertion - (from < insertion ? 1 : 0);
    };
    cancel.current = startBlockPointerDrag(source, root, event.nativeEvent, {
      sourceIds: [id], canDrop: target => destination(target) >= 0 && destination(target) !== from,
      move: target => move(from, destination(target), true),
      onActivate: () => {
        root.dataset.blockDragging = "true";
        const container = getEditorScrollContainer(root);
        if (container) autoScroll.start(container);
      },
      onFinish: () => { delete root.dataset.blockDragging; autoScroll.stop(); },
    }, {...nalBlockDragDom, middlePlacement: content => {
      const target = nalBlockDragDom.contentId(root, content);
      return target !== undefined && ids.indexOf(target) > from ? "after" : "before";
    }});
  };
}
