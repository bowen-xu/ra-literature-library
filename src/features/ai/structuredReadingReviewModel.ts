import type {
  AiCandidate,
  AiCitationAssessment,
  PaperOverviewFieldV1,
  PaperOverviewUnitCandidateV1,
  OverviewFieldId,
} from "@research-assistant/core/ai";
import type { ContentTrustStatus } from "@research-assistant/core/content-trust";

export function overviewPayload(candidate: AiCandidate): PaperOverviewUnitCandidateV1 | undefined {
  const revision = candidate.revisions.find((item) => item.revision === candidate.currentRevision);
  return revision?.payload.kind === "paper_overview_unit_v1" ? revision.payload : undefined;
}

function fieldAtRevision(
  candidate: AiCandidate,
  revision: number,
  fieldKind: OverviewFieldId,
): PaperOverviewFieldV1 | undefined {
  const payload = candidate.revisions.find((item) => item.revision === revision)?.payload;
  return payload?.kind === "paper_overview_unit_v1"
    ? payload.fields.find((field) => field.field === fieldKind)
    : undefined;
}

function fieldSignature(field: PaperOverviewFieldV1 | undefined): string {
  return JSON.stringify(field ?? null);
}

export function overviewFieldTrustStatus(
  candidate: AiCandidate,
  fieldKind: OverviewFieldId,
): ContentTrustStatus {
  const confirmation = candidate.overviewFieldConfirmations.find((item) => (
    item.active && item.fieldKind === fieldKind
  ));
  if (confirmation !== undefined) return "trusted";
  let previousSignature: string | undefined;
  let latestEditor: "ai" | "human" | "ai_retry" = "ai";
  for (const revision of [...candidate.revisions].sort((left, right) => left.revision - right.revision)) {
    const signature = fieldSignature(fieldAtRevision(candidate, revision.revision, fieldKind));
    if (signature !== previousSignature) {
      latestEditor = revision.editorKind;
      previousSignature = signature;
    }
  }
  return latestEditor === "human" ? "reviewable" : "untrusted";
}

export function confirmableOverviewFields(candidate: AiCandidate): readonly OverviewFieldId[] {
  const payload = overviewPayload(candidate);
  if (payload === undefined) return [];
  const confirmed = new Set(candidate.overviewFieldConfirmations
    .filter((item) => item.active)
    .map((item) => item.fieldKind));
  return payload.fields
    .filter((field) => field.status !== "not_found"
      && field.statements.some((statement) => statement.text.trim() !== "")
      && !confirmed.has(field.field))
    .map((field) => field.field);
}

function latestAssessment(
  candidate: AiCandidate,
  statementId: string,
  evidenceItemId: string,
): AiCitationAssessment | undefined {
  return candidate.citationAssessments
    .filter((item) => item.candidateRevision === candidate.currentRevision
      && item.statementId === statementId && item.evidenceItemId === evidenceItemId)
    .sort((left, right) => right.assessmentRevision - left.assessmentRevision)[0];
}

export function overviewFieldCitationReadinessMessage(
  candidate: AiCandidate,
  fieldKind: OverviewFieldId,
): string | undefined {
  const payload = overviewPayload(candidate);
  const field = payload?.fields.find((item) => item.field === fieldKind);
  if (field === undefined) return "找不到当前字段";
  for (const statement of field.statements) {
    if (statement.evidenceItemIds.length === 0) continue;
    let hasPositive = false;
    for (const citationKey of statement.evidenceItemIds) {
      const evidence = candidate.evidenceBundle.items.find((item) => item.citationKey === citationKey);
      if (evidence === undefined) return "字段引用了缺失来源";
      if (evidence.currentAnchorStatus === "stale" || evidence.currentAnchorStatus === "missing") {
        return "字段包含失效或缺失来源";
      }
      const relation = latestAssessment(candidate, statement.id, evidence.id)?.semanticRelation;
      if (relation === "opposes" || relation === "unsupported") {
        return "字段包含被人工判断为反对或不支持的引用";
      }
      hasPositive ||= relation === "supports" || relation === "partially_supports";
    }
    if (!hasPositive) return "需先把至少一条引用人工判断为支持或部分支持";
  }
  return undefined;
}

export function citationReadyOverviewFields(candidate: AiCandidate): readonly OverviewFieldId[] {
  return confirmableOverviewFields(candidate).filter((fieldKind) =>
    overviewFieldCitationReadinessMessage(candidate, fieldKind) === undefined);
}

export function candidateBelongsToPaper(candidate: AiCandidate, paperId: string): boolean {
  return candidate.candidateKind === "paper_overview_unit_v1"
    && candidate.evidenceBundle.items.length > 0
    && candidate.evidenceBundle.items.every((item) => item.paperId === paperId);
}

export function isOverviewCandidateClosed(candidate: AiCandidate): boolean {
  return candidate.reviewState === "accepted_unchanged"
    || candidate.reviewState === "accepted_after_edit"
    || candidate.reviewState === "rejected";
}
