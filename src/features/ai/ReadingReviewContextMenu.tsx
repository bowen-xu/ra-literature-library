import { useState, type MouseEvent, type KeyboardEvent } from "react";
import { Undo2 } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";

/** Ariakit owns dismissal and keyboard navigation; the reading heading owns restored focus. */
export function useReadingReviewContextMenu({ disabled, onReset, label }: {
  readonly disabled: boolean;
  readonly onReset: () => void;
  readonly label: string;
}): {
  readonly onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  readonly onMenuKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly menu: React.JSX.Element | null;
} {
  const [anchor, setAnchor] = useState<{ x: number; y: number; target: HTMLElement }>();
  function close(): void { anchor?.target.focus(); setAnchor(undefined); }
  return {
    onContextMenu: event => { event.preventDefault(); event.stopPropagation(); setAnchor({ x: event.clientX, y: event.clientY, target: event.currentTarget }); },
    onMenuKeyDown: event => {
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect();
        setAnchor({ x: rect.left, y: rect.bottom, target: event.currentTarget });
      }
    },
    menu: anchor === undefined ? null : <div className="reading-review-context-anchor" style={{ left: anchor.x, top: anchor.y }}>
      <ActionMenu label={`${label}审核操作`} className="reading-review-context-menu" contentClassName="reading-action-menu" trigger={<span />} triggerClassName="reading-review-context-trigger" open setOpen={open => { if (!open) close(); }} autoFocusOnHide={false} portal>
        <ActionMenuItem disabled={disabled} onClick={onReset}><Undo2 size={14} aria-hidden="true" />恢复审核状态</ActionMenuItem>
      </ActionMenu>
    </div>,
  };
}
