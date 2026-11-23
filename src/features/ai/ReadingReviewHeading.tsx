import { useState, type ReactNode } from "react";
import type { AiCandidate, AiOverviewFieldConfirmation } from "@research-assistant/core/ai";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useReadingReviewContextMenu } from "./ReadingReviewContextMenu";

export function ReadingReviewHeading({ children, label, candidate, confirmation, gateway, onChanged, onSaved, busy = false }: {
  readonly children: ReactNode; readonly label: string; readonly candidate?: AiCandidate | undefined;
  readonly confirmation?: AiOverviewFieldConfirmation | undefined; readonly gateway: AiAssistanceGateway;
  readonly onChanged: (candidate: AiCandidate) => void; readonly onSaved: () => Promise<void>; readonly busy?: boolean;
}): React.JSX.Element {
  const [resetting, setResetting] = useState(false);
  async function reset(): Promise<void> {
    if (candidate === undefined || confirmation?.active !== true || busy || resetting) return;
    setResetting(true);
    try {
      const result = await gateway.undoOverviewConfirmation({ batchId: confirmation.batchId, fieldKind: confirmation.fieldKind, idempotencyKey: crypto.randomUUID() });
      onChanged(result.candidate); await onSaved(); notify.success("已恢复审核状态，正文保留。");
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setResetting(false); }
  }
  const context = useReadingReviewContextMenu({ label, disabled: busy || resetting || confirmation?.active !== true, onReset: () => void reset() });
  return <><header tabIndex={0} onContextMenu={context.onContextMenu} onKeyDown={context.onMenuKeyDown}>{children}</header>{context.menu}</>;
}
