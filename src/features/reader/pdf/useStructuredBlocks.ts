import { useCallback, useEffect, useMemo, useState } from "react";
import type { DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import { doclingErrorMessage } from "@research-assistant/workbench-sdk/docling";
import { notify } from "@research-assistant/workbench-sdk/feedback";

interface StructuredBlocksOptions {
  readonly gateway: Pick<DoclingParserGateway, "parseAttachment">;
  readonly itemId: string;
  readonly attachmentId: string;
  readonly contentSha256: string;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/** The existing parse task owns progress/cancellation; this hook owns only the reader control. */
export function useStructuredBlocks({ gateway, itemId, attachmentId, contentSha256, open, setOpen }: StructuredBlocksOptions) {
  const scope = useMemo(() => ({ active: true, pending: false, prepared: false }), [gateway, itemId, attachmentId, contentSha256]);
  const [pendingScope, setPendingScope] = useState<typeof scope>();
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);

  const prepare = useCallback(async (): Promise<void> => {
    // Synchronous guard also covers repeated events before React commits disabled.
    if (!scope.active || scope.pending) return;
    scope.pending = true;
    setPendingScope(scope);
    setOpen(false);
    try {
      // Non-forced preparation validates/reuses the current cached result and
      // shares native work already requested by another reading entry point.
      await gateway.parseAttachment(itemId, attachmentId, { force: false });
      scope.prepared = true;
      if (scope.active) setOpen(true);
    } catch (reason) {
      if (scope.active) notify.warning(`无法显示结构化块：${doclingErrorMessage(reason)}`);
    } finally {
      scope.pending = false;
      if (scope.active) setPendingScope(current => current === scope ? undefined : current);
    }
  }, [scope, gateway, itemId, attachmentId, setOpen]);

  const prepareMissing = useCallback((reason: unknown): void => {
    if (!scope.active || scope.pending) return;
    // A missing restored result gets one preparation attempt. A completed
    // parse with missing output must not create an automatic retry loop.
    if (!scope.prepared) { void prepare(); return; }
    setOpen(false);
    notify.warning(`无法显示结构化块：${doclingErrorMessage(reason)}`);
  }, [scope, prepare, setOpen]);

  const toggle = useCallback((): void => {
    if (scope.pending) return;
    if (open) setOpen(false);
    else void prepare();
  }, [scope, open, setOpen, prepare]);

  return { preparing: pendingScope === scope, prepareMissing, toggle };
}
