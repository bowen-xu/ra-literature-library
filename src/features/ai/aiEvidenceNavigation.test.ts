import { describe, expect, it } from "vitest";
import type { AiEvidenceItem } from "@research-assistant/core/ai";

import { readingSourceForAiEvidence } from "./aiEvidenceNavigation";

function evidence(status: AiEvidenceItem["currentAnchorStatus"]): AiEvidenceItem {
  return {
    id: "evidence", citationKey: "E1", ordinal: 0, anchorId: "anchor",
    paperId: "paper", paperTitle: "Paper", attachmentId: "attachment",
    contentSha256: "a".repeat(64), pageIndex: 2, pageLabel: "iii",
    quoteExact: "Exact", quotePrefix: "Before", quoteSuffix: "After",
    contextText: "Before Exact After", relationKind: "direct_quote",
    validationStatus: "valid", currentAnchorStatus: status, createdAt: "now",
  };
}

describe("AI evidence reader navigation", () => {
  it.each([
    ["exact", "exact"],
    ["page_level", "page_only"],
    ["stale", "needs_relocation"],
    ["missing", "unavailable"],
  ] as const)("maps %s anchors onto the shared reader contract", (status, expectedState) => {
    expect(readingSourceForAiEvidence(evidence(status))).toEqual(expect.objectContaining({
      anchorId: "anchor",
      contentSha256: "a".repeat(64),
      pageIndex: 2,
      pageLabel: "iii",
      quoteExact: "Exact",
      rects: [],
      state: expectedState,
    }));
  });
});
