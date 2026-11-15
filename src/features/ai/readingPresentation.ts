import type { AiCandidate, OverviewFieldId } from "@research-assistant/core/ai";
import type { StructuredReadingUnit } from "@research-assistant/core/knowledge";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { overviewFieldTrustStatus, overviewPayload } from "./structuredReadingReviewModel";

/** Legacy display pointers used by the compatibility view and generation overwrite policy.
 * Canonical reading resources do not use these preferences to select or hide revisions. */
export interface ReadingFieldSelection { readonly candidateId: string; readonly fieldId: OverviewFieldId }
export interface ReadingPresentation { readonly fields: readonly ReadingFieldSelection[]; readonly hiddenUnitIds: readonly string[] }
export type ReadingOverwriteScope = "ai_unreviewed" | "human_unreviewed" | "all";
const key = (paperId: string) => `research-assistant.reading-presentation.v1:${paperId}`;

export function readReadingPresentation(paperId: string): ReadingPresentation | undefined {
  try {
    const value: unknown = JSON.parse(getAppStorage().getItem(key(paperId)) ?? "null");
    if (value === null || typeof value !== "object" || !("fields" in value) || !("hiddenUnitIds" in value)) return undefined;
    if (!Array.isArray(value.fields) || !Array.isArray(value.hiddenUnitIds) || value.fields.length > 128) return undefined;
    const fields: ReadingFieldSelection[] = [];
    for (const entry of value.fields as unknown[]) {
      if (entry === null || typeof entry !== "object" || !("candidateId" in entry) || !("fieldId" in entry)
        || typeof entry.candidateId !== "string" || typeof entry.fieldId !== "string") return undefined;
      fields.push({ candidateId: entry.candidateId, fieldId: entry.fieldId });
    }
    if (value.hiddenUnitIds.some((id: unknown) => typeof id !== "string")) return undefined;
    return { fields, hiddenUnitIds: value.hiddenUnitIds as string[] };
  } catch { return undefined; }
}
export function saveReadingPresentation(paperId: string, value: ReadingPresentation): void {
  getAppStorage().setItem(key(paperId), JSON.stringify(value));
}
export function candidateFieldSelection(candidate: AiCandidate | undefined): readonly ReadingFieldSelection[] {
  return overviewPayloadOptional(candidate)?.fields.map(field => ({ candidateId: candidate!.id, fieldId: field.field })) ?? [];
}
export function resolveReadingSelection(presentation: ReadingPresentation | undefined, candidates: readonly AiCandidate[], latest: AiCandidate | undefined): readonly ReadingFieldSelection[] {
  if (presentation === undefined) return candidateFieldSelection(latest);
  if (presentation.fields.length === 0) return [];
  const available = presentation.fields.filter(field => candidates.some(candidate => candidate.id === field.candidateId && candidate.reviewState !== "rejected" && candidateFieldSelection(candidate).some(value => value.fieldId === field.fieldId)));
  return available.length > 0 ? available : candidateFieldSelection(latest);
}
function overviewPayloadOptional(candidate: AiCandidate | undefined) { return candidate === undefined ? undefined : overviewPayload(candidate); }
export function overwriteFieldSelection(fields: readonly ReadingFieldSelection[], candidates: readonly AiCandidate[], scope: ReadingOverwriteScope, units: readonly StructuredReadingUnit[] = []): readonly ReadingFieldSelection[] {
  return fields.filter(field => {
    if (scope === "all") return true;
    const candidate = candidates.find(value => value.id === field.candidateId);
    if (candidate === undefined) return false;
    const confirmation = [...candidate.overviewFieldConfirmations].filter(value => value.fieldKind === field.fieldId && (value.active || value.reviewResetAt !== undefined)).sort((a, b) => Number(b.active) - Number(a.active) || b.targetAppliedRevision - a.targetAppliedRevision)[0];
    const unit = units.find(value => value.id === confirmation?.targetReadingUnitId);
    const status = confirmation?.active ? "trusted" : unit !== undefined && confirmation !== undefined && unit.revision > confirmation.targetAppliedRevision ? "reviewable" : overviewFieldTrustStatus(candidate, field.fieldId);
    return scope === "ai_unreviewed" ? status === "untrusted" || status === "neutral" : status === "reviewable";
  });
}
export function mergeReadingSelection(current: readonly ReadingFieldSelection[], generated: AiCandidate, targets: readonly ReadingFieldSelection[]): readonly ReadingFieldSelection[] {
  const newFields = candidateFieldSelection(generated);
  const selected = new Set(targets.map(field => field.fieldId));
  const existing = new Set(current.map(field => field.fieldId));
  return [...current.map(field => selected.has(field.fieldId) ? newFields.find(value => value.fieldId === field.fieldId) ?? field : field),
    ...newFields.filter(field => !existing.has(field.fieldId))];
}
