import { describe, expect, it } from "vitest";

import { decodeConceptAlgorithmRun } from "./conceptAlgorithmDecoders";

function evolutionRun(): Record<string, unknown> {
  return {
    id: "run-1",
    algorithmKind: "concept_evolution",
    algorithmId: "accepted-paper-concept-timeline",
    algorithmVersion: 1,
    parametersHash: "a".repeat(64),
    conceptRevisionWatermark: 3,
    relationRevisionWatermark: 2,
    paperScopeHash: "b".repeat(64),
    status: "succeeded",
    resultCount: 1,
    createdAt: "now",
    startedAt: "now",
    finishedAt: "later",
    evolutionEvents: [{
      ordinal: 0,
      conceptId: "concept-1",
      conceptRevision: 2,
      conceptLabel: "Concept",
      paperId: "paper-1",
      paperTitle: "Origin paper",
      issuedYear: 2020,
      assertionId: "assertion-1",
      assertionRevision: 1,
      paperFunction: "focal",
      noveltyStatus: "introduced_by_paper",
      eventKind: "introduced",
      explanation: "Initial formulation",
    }],
    foundationSimilarities: [],
  };
}

describe("concept algorithm IPC decoder", () => {
  it("accepts a versioned evolution run", () => {
    expect(decodeConceptAlgorithmRun(evolutionRun())?.evolutionEvents[0]?.eventKind)
      .toBe("introduced");
  });

  it("rejects community runs and mixed result families", () => {
    expect(decodeConceptAlgorithmRun({ ...evolutionRun(), algorithmKind: "community_detection" }))
      .toBeUndefined();
    expect(decodeConceptAlgorithmRun({
      ...evolutionRun(),
      foundationSimilarities: [{
        ordinal: 0,
        leftPaperId: "a",
        leftPaperTitle: "A",
        rightPaperId: "b",
        rightPaperTitle: "B",
        sharedConcepts: [],
        weightedJaccard: 0,
        sharedConceptCount: 0,
        leftFoundationCount: 0,
        rightFoundationCount: 0,
      }],
      resultCount: 2,
    })).toBeUndefined();
  });

  it("rejects result counts and completed timestamps that contradict status", () => {
    expect(decodeConceptAlgorithmRun({ ...evolutionRun(), resultCount: 2 })).toBeUndefined();
    expect(decodeConceptAlgorithmRun({
      ...evolutionRun(),
      finishedAt: undefined,
    })).toBeUndefined();
  });
});
