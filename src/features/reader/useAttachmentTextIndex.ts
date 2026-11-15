import { useEffect, useRef } from "react";
import type { AttachmentSummary } from "@research-assistant/core/literature";
import type { LiteratureGateway } from "../../services/literatureGateway";
import type { ReaderSessionController } from "./session/ReaderSessionController";

/** A successful index is immutable for this mounted attachment version. */
export function useAttachmentTextIndex({active, ready, attachment, itemId, pageCount, gateway, controller}: {
  readonly active: boolean;
  readonly ready: boolean;
  readonly attachment: Pick<AttachmentSummary, "id" | "contentSha256">;
  readonly itemId: string;
  readonly pageCount: number;
  readonly gateway: Pick<LiteratureGateway, "isAttachmentIndexed" | "indexAttachment">;
  readonly controller: Pick<ReaderSessionController, "setStatus" | "extractPageTexts">;
}): void {
  const completed = useRef<{id: string; hash: string; gateway: typeof gateway} | undefined>(undefined);
  useEffect(() => {
    if (!active || !ready) return;
    const saved = completed.current;
    if (saved?.id === attachment.id && saved.hash === attachment.contentSha256 && saved.gateway === gateway) return;
    const abort = new AbortController();
    const index = async () => {
      const indexed = await gateway.isAttachmentIndexed(attachment.id);
      if (abort.signal.aborted) return;
      if (!indexed) {
        controller.setStatus(`正在建立 ${pageCount} 页全文索引…`);
        const pages = await controller.extractPageTexts(abort.signal);
        if (abort.signal.aborted) return;
        await gateway.indexAttachment(itemId, attachment.id, pages);
        if (abort.signal.aborted) return;
        controller.setStatus(`${pageCount} 页 · 全文索引已就绪`);
      }
      completed.current = {id: attachment.id, hash: attachment.contentSha256, gateway};
    };
    void index().catch((reason: unknown) => {
      if (!abort.signal.aborted) controller.setStatus(`全文索引失败：${reason instanceof Error ? reason.message : String(reason)}`);
    });
    return () => abort.abort();
  }, [active, ready, attachment.id, attachment.contentSha256, itemId, pageCount, gateway, controller]);
}
