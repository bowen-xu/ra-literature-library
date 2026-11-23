/** Concept normalization and preparation migrated from native concepts.rs. */

export interface ConceptDraft {
  readonly id?: string | null; readonly label: string; readonly explanation: string; readonly disambiguation: string;
  readonly domain: string; readonly tradition: string; readonly period: string; readonly preferredTerm: string;
  readonly language?: string | null; readonly changeReason?: string | null; readonly expectedRevision?: number | null;
}
export type ConceptRequest =
  | {readonly kind: 'search'; readonly query: string}
  | {readonly kind: 'save'; readonly draft: ConceptDraft};
export type ConceptRejection = 'emptyNameContext' | 'invalidNameLength' | 'fieldsTooLong' | 'emptyTerm' | 'termTooLong' | 'newExpectedRevision';
export interface ConceptTermPlan {readonly text: string; readonly normalizedText: string; readonly language: string; readonly rejection: 'emptyTerm' | 'termTooLong' | null}
export interface ConceptDetails {readonly label: string; readonly explanation: string; readonly disambiguation: string; readonly domain: string; readonly tradition: string; readonly period: string; readonly changeReason: string | null | undefined}
export interface ConceptRules {readonly provenanceKind: 'human_original'; readonly editorKind: 'human'; readonly initialRevision: number; readonly termObjectKind: 'term'; readonly conceptObjectKind: 'concept'; readonly termReason: 'manual_create'; readonly conceptReason: string; readonly newExpectedRejection: 'newExpectedRevision' | null}
export type ConceptPlan =
  | {readonly kind: 'search'; readonly query: string; readonly pattern: string; readonly normalized: string}
  | {readonly kind: 'save'; readonly draft: ConceptDraft; readonly details: ConceptDetails; readonly term: ConceptTermPlan; readonly rules: ConceptRules};
export type ConceptPreparation =
  | {readonly status: 'ready'; readonly plan: ConceptPlan}
  | {readonly status: 'rejected'; readonly input: ConceptRequest; readonly reason: ConceptRejection};

export function normalizeTerm(value: string): string {return value.trim().split(/\s+/u).filter(Boolean).join(' ').toLocaleLowerCase();}
export function validateDetails(details: ConceptDetails): ConceptRejection | null {
  const label = details.label.trim();
  if (label === '' || [...label].length > 500) return 'invalidNameLength';
  if (label.split('`').some(part => part.trim() === '')) return 'emptyNameContext';
  return [...details.disambiguation].length > 1_000 || [...details.domain].length > 500 || [...details.tradition].length > 500 || [...details.period].length > 200 ? 'fieldsTooLong' : null;
}
export function prepareTerm(text: string, language: string): ConceptTermPlan {
  const trimmed = text.trim(), lang = language.trim(), normalizedText = normalizeTerm(trimmed);
  const rejection = normalizedText === '' ? 'emptyTerm' : [...trimmed].length > 500 || [...lang].length > 32 ? 'termTooLong' : null;
  return {text: trimmed, normalizedText, language: lang, rejection};
}
export function normalizeDetails(details: ConceptDetails): ConceptDetails {
  return {label: details.label.trim(), explanation: details.explanation.trim(), disambiguation: details.disambiguation.trim(), domain: details.domain.trim(), tradition: details.tradition.trim(), period: details.period.trim(), changeReason: details.changeReason};
}
export function prepareSearch(query: string): {readonly normalized: string; readonly pattern: string} {const normalized = normalizeTerm(query); return {normalized, pattern: `%${normalized}%`};}
export function conceptReason(changeReason: string | null | undefined, existing: boolean): string {return changeReason ?? (existing ? 'manual_edit' : 'manual_create');}

export function prepareConcept(input: ConceptRequest): ConceptPreparation {
  if (input.kind === 'search') {const search = prepareSearch(input.query); return {status: 'ready', plan: {kind: 'search', query: input.query, pattern: search.pattern, normalized: search.normalized}};}
  const details: ConceptDetails = {label: input.draft.label, explanation: input.draft.explanation, disambiguation: input.draft.disambiguation, domain: input.draft.domain, tradition: input.draft.tradition, period: input.draft.period, changeReason: input.draft.changeReason};
  const detailsError = validateDetails(details);
  if (detailsError !== null) return {status: 'rejected', input, reason: detailsError};
  const term = prepareTerm(input.draft.preferredTerm, input.draft.language ?? '');
  return {status: 'ready', plan: {kind: 'save', draft: input.draft, details: normalizeDetails(details), term,
    rules: {provenanceKind: 'human_original', editorKind: 'human', initialRevision: 1, termObjectKind: 'term', conceptObjectKind: 'concept', termReason: 'manual_create',
      conceptReason: conceptReason(input.draft.changeReason, input.draft.id !== undefined && input.draft.id !== null),
      newExpectedRejection: input.draft.id == null && input.draft.expectedRevision !== undefined && input.draft.expectedRevision !== null ? 'newExpectedRevision' : null}}};
}
