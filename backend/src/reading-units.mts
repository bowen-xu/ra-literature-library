/** Manual structured-reading-unit preparation migrated from native/reading_units.rs. */

export const UNIT_KINDS = [
  'research_question', 'approach', 'key_result', 'conclusion', 'limitation',
  'open_question', 'argument', 'objection', 'response', 'other',
] as const;
export const EPISTEMIC_ROLES = [
  'source_paraphrase', 'synthesis', 'inference', 'hypothesis', 'question', 'working_note',
] as const;
const EVIDENCE_STANCES = ['supports', 'opposes', 'context'] as const;

export type ReadingUnitRejection = 'emptyBody' | 'titleTooLong' | 'unitKind' | 'epistemicRole' | 'evidenceStance' | 'newExpectedRevision';
export interface StructuredReadingUnitDraft {
  readonly id: string | null; readonly projectId: string | null; readonly paperId: string | null;
  readonly unitKind: string; readonly title: string; readonly body: string; readonly epistemicRole: string;
  readonly anchorId: string | null; readonly evidenceStance: string | null; readonly evidenceRationale: string | null;
  readonly expectedRevision: bigint | null; readonly changeReason: string | null;
}
export type ReadingUnitRequest =
  | {readonly kind: 'list'; readonly projectId: string | null; readonly paperId: string | null}
  | {readonly kind: 'save'; readonly draft: StructuredReadingUnitDraft};
export interface ReadingUnitRules {
  readonly provenanceKind: 'human_original'; readonly objectKind: 'reading_unit'; readonly editorKind: 'human';
  readonly changeReason: string; readonly initialRevision: bigint; readonly newExpectedRejection: ReadingUnitRejection | null;
}
export type ReadingUnitPlan =
  | {readonly kind: 'list'; readonly projectId: string | null; readonly paperId: string | null}
  | {readonly kind: 'save'; readonly draft: StructuredReadingUnitDraft; readonly title: string; readonly body: string;
    readonly evidenceStance: string; readonly evidenceRationale: string; readonly rules: ReadingUnitRules};
export type ReadingUnitPreparation =
  | {readonly status: 'ready'; readonly plan: ReadingUnitPlan}
  | {readonly status: 'rejected'; readonly input: ReadingUnitRequest; readonly reason: ReadingUnitRejection};

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {return values.includes(value as T);}

export function validateReadingUnitDraft(draft: StructuredReadingUnitDraft): ReadingUnitRejection | null {
  if (draft.body.trim() === '') return 'emptyBody';
  if ([...draft.title.trim()].length > 240) return 'titleTooLong';
  if (!isOneOf(draft.unitKind, UNIT_KINDS)) return 'unitKind';
  if (!isOneOf(draft.epistemicRole, EPISTEMIC_ROLES)) return 'epistemicRole';
  if (!isOneOf(draft.evidenceStance ?? 'context', EVIDENCE_STANCES)) return 'evidenceStance';
  return null;
}

export function prepareReadingUnit(input: ReadingUnitRequest): ReadingUnitPreparation {
  if (input.kind === 'list') return {status: 'ready', plan: {kind: 'list', projectId: input.projectId, paperId: input.paperId}};
  const draft = input.draft;
  const normalizedTitle = draft.title.trim(), normalizedBody = draft.body.trim();
  const rejection = validateReadingUnitDraft(draft);
  if (rejection !== null) return {status: 'rejected', input, reason: rejection};
  return {status: 'ready', plan: {kind: 'save', draft, title: normalizedTitle, body: normalizedBody,
    evidenceStance: draft.evidenceStance ?? 'context', evidenceRationale: (draft.evidenceRationale ?? '').trim(),
    rules: {provenanceKind: 'human_original', objectKind: 'reading_unit', editorKind: 'human',
      changeReason: draft.changeReason ?? 'manual_save', initialRevision: 1n,
      newExpectedRejection: draft.id === null && draft.expectedRevision !== null ? 'newExpectedRevision' : null}}};
}
