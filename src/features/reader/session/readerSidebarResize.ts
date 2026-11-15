import type { PointerEvent as ReactPointerEvent } from "react";
import type { ReaderUiSessionState } from "@research-assistant/core/reader";

export function startReaderSidebarResize(
  side: "navigation" | "notes",
  event: ReactPointerEvent<HTMLDivElement>,
  uiSession: ReaderUiSessionState,
  updateUiSession: (update: (current: ReaderUiSessionState) => ReaderUiSessionState) => void,
): void {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = side === "navigation" ? uiSession.navigationSidebar.width : uiSession.notesSidebar.width;
  const move = (moveEvent: PointerEvent): void => {
    const difference = (moveEvent.clientX - startX) * (side === "navigation" ? 1 : -1);
    const minimum = side === "navigation" ? 140 : 220;
    const maximum = side === "navigation" ? 480 : 640;
    const width = Math.round(Math.max(minimum, Math.min(maximum, startWidth + difference)));
    updateUiSession((current) => side === "navigation"
      ? { ...current, navigationSidebar: { ...current.navigationSidebar, width } }
      : { ...current, notesSidebar: { ...current.notesSidebar, width } });
  };
  const stop = (): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
}
