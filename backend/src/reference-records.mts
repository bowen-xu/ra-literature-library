/** Reference validation and save-value preparation migrated from the native plugin. */

export interface ReferenceMetadataField {readonly name: string; readonly value: string; readonly sourceKind: string; readonly confirmedByUser: boolean}
export interface ReferenceRecordDraft {
  readonly id: string | null; readonly citingPaperId: string; readonly sourceAnchorId: string; readonly rawText: string;
  readonly fields: readonly ReferenceMetadataField[]; readonly parseState: string; readonly identityState: string;
  readonly matchedItemId: string | null; readonly semanticState: string; readonly usageKind: string | null;
  readonly usageSummary: string; readonly usageAnchorId: string | null; readonly expectedRevision: bigint | null;
  readonly changeReason: string;
}
export interface ReferenceRecordPlan {
  readonly draft: ReferenceRecordDraft; readonly rawText: string; readonly usageSummary: string;
  readonly changeReason: string; readonly fieldsJson: string; readonly snapshotJson: string;
}
export type ReferenceRecordRejection = 'invalidFields' | 'invalidStates' | 'invalidMetadataFields' | 'fieldsEncoding' | 'snapshotEncoding';
export type ReferenceRecordPreparation =
  | {readonly status: 'ready'; readonly plan: ReferenceRecordPlan}
  | {readonly status: 'rejected'; readonly reason: ReferenceRecordRejection};

export function validateReferenceDraft(draft: ReferenceRecordDraft): ReferenceRecordRejection | null {
  if (draft.rawText.trim().length === 0 || [...draft.rawText].length > 8_000
    || draft.changeReason.trim().length === 0 || [...draft.changeReason].length > 120
    || [...draft.usageSummary].length > 4_000) return 'invalidFields';
  const parseValid = ['unparsed', 'parsed', 'failed'].includes(draft.parseState);
  const identityValid = ['unverified', 'matched_existing', 'verified_external', 'ambiguous', 'not_found'].includes(draft.identityState);
  const semanticValid = draft.semanticState === 'unreviewed'
    ? draft.usageKind === null && draft.usageSummary.length === 0 && draft.usageAnchorId === null
    : draft.semanticState === 'reviewed'
      ? ['mentions', 'uses_method', 'supports', 'opposes', 'extends', 'background'].includes(draft.usageKind ?? '')
        && draft.usageSummary.trim().length > 0 && draft.usageAnchorId !== null : false;
  const identityTargetValid = (draft.identityState === 'matched_existing') === (draft.matchedItemId !== null);
  if (!parseValid || !identityValid || !semanticValid || !identityTargetValid) return 'invalidStates';
  const names = new Set<string>();
  for (const field of draft.fields) {
    if (!['title', 'authors', 'year', 'doi'].includes(field.name)
      || !['reference_text', 'external_metadata', 'ai_inference', 'human'].includes(field.sourceKind)
      || [...field.value].length > 2_000 || names.has(field.name)
      || (field.sourceKind === 'ai_inference' && field.confirmedByUser)) return 'invalidMetadataFields';
    names.add(field.name);
  }
  return null;
}

export function prepareReferenceRecord(draft: ReferenceRecordDraft): ReferenceRecordPreparation {
  const rejection = validateReferenceDraft(draft);
  if (rejection !== null) return {status: 'rejected', reason: rejection};
  let fieldsJson: string, snapshotJson;
  try {fieldsJson = JSON.stringify(draft.fields); if (fieldsJson === undefined) return {status: 'rejected', reason: 'fieldsEncoding'};}
  catch {return {status: 'rejected', reason: 'fieldsEncoding'};}
  try {snapshotJson = JSON.stringify(draft, (_key, value: unknown) => typeof value === 'bigint' ? Number(value) : value); if (snapshotJson === undefined) return {status: 'rejected', reason: 'snapshotEncoding'};}
  catch {return {status: 'rejected', reason: 'snapshotEncoding'};}
  return {status: 'ready', plan: {
    draft,
    rawText: draft.rawText.trim(),
    usageSummary: draft.usageSummary.trim(),
    changeReason: draft.changeReason.trim(),
    fieldsJson,
    snapshotJson,
  }};
}

export function referenceRecordRejectionMessage(reason: ReferenceRecordRejection): string {
  return ({invalidFields: '参考条目字段无效', invalidStates: '参考条目状态组合无效', invalidMetadataFields: '参考条目解析字段或来源无效', fieldsEncoding: '参考字段无法序列化', snapshotEncoding: '参考条目版本无法序列化'} as const)[reason];
}
