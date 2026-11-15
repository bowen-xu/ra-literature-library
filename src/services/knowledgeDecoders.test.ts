import { describe, expect, it } from "vitest";

import {
  decodeConceptCaptureResult,
  decodeConceptIdentityEvent,
  decodeList,
  decodePaperReadingProfileSelection,
  decodeReadingProfile,
  decodeReadingUnit,
  decodeRelationAssertion,
  decodeResearchObjectRevision,
} from "./knowledgeDecoders";

const term = {
  id: "term-1",
  text: "calibration",
  normalizedText: "calibration",
  language: "en",
  provenanceKind: "human_original",
  revision: 1,
  createdAt: "2026-08-04T00:00:00Z",
  updatedAt: "2026-08-04T00:00:00Z",
};

describe("knowledge transport decoders", () => {
  it("accepts the camelCase desktop contract for a concept capture result", () => {
    const result = decodeConceptCaptureResult({
      term,
      usage: {
        id: "usage-1",
        term,
        conceptId: "concept-1",
        anchorId: "anchor-1",
        paperId: "paper-1",
        paperTitle: "Public fixture",
        attachmentId: "attachment-1",
        contentSha256: "a".repeat(64),
        pageIndex: 0,
        quoteExact: "calibration",
        usageText: "calibration",
        provenanceKind: "human_original",
        revision: 1,
        createdAt: "2026-08-04T00:00:00Z",
        updatedAt: "2026-08-04T00:00:00Z",
      },
    });
    expect(result).toEqual(expect.objectContaining({
      term: expect.objectContaining({ id: "term-1" }),
      usage: expect.objectContaining({ anchorId: "anchor-1" }),
    }));
  });

  it("rejects unknown enums, partial lists, and invalid revision snapshots", () => {
    const validUnit = {
      id: "unit-1",
      unitKind: "conclusion",
      title: "Result",
      body: "Supported result",
      provenanceKind: "human_original",
      epistemicRole: "synthesis",
      revision: 1,
      evidenceCount: 0,
      createdAt: "2026-08-04T00:00:00Z",
      updatedAt: "2026-08-04T00:00:00Z",
    };
    expect(decodeReadingUnit({ ...validUnit, unitKind: "invented_kind" })).toBeUndefined();
    expect(decodeList([validUnit, { ...validUnit, revision: 0 }], decodeReadingUnit)).toBeUndefined();
    expect(decodeResearchObjectRevision({
      id: "revision-1",
      objectKind: "concept",
      objectId: "concept-1",
      revision: 1,
      snapshot: "not-an-object",
      editorKind: "human",
      changeReason: "manual_edit",
      createdAt: "2026-08-04T00:00:00Z",
    })).toBeUndefined();
  });

  it("decodes typed relation endpoints and rejects unknown predicates", () => {
    const relation = {
      id: "relation-1",
      subject: { kind: "concept", id: "concept-1", label: "Evidence", detail: "Domain" },
      predicateKind: "narrower_than",
      object: { kind: "concept", id: "concept-2", label: "Source", detail: "Domain" },
      scopeNote: "Project taxonomy",
      provenanceKind: "human_original",
      epistemicRole: "assertion",
      revision: 1,
      evidenceCount: 1,
      createdAt: "2026-08-04T00:00:00Z",
      updatedAt: "2026-08-04T00:00:00Z",
    };
    expect(decodeRelationAssertion(relation)?.subject.kind).toBe("concept");
    expect(decodeRelationAssertion({ ...relation, predicateKind: "secret_merge" }))
      .toBeUndefined();
  });

  it("decodes approved profile versions and rejects inconsistent selection revisions", () => {
    const profile = {
      profileId: "philosophical_conceptual",
      profileVersion: 1,
      profileKind: "philosophical_conceptual",
      label: "哲学／概念",
      description: "关注论证与异议。",
      fieldKinds: ["research_question", "argument", "objection", "response"],
      reviewStatus: "approved",
      createdAt: "2026-08-04T00:00:00Z",
    };
    expect(decodeReadingProfile(profile)?.fieldKinds).toContain("objection");
    expect(decodeReadingProfile({ ...profile, fieldKinds: ["argument", "argument"] }))
      .toBeUndefined();
    expect(decodePaperReadingProfileSelection({
      paperId: "paper-1",
      profiles: [{ profileId: profile.profileId, profileVersion: 1 }],
      revision: 0,
      isPersisted: false,
    })?.revision).toBe(0);
    expect(decodePaperReadingProfileSelection({
      paperId: "paper-1",
      profiles: [],
      revision: 1,
      isPersisted: true,
      createdAt: "2026-08-06T00:00:00Z",
      updatedAt: "2026-08-06T00:00:00Z",
    })?.profiles).toEqual([]);
    expect(decodePaperReadingProfileSelection({
      paperId: "paper-1",
      profiles: [{ profileId: profile.profileId, profileVersion: 1 }],
      revision: 0,
      isPersisted: true,
    })).toBeUndefined();
  });

  it("decodes bounded concept identity events and rejects foreign active IDs", () => {
    const summary = {
      id: "concept-a", label: "证据", revision: 1,
      termCount: 1, definitionCount: 0, sourceCount: 0,
    };
    const event = {
      id: "event-1", operation: "merge", survivor: summary,
      sources: [{ ...summary, id: "concept-b", label: "直接证据" }],
      affectedRelationIds: ["relation-1"], activeSourceIds: ["concept-b"],
      rationale: "人工确认", createdAt: "2026-08-04T00:00:00Z",
    };
    expect(decodeConceptIdentityEvent(event)?.activeSourceIds).toEqual(["concept-b"]);
    expect(decodeConceptIdentityEvent({ ...event, activeSourceIds: ["concept-unknown"] }))
      .toBeUndefined();
    expect(decodeConceptIdentityEvent({ ...event, activeSourceIds: [""] })).toBeUndefined();
    expect(decodeConceptIdentityEvent({ ...event, operation: "split" })).toBeUndefined();
  });
});
