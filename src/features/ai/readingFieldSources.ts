import { overviewFieldTitle, type AiCandidate, type AiEvidenceItem, type PaperTemplateSnapshot, type PaperOverviewFieldV1 } from "@research-assistant/core/ai";
import { candidateBelongsToPaper } from "./structuredReadingReviewModel";

export interface ReadingFieldSource {
  readonly id: string;
  readonly fieldId: string;
  readonly fieldTitle: string;
  readonly color?: string;
  readonly evidence: AiEvidenceItem;
}

import { readingFieldColor } from "@research-assistant/workbench-sdk/structured-field-colors";
export { readingFieldColor, READING_FIELD_PALETTE } from "@research-assistant/workbench-sdk/structured-field-colors";

/** Narrow a frozen excerpt to a literal statement quote, preserving uniqueness context. */
function quotedEvidence(evidence: AiEvidenceItem, quote: string): AiEvidenceItem {
  const index = evidence.quoteExact.indexOf(quote);
  const unique = index >= 0 && index === evidence.quoteExact.lastIndexOf(quote);
  return { ...evidence, relationKind: "direct_quote", quoteExact: quote,
    quotePrefix: unique ? (evidence.quotePrefix + evidence.quoteExact.slice(0, index)).slice(-160) : "",
    quoteSuffix: unique ? (evidence.quoteExact.slice(index + quote.length) + evidence.quoteSuffix).slice(0, 160) : "" };
}

export function fieldReadingSources(candidate: AiCandidate, field: PaperOverviewFieldV1): readonly ReadingFieldSource[] {
  const payload = candidate.revisions.find(value => value.revision === candidate.currentRevision)?.payload;
  const title = payload?.kind === "paper_overview_unit_v1" ? overviewFieldTitle(payload, field.field) : field.field;
  const sources = new Map<string, ReadingFieldSource>();
  for (const statement of field.statements) for (const key of statement.evidenceItemIds) {
    const evidence = candidate.evidenceBundle.items.find(item => item.citationKey === key);
    if (evidence === undefined) continue;
    const quote = statement.evidenceQuotes?.find(source => source.evidenceItemId === key)?.quote;
    const id = `${candidate.id}:${field.field}:${evidence.id}:${quote ?? evidence.quoteExact}`;
    sources.set(id, { id, fieldId: field.field, fieldTitle: title, color: readingFieldColor(field.field, payload?.kind === "paper_overview_unit_v1" ? payload.paperTemplate?.fields.find(value => value.id === field.field)?.color : undefined), evidence: quote === undefined ? evidence : quotedEvidence(evidence, quote) });
  }
  return [...sources.values()];
}

export function latestReadingSources(candidates: readonly AiCandidate[], paperId: string, template?: PaperTemplateSnapshot): readonly ReadingFieldSource[] {
  const candidate = candidates.filter(value => value.reviewState !== "rejected" && candidateBelongsToPaper(value, paperId)
    && value.revisions.find(revision => revision.revision === value.currentRevision)?.payload.kind === "paper_overview_unit_v1")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (candidate === undefined) return [];
  const payload = candidate.revisions.find(value => value.revision === candidate.currentRevision)?.payload;
  return payload?.kind === "paper_overview_unit_v1" ? payload.fields.flatMap(field => fieldReadingSources(candidate, field).map(source => ({ ...source, color: readingFieldColor(field.field, template?.fields.find(value => value.id === field.field)?.color ?? source.color) }))) : [];
}
