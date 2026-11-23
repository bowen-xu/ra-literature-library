import { describe, expect, it } from "vitest";

import { decodeReferenceRecord } from "./referenceRecordDecoders";

function record(): Record<string, unknown> {
  return {
    id: "reference-1",
    citingPaperId: "paper-1",
    sourceAnchorId: "anchor-reference",
    rawText: "Doe (2024). A paper.",
    fields: [
      {
        name: "title",
        value: "A paper",
        sourceKind: "human",
        confirmedByUser: true,
      },
    ],
    parseState: "parsed",
    identityState: "matched_existing",
    matchedItemId: "paper-2",
    semanticState: "reviewed",
    usageKind: "extends",
    usageSummary: "作者明确称其为扩展。",
    usageAnchorId: "anchor-usage",
    provenanceKind: "human_original",
    revision: 2,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:01:00.000Z",
  };
}

describe("reference record IPC decoding", () => {
  it("keeps parse, identity, and semantic review states distinct", () => {
    const decoded = decodeReferenceRecord(record());
    expect(decoded?.parseState).toBe("parsed");
    expect(decoded?.identityState).toBe("matched_existing");
    expect(decoded?.semanticState).toBe("reviewed");
    expect(decoded?.matchedItemId).toBe("paper-2");
    expect(decoded?.usageAnchorId).toBe("anchor-usage");
  });

  it("rejects AI self-confirmation and inconsistent targets", () => {
    const aiConfirmed = record();
    aiConfirmed.fields = [{
      name: "doi",
      value: "10.1000/example",
      sourceKind: "ai_inference",
      confirmedByUser: true,
    }];
    expect(decodeReferenceRecord(aiConfirmed)).toBeUndefined();

    const missingIdentityTarget = record();
    delete missingIdentityTarget.matchedItemId;
    expect(decodeReferenceRecord(missingIdentityTarget)).toBeUndefined();

    const missingSemanticEvidence = record();
    delete missingSemanticEvidence.usageAnchorId;
    expect(decodeReferenceRecord(missingSemanticEvidence)).toBeUndefined();
  });
});
