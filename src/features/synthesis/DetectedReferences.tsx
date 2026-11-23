import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useState } from "react";
import { detectDoclingReferences, type DetectedReference } from "@research-assistant/core/synthesis";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import { subscribePaperReadingChanged } from "../ai/readingPanelEvents";

interface SourcedReference extends DetectedReference { readonly attachment: LiteratureItem["attachments"][number]; readonly parseRunId: string }
export function DetectedReferences({ item, gateway, savedTexts, onOpen, onCountChanged, onInitialLoadSettled }: {
  readonly onInitialLoadSettled?: (settled: boolean) => void;
  readonly item: LiteratureItem;
  readonly gateway: DoclingParserGateway;
  readonly savedTexts: readonly string[];
  readonly onOpen: (attachment: LiteratureItem["attachments"][number]) => void;
  readonly onCountChanged: (count: number | undefined) => void;
}): React.JSX.Element {
  const [references, setReferences] = useState<readonly SourcedReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationState("error");
  useEffect(() => {
    let alive = true;
    let request = 0;
    async function load(): Promise<void> {
      const current = ++request;
      setLoading(true);
      try {
        const runs = await gateway.listParseRuns(item.id);
        // StrictMode or a paper switch may retire this owner while the small
        // header query is pending. Do not then request the full parsed document.
        if (!alive || request !== current) return;
        const lists = await Promise.all(item.attachments.filter(file => file.mimeType === "application/pdf").map(async attachment => {
          const latest = [...runs].filter(run => run.attachmentId === attachment.id && run.contentSha256 === attachment.contentSha256 && ["success", "partial_success"].includes(run.parseStatus)).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
          if (latest === undefined) return [];
          const detail = await gateway.getParseRun(latest.id);
          return detectDoclingReferences(detail.jsonContent).map(reference => ({ ...reference, attachment, parseRunId: latest.id }));
        }));
        if (alive && request === current) { setReferences(lists.flat()); setError(undefined); }
      } catch (reason) { if (alive && request === current) setError(reason instanceof Error ? reason.message : String(reason)); }
      finally { if (alive && request === current) setLoading(false); }
    }
    void load();
    const unsubscribe = subscribePaperReadingChanged(item.id, () => void load(), "reference-detection");
    return () => { alive = false; unsubscribe(); };
  }, [gateway, item.id, item.attachments]);
  const visible = references.filter(reference => !savedTexts.includes(reference.rawText));
  const count = loading || error !== undefined ? undefined : visible.length;
  useEffect(() => { if (!loading) onInitialLoadSettled?.(true); }, [loading, onInitialLoadSettled]);
  useEffect(() => { onCountChanged(count); }, [count, onCountChanged]);
  return <div className="reference-record-list" aria-label="自动识别的参考文献">
    {loading && <p role="status">正在识别参考文献…</p>}

    {visible.map(reference => <article key={`${reference.attachment.id}:${reference.sourceRef}`}>
      <header><ContentTrustIndicator showHint status="untrusted" size="small" subjectLabel="参考文献" statusLabel="自动识别，未人工审核" /><b>参考文献 · p{reference.pageIndex + 1}</b></header>
      <q>{reference.rawText}</q>
      <button type="button" onClick={() => onOpen(reference.attachment)}>在 PDF 中核验</button>
    </article>)}
  </div>;
}
