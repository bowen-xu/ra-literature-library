/** Structured candidate validation migrated from native structured_validation.rs. */

import {decodeAiCandidatePayload} from '@research-assistant/core/ai';

export interface StructuredEvidenceQuote {readonly citationKey: string; readonly quoteExact: string}
export interface StructuredValidationInput {readonly target: 'portrait' | 'overview'; readonly candidateJson: string; readonly evidence: readonly StructuredEvidenceQuote[]}
export type StructuredValidationOutcome =
  | {readonly status: 'validated'; readonly input: StructuredValidationInput; readonly canonicalJson: string}
  | {readonly status: 'rejected'; readonly input: StructuredValidationInput; readonly error: {readonly code: 'invalid_input'; readonly message: string}};

function error(message: string): {readonly code: 'invalid_input'; readonly message: string} {return {code: 'invalid_input', message};}
function validateQuotes(payload: unknown, evidence: readonly StructuredEvidenceQuote[]): string | null {
  const sources = new Map(evidence.map(item => [item.citationKey, item.quoteExact]));
  const row = payload as Record<string, unknown>;
  const fields = Array.isArray(row.fields) ? row.fields : [];
  for (const field of fields) {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) continue;
    const statements: readonly unknown[] = Array.isArray((field as Record<string, unknown>).statements) ? (field as Record<string, unknown>).statements as readonly unknown[] : [];
    for (const statement of statements) {
      if (statement === null || typeof statement !== 'object' || Array.isArray(statement)) continue;
      const value = statement as Record<string, unknown>, id = typeof value.id === 'string' ? value.id : '';
      const quotes = Array.isArray(value.evidenceQuotes) ? value.evidenceQuotes : [];
      for (const quote of quotes) {
        if (quote === null || typeof quote !== 'object' || Array.isArray(quote)) return `结构化陈述 ${id} 的摘录不是来源中的连续原文`;
        const source = quote as Record<string, unknown>, key = typeof source.evidenceItemId === 'string' ? source.evidenceItemId : '', text = typeof source.quote === 'string' ? source.quote : '';
        if (!sources.has(key) || !(sources.get(key) ?? '').includes(text)) return `结构化陈述 ${id} 的摘录不是来源 ${key} 中的连续原文`;
      }
    }
  }
  return null;
}

export function validateStructured(input: StructuredValidationInput): StructuredValidationOutcome {
  try {
    const value: unknown = JSON.parse(input.candidateJson);
    const payload = decodeAiCandidatePayload(value, {allowedEvidenceItemIds: new Set(input.evidence.map(item => item.citationKey))});
    const expected = input.target === 'portrait' ? 'paper_portrait_v1' : 'paper_overview_unit_v1';
    if (payload.kind !== expected) return {status: 'rejected', input, error: error('内容类型与目标资源不匹配')};
    const quoteError = validateQuotes(value, input.evidence);
    if (quoteError !== null) return {status: 'rejected', input, error: error(quoteError)};
    return {status: 'validated', input, canonicalJson: JSON.stringify(payload)};
  } catch (cause) {
    return {status: 'rejected', input, error: error(cause instanceof Error ? cause.message : '结构化内容无效')};
  }
}
