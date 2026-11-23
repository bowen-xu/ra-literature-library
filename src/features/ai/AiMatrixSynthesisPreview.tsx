import type { AiRun, LlmModelSelection } from "@research-assistant/core/ai";

import { AiTaskLaunchPreview } from "./AiTaskLaunchPreview";
import {
  buildMatrixSynthesisTaskDraft,
  type MatrixSynthesisDraftInput,
} from "./researchTaskDrafts";

interface AiMatrixSynthesisPreviewProps {
  readonly input: MatrixSynthesisDraftInput;
  readonly onCancel: () => void;
  readonly onStarted: (run: AiRun) => void;
}

export function AiMatrixSynthesisPreview({
  input,
  onCancel,
  onStarted,
}: AiMatrixSynthesisPreviewProps): React.JSX.Element {
  return <AiTaskLaunchPreview
    description="仅发送当前明确选择的矩阵单元所引用的原文。Taxonomy 与历史脉络是待审查综合；空白和创新始终保持为假设。"
    heading="多文献证据综合"
    onCancel={onCancel}
    onStarted={onStarted}
    prepareDraft={(selection?: LlmModelSelection) =>
      Promise.resolve(buildMatrixSynthesisTaskDraft(selection, input))}
    startLabel="生成待审查综合"
    taskKind="matrix_synthesis"
    trackRunInPlace
  />;
}
