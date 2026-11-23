import { describe, expect, it } from "vitest";

import {
  decodeEvidenceMatrix,
  decodeEvidenceMatrixCell,
} from "./evidenceMatrixDecoders";

function matrix(): Record<string, unknown> {
  return {
    id: "matrix-1",
    projectId: "project-1",
    title: "Method comparison",
    paperIds: ["paper-1", "paper-2"],
    dimensions: [{ id: "method", label: "方法" }],
    revision: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

function cell(): Record<string, unknown> {
  return {
    id: "cell-1",
    matrixId: "matrix-1",
    paperId: "paper-1",
    dimensionId: "method",
    coverageState: "populated",
    coverageNote: "保留两种冲突解读",
    statements: [
      {
        id: "statement-1",
        text: "第一种解读",
        epistemicRole: "source_paraphrase",
        evidenceAnchorIds: ["anchor-1"],
      },
      {
        id: "statement-2",
        text: "冲突解读",
        epistemicRole: "inference",
        evidenceAnchorIds: ["anchor-1"],
      },
    ],
    provenanceKind: "human_original",
    revision: 2,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:01:00.000Z",
  };
}

describe("evidence matrix IPC decoding", () => {
  it("preserves selected order and parallel grounded statements", () => {
    expect(decodeEvidenceMatrix(matrix())?.paperIds).toEqual(["paper-1", "paper-2"]);
    const decoded = decodeEvidenceMatrixCell(cell());
    expect(decoded?.statements).toHaveLength(2);
    expect(decoded?.statements[1]?.epistemicRole).toBe("inference");
  });

  it("rejects duplicate dimensions and unsupported coverage shapes", () => {
    const duplicateDimensions = matrix();
    duplicateDimensions.dimensions = [
      { id: "method", label: "方法" },
      { id: "method", label: "重复" },
    ];
    expect(decodeEvidenceMatrix(duplicateDimensions)).toBeUndefined();

    const ungrounded = cell();
    ungrounded.statements = [{
      id: "statement-1",
      text: "没有原文锚点",
      epistemicRole: "source_paraphrase",
      evidenceAnchorIds: [],
    }];
    expect(decodeEvidenceMatrixCell(ungrounded)).toBeUndefined();

    const falseAbsence = cell();
    falseAbsence.coverageState = "not_found";
    expect(decodeEvidenceMatrixCell(falseAbsence)).toBeUndefined();
  });
});
