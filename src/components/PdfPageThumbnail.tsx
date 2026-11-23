import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { useEffect, useRef, useState } from "react";

export interface PdfThumbnailSource {
  readonly pageCount: number;
  renderThumbnail(pageNumber: number, canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<void>;
}

interface PdfPageThumbnailProps {
  readonly source: PdfThumbnailSource;
  readonly pageNumber: number;
  readonly active: boolean;
  readonly cacheRetained: boolean;
  readonly renderingEnabled?: boolean;
  readonly revision?: string | number;
  readonly onSelect: () => void;
}

export function PdfPageThumbnail({
  source,
  pageNumber,
  active,
  cacheRetained,
  renderingEnabled = true,
  revision = 0,
  onSelect,
}: PdfPageThumbnailProps): React.JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const rendered = useRef<{source: PdfThumbnailSource; pageNumber: number; revision: string | number} | undefined>(undefined);
  const [error, setError] = useState<string>();
  const cacheRetainedRef = useRef(cacheRetained);
  cacheRetainedRef.current = cacheRetained;
  const renderGeneration = useRef(0);

  useEffect(() => {
    if (cacheRetained) return;
    rendered.current = undefined;
    setIsRendered(false);
    releaseCanvas(canvasRef.current);
  }, [cacheRetained]);

  useEffect(() => {
    const button = buttonRef.current;
    if (button === null) return;
    if (typeof IntersectionObserver === "undefined") {
      // Without visibility observation, render only the selected page, never the whole document.
      setIsNearViewport(active);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.target === button) setIsNearViewport(entry.isIntersecting);
    }, {
      root: button.closest(".reader-navigation"),
      rootMargin: "200px 0px",
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active || !renderingEnabled) return;
    buttonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, renderingEnabled]);

  useEffect(() => {
    if (!cacheRetained || !isNearViewport || !renderingEnabled) return;
    const cached = rendered.current;
    if (cached?.source === source && cached.pageNumber === pageNumber && cached.revision === revision) return;
    const abortController = new AbortController();
    const generation = ++renderGeneration.current;
    rendered.current = undefined;
    setIsRendered(false);
    setError(undefined);
    const canvas = canvasRef.current;
    if (canvas !== null) {
      void source.renderThumbnail(pageNumber, canvas, abortController.signal)
        .then(() => {
          if (!abortController.signal.aborted) {
            rendered.current = { source, pageNumber, revision };
            setIsRendered(true);
          }
        }).catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          if (!abortController.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => {
          // A cancelled renderer can settle after eviction; do not leave a late bitmap allocated.
          if (abortController.signal.aborted && generation === renderGeneration.current && !cacheRetainedRef.current) releaseCanvas(canvas);
        });
    }
    return () => abortController.abort();
  }, [cacheRetained, isNearViewport, pageNumber, renderingEnabled, revision, source]);
  return (
    <ControlHint content={error === undefined ? undefined : `缩略图生成失败：${error}`}><button
      aria-label={`第 ${pageNumber} 页`}
      aria-selected={active}
      className={active ? "thumbnail active" : "thumbnail"}
      onClick={onSelect}
      ref={buttonRef}
      role="option"
      type="button"
    >
      <span className="thumbnail-preview">
        <canvas className={isRendered ? "" : "pending"} height={0} ref={canvasRef} width={0} />
        {!isRendered && <span aria-hidden="true" className="thumbnail-placeholder" />}
      </span>
      <span>{pageNumber}</span>
    </button></ControlHint>
  );
}

function releaseCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas === null) return;
  canvas.width = 0;
  canvas.height = 0;
}
