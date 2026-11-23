import { describe, expect, it } from "vitest";

import {
  buildMatrixSynthesisTaskDraft,
  buildReferenceExtractionTaskDraft,
  matrixSynthesisIssue,
  type MatrixSynthesisDraftInput,
} from "./researchTaskDrafts";

function synthesisInput(): MatrixSynthesisDraftInput {
  return {
    projectId: "project",
    viewKind: "taxonomy",
    title: "Routing taxonomy",
    scopeNote: "Selected cells only.",
    inputs: [
      {
        matrixId: "matrix", matrixRevision: 2, cellId: "cell-a", cellRevision: 3,
        paperId: "paper-a", evidenceAnchorIds: ["anchor-a", "shared"],
      },
      {
        matrixId: "matrix", matrixRevision: 2, cellId: "cell-b", cellRevision: 1,
        paperId: "paper-b", evidenceAnchorIds: ["shared", "anchor-b"],
      },
    ],
  };
}

describe("research AI task drafts", () => {
  it("keeps reference extraction bounded to one explicit anchor", () => {
    const draft = buildReferenceExtractionTaskDraft({ providerId: "deepseek", modelId: "deepseek-chat" }, "reference-anchor");
    expect(draft.taskKind).toBe("reference_extraction");
    expect(draft.scopeItems).toEqual([{ itemKind: "anchor", objectId: "reference-anchor" }]);
    expect(() => buildReferenceExtractionTaskDraft({ providerId: "deepseek", modelId: "deepseek-chat" }, "  "))
      .toThrow("原文锚点无效");
  });

  it("keeps matrix citation order identical to frozen input order", () => {
    const draft = buildMatrixSynthesisTaskDraft(undefined, synthesisInput());
    expect(draft.scopeItems.map((item) => item.objectId))
      .toEqual(["anchor-a", "shared", "anchor-b"]);
    expect(draft.matrixSynthesisContext?.inputs.map((item) => item.objectRevision))
      .toEqual([3, 1]);
  });

  it("rejects cross-matrix and one-paper synthesis before preview", () => {
    const crossMatrix = synthesisInput();
    expect(matrixSynthesisIssue({
      ...crossMatrix,
      inputs: [crossMatrix.inputs[0]!, { ...crossMatrix.inputs[1]!, matrixId: "other" }],
    })).toContain("同一个证据矩阵");
    expect(matrixSynthesisIssue({
      ...crossMatrix,
      inputs: [crossMatrix.inputs[0]!, { ...crossMatrix.inputs[1]!, paperId: "paper-a" }],
    })).toContain("两篇不同论文");
  });

  it("rejects stale, duplicate, and incomplete matrix inputs before preview", () => {
    const input = synthesisInput();
    expect(matrixSynthesisIssue({ ...input, projectId: "" })).toContain("研究项目无效");
    expect(matrixSynthesisIssue({ ...input, title: "x".repeat(241) }))
      .toContain("240");
    expect(matrixSynthesisIssue({ ...input, scopeNote: "x".repeat(4_001) }))
      .toContain("4,000");
    expect(matrixSynthesisIssue({
      ...input,
      inputs: [input.inputs[0]!, { ...input.inputs[1]!, matrixRevision: 3 }],
    })).toContain("版本不一致");
    expect(matrixSynthesisIssue({
      ...input,
      inputs: [input.inputs[0]!, { ...input.inputs[1]!, cellId: "cell-a" }],
    })).toContain("不能重复选择");
    expect(matrixSynthesisIssue({
      ...input,
      inputs: [input.inputs[0]!, { ...input.inputs[1]!, evidenceAnchorIds: [""] }],
    })).toContain("标识无效");
  });

  it("enforces selected-cell and deduplicated-evidence budgets", () => {
    const input = synthesisInput();
    expect(matrixSynthesisIssue({ ...input, inputs: [input.inputs[0]!] }))
      .toContain("2–20");
    const tooManyInputs = Array.from({ length: 21 }, (_, index) => ({
      ...input.inputs[index % 2]!,
      cellId: `cell-${index}`,
      paperId: `paper-${index}`,
      evidenceAnchorIds: [`anchor-${index}`],
    }));
    expect(matrixSynthesisIssue({ ...input, inputs: tooManyInputs })).toContain("2–20");
    const tooManyAnchors = input.inputs.map((item, index) => ({
      ...item,
      evidenceAnchorIds: Array.from({ length: 17 }, (_, anchorIndex) =>
        `anchor-${index}-${anchorIndex}`),
    }));
    expect(matrixSynthesisIssue({ ...input, inputs: tooManyAnchors }))
      .toContain("2–32");
  });
});
