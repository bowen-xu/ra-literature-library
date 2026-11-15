import type {
  AiTaskSpecDraft,
  LlmModelSelection,
} from "@research-assistant/core/ai";
import type { DerivedResearchViewKind } from "@research-assistant/core/synthesis";

export interface MatrixSynthesisInput {
  readonly matrixId: string;
  readonly matrixRevision: number;
  readonly cellId: string;
  readonly cellRevision: number;
  readonly paperId: string;
  readonly evidenceAnchorIds: readonly string[];
}

export interface MatrixSynthesisDraftInput {
  readonly projectId: string;
  readonly viewKind: DerivedResearchViewKind;
  readonly title: string;
  readonly scopeNote: string;
  readonly inputs: readonly MatrixSynthesisInput[];
}

export function buildReferenceExtractionTaskDraft(
  modelSelection: LlmModelSelection | undefined,
  anchorId: string,
): AiTaskSpecDraft {
  if (anchorId.trim() === "") {
    throw new Error("参考文献原文锚点无效，请重新选择原文");
  }
  return {
    taskKind: "reference_extraction",
    providerId: "",
    ...(modelSelection === undefined ? {} : { modelSelection }),
    userGoal: "从所选参考文献原文提取可见字段；缺失字段保持缺失，身份和 DOI 仍待人工核验。",
    pipelineVersion: "reference-extraction-runtime-v1",
    promptVersion: "reference-extraction-grounded-v1",
    outputSchemaVersion: 1,
    maxInputTokens: 4_096,
    maxOutputTokens: 1_024,
    timeoutMs: 60_000,
    scopeItems: [{ itemKind: "anchor", objectId: anchorId }],
  };
}

export function matrixSynthesisIssue(input: MatrixSynthesisDraftInput): string | undefined {
  if (input.projectId.trim() === "") return "当前研究项目无效，请重新进入项目";
  if (input.title.trim() === "") return "先填写视图标题";
  if ([...input.title].length > 240) return "视图标题不能超过 240 个字符";
  if (input.scopeNote.trim() === "") return "先填写输入范围与限制";
  if ([...input.scopeNote].length > 4_000) {
    return "输入范围与限制不能超过 4,000 个字符";
  }
  if (input.inputs.length < 2 || input.inputs.length > 20) return "请选择 2–20 个矩阵单元";
  if (input.inputs.some((item) => item.matrixId.trim() === ""
    || item.cellId.trim() === ""
    || item.paperId.trim() === ""
    || item.matrixRevision < 1
    || item.cellRevision < 1
    || item.evidenceAnchorIds.some((anchorId) => anchorId.trim() === ""))) {
    return "所选矩阵单元或来源标识无效，请重新载入";
  }
  const matrixIds = new Set(input.inputs.map((item) => item.matrixId));
  if (matrixIds.size !== 1) return "AI 综合一次只能使用同一个证据矩阵";
  const matrixRevisions = new Set(input.inputs.map((item) => item.matrixRevision));
  if (matrixRevisions.size !== 1) return "所选矩阵版本不一致，请重新载入";
  const cellIds = new Set(input.inputs.map((item) => item.cellId));
  if (cellIds.size !== input.inputs.length) return "同一个矩阵单元不能重复选择";
  if (new Set(input.inputs.map((item) => item.paperId)).size < 2) {
    return "AI 综合至少需要两篇不同论文";
  }
  const anchors = orderedUniqueAnchors(input.inputs);
  if (anchors.length < 2 || anchors.length > 32) return "所选单元需提供 2–32 条原文来源";
  return undefined;
}

export function buildMatrixSynthesisTaskDraft(
  modelSelection: LlmModelSelection | undefined,
  input: MatrixSynthesisDraftInput,
): AiTaskSpecDraft {
  const issue = matrixSynthesisIssue(input);
  if (issue !== undefined) throw new Error(issue);
  const matrix = input.inputs[0]!;
  const evidenceAnchorIds = orderedUniqueAnchors(input.inputs);
  return {
    taskKind: "matrix_synthesis",
    providerId: "",
    ...(modelSelection === undefined ? {} : { modelSelection }),
    userGoal: "仅从人工选择的矩阵单元和原文证据形成待审查的跨文献综合。",
    pipelineVersion: "matrix-synthesis-runtime-v1",
    promptVersion: "matrix-synthesis-grounded-v1",
    outputSchemaVersion: 1,
    maxInputTokens: 16_000,
    maxOutputTokens: 3_000,
    timeoutMs: 90_000,
    scopeItems: evidenceAnchorIds.map((objectId) => ({ itemKind: "anchor", objectId })),
    matrixSynthesisContext: {
      projectId: input.projectId,
      matrixId: matrix.matrixId,
      matrixRevision: matrix.matrixRevision,
      viewKind: input.viewKind,
      title: input.title.trim(),
      scopeNote: input.scopeNote.trim(),
      inputs: input.inputs.map((item) => ({
        objectKind: "matrix_cell",
        objectId: item.cellId,
        objectRevision: item.cellRevision,
        selectionReason: "用户显式选择为 AI 综合输入",
      })),
    },
  };
}

function orderedUniqueAnchors(inputs: readonly MatrixSynthesisInput[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of inputs) {
    for (const anchorId of input.evidenceAnchorIds) {
      if (seen.has(anchorId)) continue;
      seen.add(anchorId);
      result.push(anchorId);
    }
  }
  return result;
}
