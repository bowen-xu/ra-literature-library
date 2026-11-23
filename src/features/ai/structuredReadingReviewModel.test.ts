import { describe, expect, it } from "vitest";
import type { AiCandidate, PaperOverviewUnitCandidateV1 } from "@research-assistant/core/ai";

import {
  candidateBelongsToPaper,
  confirmableOverviewFields,
  overviewFieldTrustStatus,
} from "./structuredReadingReviewModel";

function payload(question: string, result: string): PaperOverviewUnitCandidateV1 {
  return {
    kind: "paper_overview_unit_v1",
    schemaVersion: 1,
    profileId: "generic_overview_v1",
    fields: [
      { field: "research_question", status: "filled", statements: [{ id: "q", text: question, epistemicRole: "source_paraphrase", evidenceItemIds: ["evidence"] }] },
      { field: "approach", status: "not_found", statements: [] },
      { field: "key_result", status: "filled", statements: [{ id: "r", text: result, epistemicRole: "source_paraphrase", evidenceItemIds: ["evidence"] }] },
      { field: "conclusion", status: "not_found", statements: [] },
      { field: "limitation", status: "not_found", statements: [] },
      { field: "open_question", status: "not_found", statements: [] },
    ],
  };
}

function candidate(): AiCandidate {
  return {
    id: "candidate",
    runId: "run",
    providerId: "provider",
    modelId: "model",
    candidateKind: "paper_overview_unit_v1",
    schemaVersion: 1,
    currentRevision: 2,
    reviewState: "edited",
    validationStatus: "valid",
    originalPayloadHash: "a".repeat(64),
    createdAt: "now",
    updatedAt: "now",
    evidenceBundle: {
      id: "bundle",
      runId: "run",
      scopeHash: "b".repeat(64),
      retrievalConfigVersion: "selection-v1",
      validationStatus: "valid",
      createdAt: "now",
      items: [{
        id: "evidence", citationKey: "citation", ordinal: 0, anchorId: "anchor",
        paperId: "paper", paperTitle: "Paper", attachmentId: "attachment",
        contentSha256: "c".repeat(64), pageIndex: 0, quoteExact: "quote",
        quotePrefix: "", quoteSuffix: "", contextText: "quote",
        relationKind: "direct_quote", validationStatus: "valid",
        currentAnchorStatus: "exact", createdAt: "now",
      }],
    },
    revisions: [
      { id: "r1", revision: 1, payload: payload("AI question", "AI result"), payloadHash: "d".repeat(64), editorKind: "ai", changeReason: "generated", createdAt: "now" },
      { id: "r2", revision: 2, payload: payload("Human question", "AI result"), payloadHash: "e".repeat(64), editorKind: "human", parentRevision: 1, changeReason: "edited", createdAt: "now" },
    ],
    decisions: [],
    attentionFeedback: [],
    suggestionItemDecisions: [],
    citationAssessments: [],
    overviewFieldConfirmations: [],
  };
}

describe("structured reading field review model", () => {
  it("keeps untouched AI fields red and only edited fields yellow", () => {
    const value = candidate();
    expect(overviewFieldTrustStatus(value, "research_question")).toBe("reviewable");
    expect(overviewFieldTrustStatus(value, "key_result")).toBe("untrusted");
  });

  it("turns only the confirmed field green and removes it from the pending set", () => {
    const value: AiCandidate = {
      ...candidate(),
      reviewState: "partially_accepted",
      overviewFieldConfirmations: [{
        id: "confirmation", batchId: "batch", candidateId: "candidate",
        candidateRevision: 2, fieldKind: "research_question",
        fieldPayloadHash: "f".repeat(64), decisionKind: "human_edited",
        targetReadingUnitId: "unit", targetAppliedRevision: 1,
        active: true, createdAt: "now",
      }],
    };
    expect(overviewFieldTrustStatus(value, "research_question")).toBe("trusted");
    expect(confirmableOverviewFields(value)).toEqual(["key_result"]);
  });

  it("matches overview candidates only to their exact source paper", () => {
    expect(candidateBelongsToPaper(candidate(), "paper")).toBe(true);
    expect(candidateBelongsToPaper(candidate(), "another-paper")).toBe(false);
  });
});
