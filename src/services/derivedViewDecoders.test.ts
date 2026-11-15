import { describe, expect, it } from "vitest";

import { decodeDerivedResearchView } from "./derivedViewDecoders";

function view(): Record<string, unknown> {
  return {
    id: "view-1",
    projectId: "project-1",
    viewKind: "gap_hypothesis",
    title: "候选领域空白",
    scopeNote: "只基于显式选择的矩阵单元",
    inputs: [{
      objectKind: "matrix_cell",
      objectId: "cell-1",
      objectRevision: 1,
      selectionReason: "用于提出待检验空白",
    }],
    items: [{
      id: "item-1",
      text: "跨场景有效性仍待验证。",
      epistemicRole: "hypothesis",
      evidenceAnchorIds: ["anchor-1"],
      hasConflict: false,
    }],
    reviewState: "accepted",
    provenanceKind: "human_original",
    generatedAt: "2026-08-04T00:00:00.000Z",
    revision: 2,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:01:00.000Z",
  };
}

describe("derived research view IPC decoding", () => {
  it("preserves frozen input revisions and hypothesis status", () => {
    const decoded = decodeDerivedResearchView(view());

    expect(decoded?.inputs[0]?.objectRevision).toBe(1);
    expect(decoded?.items[0]?.epistemicRole).toBe("hypothesis");
    expect(decoded?.reviewState).toBe("accepted");
  });

  it("rejects factualized gaps and duplicate evidence anchors", () => {
    const factualized = view();
    factualized.items = [{
      ...(factualized.items as Record<string, unknown>[])[0],
      epistemicRole: "synthesis",
    }];
    expect(decodeDerivedResearchView(factualized)).toBeUndefined();

    const duplicateAnchors = view();
    duplicateAnchors.items = [{
      ...(duplicateAnchors.items as Record<string, unknown>[])[0],
      evidenceAnchorIds: ["anchor-1", "anchor-1"],
    }];
    expect(decodeDerivedResearchView(duplicateAnchors)).toBeUndefined();
  });
});
