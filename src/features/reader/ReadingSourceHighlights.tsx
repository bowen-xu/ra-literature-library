import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { AttachmentSummary } from "@research-assistant/core/literature";
import type { PdfNormalizedRect } from "@research-assistant/core/pdf-view";
import type { ReaderSessionController } from "./session/ReaderSessionController";
import { readingFieldColor, type ReadingFieldSource } from "../ai/readingFieldSources";
import "./ReadingSourceHighlights.css";

interface ResolvedSource { readonly source: ReadingFieldSource; readonly rects: readonly PdfNormalizedRect[] }

/** A derived reading layer; it never saves notes or records a human evidence inspection. */
export function ReadingSourceHighlights({ sources, attachment, controller, active }: {
  readonly sources: readonly ReadingFieldSource[];
  readonly attachment: AttachmentSummary;
  readonly controller: Pick<ReaderSessionController, "subscribe" | "getSnapshot" | "resolveQuoteSelection">;
  readonly active: boolean;
}): React.JSX.Element {
  const reader = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [resolved, setResolved] = useState<readonly ResolvedSource[]>([]);
  const requests = useMemo(() => new Map<string, Promise<ResolvedSource | undefined>>(), [sources, attachment.id, attachment.contentSha256, controller]);
  useEffect(() => {
    let cancelled = false;
    if (!active || !reader.ready) { setResolved([]); return; }
    // Resolve only the visible page and its immediate neighbors, using the existing worker glyph store.
    const nearby = sources.filter(source => source.evidence.attachmentId === attachment.id
      && source.evidence.contentSha256 === attachment.contentSha256 && ["exact", "page_level"].includes(source.evidence.currentAnchorStatus)
      && source.evidence.validationStatus === "valid"
      && source.evidence.quoteExact !== "" && Math.abs(source.evidence.pageIndex - reader.pageIndex) <= 1
      && reader.pageHosts.some(host => host.pageIndex === source.evidence.pageIndex));
    async function resolve(): Promise<void> {
      const results = await Promise.all(nearby.map(source => {
        let request = requests.get(source.id);
        if (request === undefined) {
          const evidence = source.evidence;
          request = controller.resolveQuoteSelection(evidence.pageIndex, evidence.quoteExact, evidence.quotePrefix, evidence.quoteSuffix)
            .then(selection => selection === undefined ? undefined : { source, rects: selection.rects })
            .catch(() => undefined);
          requests.set(source.id, request);
        }
        return request;
      }));
      if (!cancelled) setResolved(results.filter((value): value is ResolvedSource => value !== undefined));
    }
    void resolve();
    return () => { cancelled = true; };
  }, [active, sources, attachment.id, attachment.contentSha256, controller, reader.ready, reader.pageIndex, reader.pageHosts, requests]);
  return <>{reader.pageHosts.map(host => createPortal(<>
    {resolved.filter(value => active && reader.ready && sources.includes(value.source)
      && value.source.evidence.attachmentId === attachment.id && value.source.evidence.contentSha256 === attachment.contentSha256
      && value.source.evidence.pageIndex === host.pageIndex).flatMap(({ source, rects }) => rects.map((rect, index) =>
      <span key={`${source.id}:${index}`} aria-hidden="true" className="reading-source-highlight" data-reading-field={source.fieldId}
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: readingFieldColor(source.fieldId, source.color) }} />))}
  </>, host.element))}</>;
}
