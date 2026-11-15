import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { useVisibleLayoutMeasurement } from "@research-assistant/workbench-sdk/layout";

const WIDTH_KEY = "research-assistant:nal-sidebar-width:v1";

function loadWidth(): number | null {
  try {
    const value: unknown = JSON.parse(getAppStorage().getItem(WIDTH_KEY) ?? "null");
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Keep the user's pixel preference separate from temporary viewport constraints. */
export function NalSidebarPane({ children }: { readonly children: ReactNode }) {
  const [preferredWidth, setPreferredWidth] = useState(loadWidth);
  const [size, setSize] = useState(() => ({ container: window.innerWidth, viewport: window.innerWidth }));
  const pane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const id = useId();
  const maximum = Math.floor(Math.min(480, size.container / 2));
  const minimum = Math.min(180, maximum);
  const clamp = (value: number) => Math.round(Math.max(minimum, Math.min(maximum, value)));
  const defaultWidth = size.viewport <= 800 ? 210 : Math.max(220, Math.min(300, size.viewport * 0.22));
  const width = clamp(preferredWidth ?? defaultWidth);

  useVisibleLayoutMeasurement(() => pane.current?.parentElement ?? null, (_element, bounds) => {
    setSize(previous => previous.container === bounds.width && previous.viewport === window.innerWidth
      ? previous : { container: bounds.width, viewport: window.innerWidth });
  });

  useEffect(() => {
    try {
      if (preferredWidth === null) getAppStorage().removeItem(WIDTH_KEY);
      else getAppStorage().setItem(WIDTH_KEY, JSON.stringify(preferredWidth));
    } catch {
      // Optional layout preferences must not block the library when storage is unavailable.
    }
  }, [preferredWidth]);

  return <div className="nal-sidebar-pane" id={id} ref={pane} style={{ flexBasis: width }}>
    {children}
    <ControlHint content="拖动调整宽度；方向键微调；双击恢复默认"><button className="literature-pane-resizer nal-sidebar-resizer" type="button" role="separator"
      aria-label="调整概念与关系栏宽度" aria-controls={id} aria-orientation="vertical"
      aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width} aria-valuetext={`${width} 像素`}
      onDoubleClick={() => setPreferredWidth(null)}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        setPreferredWidth(clamp(width + (event.key === "ArrowRight" ? 10 : -10)));
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.pointerId !== event.pointerId) return;
        event.preventDefault();
        setPreferredWidth(clamp(start.width + event.clientX - start.x));
      }}
      onPointerUp={event => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
    /></ControlHint>
  </div>;
}
