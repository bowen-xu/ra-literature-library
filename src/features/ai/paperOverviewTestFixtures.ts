import type { AiCandidate, PaperAnalysisWorkflow } from "@research-assistant/core/ai";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { ReadingProfile } from "@research-assistant/core/knowledge";

export function overviewCandidate(id: string, paperId: string): AiCandidate {
  return {
    id,
    runId: `run-${id}`,
    providerId: "provider",
    modelId: "model",
    candidateKind: "paper_overview_unit_v1",
    schemaVersion: 1,
    currentRevision: 1,
    reviewState: "unreviewed",
    validationStatus: "valid",
    originalPayloadHash: "a".repeat(64),
    createdAt: "now",
    updatedAt: "now",
    evidenceBundle: {
      id: `bundle-${id}`,
      runId: `run-${id}`,
      scopeHash: "b".repeat(64),
      retrievalConfigVersion: "docling-context-v1",
      validationStatus: "valid",
      createdAt: "now",
      items: [{
        id: `evidence-${id}`,
        citationKey: "P1-T1",
        ordinal: 0,
        anchorId: `anchor-${id}`,
        paperId,
        paperTitle: "Paper",
        attachmentId: "attachment",
        contentSha256: "c".repeat(64),
        pageIndex: 0,
        quoteExact: "quote",
        quotePrefix: "",
        quoteSuffix: "",
        contextText: "quote",
        relationKind: "direct_quote",
        validationStatus: "valid",
        currentAnchorStatus: "exact",
        createdAt: "now",
      }],
    },
    revisions: [{
      id: `revision-${id}`,
      revision: 1,
      payloadHash: "d".repeat(64),
      editorKind: "ai",
      sourceRunId: `run-${id}`,
      changeReason: "generated",
      createdAt: "now",
      payload: {
        kind: "paper_overview_unit_v1",
        schemaVersion: 1,
        profileId: "reviewed_profile_composition_v1",
        fields: [{
          field: "research_question",
          status: "filled",
          statements: [{
            id: `statement-${id}`,
            text: "question",
            epistemicRole: "source_paraphrase",
            evidenceItemIds: ["P1-T1"],
          }],
        }],
      },
    }],
    decisions: [],
    attentionFeedback: [],
    suggestionItemDecisions: [],
    citationAssessments: [],
    overviewFieldConfirmations: [],
  };
}

export function workflow(status: PaperAnalysisWorkflow["status"]): PaperAnalysisWorkflow {
  const conceptStatus = status === "partial" ? "failed"
    : status === "canceled" ? "canceled" : status === "overview_ready" ? "queued" : "succeeded";
  const overviewAttempts = status === "overview_ready" ? [{
    id: "overview-attempt", turnId: "overview-turn", attempt: 1, status: "succeeded" as const,
    normalizedMessages: [], providerId: "openai", modelId: "vision-model",
    aiRunId: "overview-run", candidateId: "overview", recoveryReason: "local_recovery",
    recoveryVersion: 1, recoveredAt: "later", createdAt: "now", finishedAt: "later",
  }] : status === "failed" ? [{
    id: "overview-attempt", turnId: "overview-turn", attempt: 1, status: "failed" as const,
    normalizedMessages: [], providerId: "openai", modelId: "vision-model",
    errorCode: "storage_error", errorMessage: "候选已保存，但本地状态读取失败。",
    createdAt: "now", finishedAt: "later",
  }] : [];
  const conceptAttempts = status === "partial" ? [{
    id: "concept-attempt", turnId: "concept-turn", attempt: 1, status: "failed" as const,
    normalizedMessages: [], providerId: "openai", modelId: "vision-model",
    errorCode: "invalid_input", errorMessage: "概念候选结构不符合要求，请重试。",
    createdAt: "now", finishedAt: "later",
  }] : [];
  return {
    id: "workflow", paperId: "paper", contextSnapshotId: "snapshot", status,
    providerId: "openai", modelId: "vision-model", promptSetVersion: "paper-analysis-v1",
    revision: 3, createdAt: "now", updatedAt: "later",
    turns: [
      { id: "overview-turn", workflowId: "workflow", ordinal: 0,
        kind: "paper_overview", status: status === "failed" ? "failed" : "succeeded",
        ...(status === "failed" ? {} : { candidateId: "overview" }),
        createdAt: "now", finishedAt: "later", attempts: overviewAttempts },
      { id: "concept-turn", workflowId: "workflow", ordinal: 1,
        kind: "paper_concept_map", status: conceptStatus,
        ...(conceptStatus === "succeeded" ? { candidateId: "concept" } : {}),
        createdAt: "now", finishedAt: "later", attempts: conceptAttempts },
    ],
  };
}

export function failedConceptWorkflow(): PaperAnalysisWorkflow {
  const base = workflow("partial");
  return {
    ...base,
    status: "failed",
    turns: base.turns.map((turn) => turn.kind === "paper_overview"
      ? { ...turn, status: "succeeded", candidateId: "overview" }
      : turn),
  };
}

export function panelItem(): LiteratureItem {
  return {
    id: "paper",
    itemType: "journalArticle",
    title: "Paper",
    abstractText: "",
    containerTitle: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    url: "",
    language: "",
    bibtexKey: "",
    creators: [],
    tags: [],
    readingStatus: "unread",
    attachments: [{
      id: "attachment",
      displayName: "paper.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      contentSha256: "c".repeat(64),
    }],
    projectIds: [],
    metadataSources: [],
    createdAt: "now",
    updatedAt: "now",
  };
}

export const profile: ReadingProfile = {
  profileId: "technical_empirical",
  profileVersion: 1,
  profileKind: "technical_empirical",
  label: "技术／实证",
  description: "技术论文阅读框架",
  fieldKinds: ["research_question", "approach"],
  reviewStatus: "approved",
  createdAt: "now",
};

