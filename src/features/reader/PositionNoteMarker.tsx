import { StickyNote } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SourceRect } from "@research-assistant/core/literature";
import type { ReadingNoteBlock } from "@research-assistant/core/notes";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { notify } from "@research-assistant/workbench-sdk/feedback";

export function PositionNoteMarker({ note, selected, getPageBounds, onSelect, onOpen, onMove, onContextMenu }: {
  readonly note: ReadingNoteBlock; readonly selected: boolean;
  readonly getPageBounds: () => DOMRect | undefined;
  readonly onSelect: () => void; readonly onOpen: () => void;
  readonly onContextMenu: () => void;
  readonly onMove: (position: SourceRect) => Promise<void>;
}): React.JSX.Element | null {
  const origin = note.source.rects[0];
  const [preview, setPreview] = useState<SourceRect>();
  const drag = useRef<{ pointerId: number; x: number; y: number; bounds: DOMRect; origin: SourceRect; moved: boolean } | undefined>(undefined);
  const suppressClick = useRef(false), callbacks = useRef({ onMove }); callbacks.current = { onMove };
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 4) current.moved = true;
      if (current.moved) setPreview(position(event.clientX, event.clientY));
    };
    function position(x: number, y: number): SourceRect | undefined {
      const current = drag.current; if (!current) return;
      return { ...current.origin, x: Math.max(0, Math.min(1 - current.origin.width, current.origin.x + (x - current.x) / current.bounds.width)),
        y: Math.max(0, Math.min(1 - current.origin.height, current.origin.y + (y - current.y) / current.bounds.height)) };
    }
    const end = (event: PointerEvent): void => {
      const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
      const next = position(event.clientX, event.clientY);
      drag.current = undefined; setPreview(undefined);
      suppressClick.current = current.moved;
      if (event.type !== "pointercancel" && current.moved && next) void callbacks.current.onMove(next).catch(reason => notify.error(reason instanceof Error ? reason.message : String(reason)));
    };
    const cancel = (event: KeyboardEvent): void => { if (event.key === "Escape" && drag.current) { event.preventDefault(); drag.current = undefined; setPreview(undefined); suppressClick.current = true; } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end); window.addEventListener("keydown", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); window.removeEventListener("keydown", cancel); };
  }, []);
  if (!origin) return null;
  const rect = preview ?? origin;
  return <ControlHint content={note.body || "拖动便签移动位置，双击打开笔记"}><button type="button" className={`saved-position-note${preview ? " is-dragging" : ""}`} aria-label={`位置便签 · 第 ${note.source.pageLabel ?? note.source.pageIndex + 1} 页`} aria-pressed={selected}
    style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, "--position-note-color": note.color } as CSSProperties}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const bounds = getPageBounds(); if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      event.preventDefault(); event.stopPropagation(); onSelect(); suppressClick.current = false;
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, bounds, origin, moved: false };
    }}
    onClick={() => { if (suppressClick.current) suppressClick.current = false; else onSelect(); }} onDoubleClick={onOpen}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onSelect(); onContextMenu(); }}
    onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); onOpen(); }
      const direction = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }[event.key];
      if (!direction) return;
      event.preventDefault(); onSelect();
      const next = { ...origin, x: Math.max(0, Math.min(1 - origin.width, origin.x + direction[0]!)), y: Math.max(0, Math.min(1 - origin.height, origin.y + direction[1]!)) };
      void onMove(next).catch(reason => notify.error(reason instanceof Error ? reason.message : String(reason)));
    }}><StickyNote aria-hidden="true" size={24} /></button></ControlHint>;
}
