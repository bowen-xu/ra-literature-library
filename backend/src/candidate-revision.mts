/** Candidate revision and confirmed-field protection migrated from the native plugin. */

import {createHash} from 'node:crypto';

export interface EvidenceQuote {readonly citationKey: string; readonly quoteExact: string}
export interface CandidateStatement {readonly id: string; readonly evidenceQuotes?: readonly {readonly evidenceItemId: string; readonly quote: string}[] | null}
export interface CandidateField {readonly field: string; readonly statements: readonly CandidateStatement[]; readonly [key: string]: unknown}
export interface CandidatePayload {readonly kind: string; readonly fields?: readonly CandidateField[]; readonly [key: string]: unknown}

const invalid = (message: string): string => message;
export function fieldHash(field: unknown): string {return createHash('sha256').update(JSON.stringify(field)).digest('hex');}
export function canonicalCandidateJson(payload: CandidatePayload): string {return JSON.stringify(payload);}
export function quotesAndKind(payload: CandidatePayload, candidateKind: string, evidence: readonly EvidenceQuote[]): string | null {
  if (payload.kind !== candidateKind) return invalid('候选修订不能改变候选类型');
  if (payload.kind !== 'paper_overview_unit_v1') return null;
  const bundle = new Map(evidence.map(item => [item.citationKey, item.quoteExact]));
  for (const field of payload.fields ?? []) for (const statement of field.statements) for (const quote of statement.evidenceQuotes ?? []) {
    const source = bundle.get(quote.evidenceItemId); if (source === undefined || !source.includes(quote.quote)) return invalid(`结构化陈述 ${statement.id} 的摘录不是来源 ${quote.evidenceItemId} 中的连续原文`);
  }
  return null;
}
export function confirmedFieldsUnchanged(payload: CandidatePayload, active: readonly (readonly [string, string])[]): string | null {
  if (payload.kind !== 'paper_overview_unit_v1') return null;
  const hashes = new Map(active); for (const field of payload.fields ?? []) {const expected = hashes.get(field.field); if (expected !== undefined && fieldHash(field) !== expected) return `字段 ${field.field} 已确认，不能再修改候选内容`;}
  return null;
}
