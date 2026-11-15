import type { AgentCanvasMessage, AgentCanvasMessageOptions } from "@research-assistant/workbench-sdk/agent-ui";
import { submitEvidenceAnnotation } from "@research-assistant/workbench-sdk/agent-ui";
import { selectionAnnotation } from "./selectionAnnotation";

/** Add writes only a draft; Send owns this comment/question and preserves the main draft. */
export async function submitSelectionAnnotation({paperId, attachmentId, title, pending, controller, comment, intent, submit, discard}: {
  readonly paperId: string; readonly attachmentId: string; readonly title: string;
  readonly pending: Parameters<typeof selectionAnnotation>[3]; readonly controller: Parameters<typeof selectionAnnotation>[4];
  readonly comment: string; readonly intent?: "send" | "silent";
  readonly submit: (text: string, resources?: AgentCanvasMessage["resources"], options?: AgentCanvasMessageOptions) => Promise<void>;
  readonly discard: () => void;
}): Promise<void> {
  await submitEvidenceAnnotation({
    capture: () => selectionAnnotation(paperId, attachmentId, title, pending, controller),
    resources: [{kind:"paper",resourceId:paperId,attachmentId}],
    comment, ...(intent ? {intent} : {}), submit, discard,
  });
}
