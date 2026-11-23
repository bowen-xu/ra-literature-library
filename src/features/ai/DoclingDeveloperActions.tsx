import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, FileCog } from "lucide-react";
import type { LiteratureItem } from "@research-assistant/core/literature";
import { getDoclingParserGateway, doclingErrorMessage, runDoclingParse, type DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import { openTextDocument } from "@research-assistant/workbench-sdk/text-documents";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { useDeveloperMode } from "@research-assistant/workbench-sdk/settings";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { publishPaperReadingChanged } from "./readingPanelEvents";

/** The developer surface exposes the latest parse, while frozen AI-run provenance remains intact. */
export function DoclingDeveloperActions({ gateway: providedGateway, item }: { readonly item: LiteratureItem; readonly gateway?: DoclingParserGateway }): React.JSX.Element | null {
  const defaultGateway = useMemo(() => getDoclingParserGateway(), []);
  const gateway = providedGateway ?? defaultGateway;
  const { enabled } = useDeveloperMode();
  const [busy, setBusy] = useState(false);
  const view = useRef(0);
  const attachments = item.attachments.filter(value => value.mimeType === "application/pdf");
  useEffect(() => {
    view.current++;
    setBusy(false);
    return () => { view.current++; };
  }, [item.id, gateway, enabled]);
  async function showLatest(): Promise<void> {
    const owner = view.current;
    setBusy(true);
    try {
      const runs = await gateway.listParseRuns(item.id);
      if (view.current !== owner) return;
      const latest = [...runs].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
      if (!latest) { notify.info("尚无解析数据"); return; }
      const detail = await gateway.getParseRun(latest.id);
      if (view.current !== owner) return;
      const content = JSON.stringify(detail.rawResponse, null, 2);
      if (content === undefined) throw new Error("解析记录缺少原始响应（docling_raw_response_missing）");
      const attachment = attachments.find(value => value.id === detail.attachmentId);
      const name = `${(attachment?.displayName ?? item.title).replace(/\.pdf$/i, "")}.docling.json`;
      if (!openTextDocument({
        id: `docling:${detail.id}:raw-response`, path: `Docling/${name}`, title: name,
        owner: "library", content, readOnly: true,
      })) throw new Error("无法打开解析数据标签页（docling_text_document_unavailable）");
    } catch (reason) {
      if (view.current === owner) notify.error(doclingErrorMessage(reason));
    } finally {
      if (view.current === owner) setBusy(false);
    }
  }
  async function parse(attachmentId: string): Promise<void> {
    const owner = view.current;
    setBusy(true);
    try {
      const attachment = attachments.find(value => value.id === attachmentId);
      const result = await runDoclingParse(gateway, item.id, attachmentId, { paperTitle: item.title, fileName: attachment?.displayName ?? "PDF" });
      if (result) {
        publishPaperReadingChanged(item.id, "docling-parse");
      }
    } catch { /* The task owns its global failure message. */ }
    finally { if (view.current === owner) setBusy(false); }
  }
  if (!enabled) return null;
  return <>
    <ActionMenu className="docling-parse-action" contentClassName="reading-action-menu" label="解析 PDF" hint trigger={<FileCog size={15} aria-hidden="true" />} triggerClassName="reading-icon-action" disabled={busy || attachments.length === 0} portal>
      {attachments.map(attachment => <ActionMenuItem key={attachment.id} onClick={() => void parse(attachment.id)}>{attachment.displayName}</ActionMenuItem>)}
    </ActionMenu>
    <ControlHint content="查看最新解析数据"><button type="button" className="reading-icon-action" aria-label="查看最新解析数据" disabled={busy} aria-busy={busy} onClick={() => void showLatest()}><Braces size={15} aria-hidden="true" /></button></ControlHint>
  </>;
}
