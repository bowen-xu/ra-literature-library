import type { AiRun, LlmModelSelection } from "@research-assistant/core/ai";

import { AiTaskLaunchPreview } from "./AiTaskLaunchPreview";
import {
  buildReferenceExtractionTaskDraft,
} from "./researchTaskDrafts";

interface AiReferenceExtractionPreviewProps {
  readonly ensureAnchor: () => Promise<string>;
  readonly onCancel: () => void;
  readonly onStarted: (run: AiRun) => void;
}

export function AiReferenceExtractionPreview({
  ensureAnchor,
  onCancel,
  onStarted,
}: AiReferenceExtractionPreviewProps): React.JSX.Element {
  async function prepareDraft(selection?: LlmModelSelection) {
    const anchorId = await ensureAnchor();
    return buildReferenceExtractionTaskDraft(selection, anchorId);
  }
  return <AiTaskLaunchPreview
    description="AI 只从下方可见的参考文献原文提取字段；不会联网匹配文献，也不会确认 DOI 或身份。结果保存为待审查 AI 候选。"
    heading="参考条目字段提取"
    onCancel={onCancel}
    onStarted={onStarted}
    prepareDraft={prepareDraft}
    startLabel="生成待审查参考条目"
    taskKind="reference_extraction"
    trackRunInPlace
  />;
}
