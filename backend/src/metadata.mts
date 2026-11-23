/** Literature metadata field policy and preparation migrated from the native plugin. */

import {isSupportedItemType, prepareCatalogSave, type CatalogCreator, type CatalogDraft, type PreparedDoi, type CatalogSaveOutcome} from './catalog-save.mts';
export type {CatalogDraft} from './catalog-save.mts';

export const METADATA_FIELD_NAMES = ['itemType', 'title', 'abstractText', 'issuedYear', 'containerTitle', 'conferenceName', 'proceedingsTitle', 'place', 'volume', 'issue', 'pages', 'doi', 'url', 'language', 'bibtexKey', 'creators', 'tags'] as const;
export type MetadataFieldName = typeof METADATA_FIELD_NAMES[number];
export type MetadataPatch =
  | {readonly fieldName: 'itemType'; readonly value: string} | {readonly fieldName: 'title'; readonly value: string} | {readonly fieldName: 'abstractText'; readonly value: string} | {readonly fieldName: 'issuedYear'; readonly value: number | null} | {readonly fieldName: 'containerTitle'; readonly value: string} | {readonly fieldName: 'conferenceName'; readonly value: string} | {readonly fieldName: 'proceedingsTitle'; readonly value: string} | {readonly fieldName: 'place'; readonly value: string} | {readonly fieldName: 'volume'; readonly value: string} | {readonly fieldName: 'issue'; readonly value: string} | {readonly fieldName: 'pages'; readonly value: string} | {readonly fieldName: 'doi'; readonly value: string} | {readonly fieldName: 'url'; readonly value: string} | {readonly fieldName: 'language'; readonly value: string} | {readonly fieldName: 'bibtexKey'; readonly value: string} | {readonly fieldName: 'creators'; readonly value: readonly CatalogCreator[]} | {readonly fieldName: 'tags'; readonly value: readonly string[]};
export type MetadataRejection = {readonly kind: 'unsupportedType'; readonly itemType: string} | {readonly kind: 'emptyTitle'} | {readonly kind: 'invalidFields'; readonly reason: string} | {readonly kind: 'notFound'};
export type DeferredMetadataPatch = {readonly status: 'ready'; readonly patch: MetadataPatch; readonly doi: PreparedDoi | null} | {readonly status: 'rejected'; readonly error: MetadataRejection};
export interface MetadataProvenance {readonly sourceKind: string; readonly sourceReference: string | null; readonly confirmedByUser: boolean}
export interface MetadataFieldDiff {readonly fieldName: string; readonly currentValue: string; readonly candidateValue: string; readonly userConfirmed: boolean}
export interface MetadataItem extends CatalogDraft {readonly metadataSources: readonly {readonly fieldName: string; readonly confirmedByUser: boolean}[]}
export interface MetadataCandidateHeader {readonly itemId: string | null; readonly sourceKind: string; readonly sourceReference: string | null; readonly importResultId: string | null}
export interface MetadataFieldDecision {readonly fieldName: string; readonly choice: 'candidate' | 'current'}
export type MetadataPreparation =
  | {readonly kind: 'update'; readonly plan: {readonly input: unknown; readonly fieldName: string; readonly patch: DeferredMetadataPatch; readonly sources: ReturnType<typeof metadataUpdateSources>; readonly derivation: ReturnType<typeof metadataDerivationPolicy>}}
  | {readonly kind: 'confirm'; readonly outcome: unknown}
  | {readonly kind: 'fullApply'; readonly plan: {readonly input: unknown; readonly save: CatalogSaveOutcome; readonly fieldSources: readonly {readonly fieldName: string; readonly provenance: MetadataProvenance}[]}}
  | {readonly kind: 'fieldsApply'; readonly outcome: unknown}
  | {readonly kind: 'reject'; readonly plan: {readonly input: unknown; readonly zeroAffected: MetadataRejection}};

export function metadataFieldName(patch: MetadataPatch): MetadataFieldName {return patch.fieldName;}
export function prepareMetadataPatch(patch: MetadataPatch, doi: PreparedDoi | null): DeferredMetadataPatch {
  switch (patch.fieldName) {
    case 'itemType': return isSupportedItemType(patch.value) ? {status: 'ready', patch, doi: null} : {status: 'rejected', error: {kind: 'unsupportedType', itemType: patch.value}};
    case 'title': return patch.value.trim().length === 0 ? {status: 'rejected', error: {kind: 'emptyTitle'}} : {status: 'ready', patch: {fieldName: 'title', value: patch.value.trim()}, doi: null};
    case 'doi': if (doi === null) throw new Error('literature_metadata_input_invalid:doi'); return {status: 'ready', patch: {fieldName: 'doi', value: doi.display}, doi: doi.normalized.length === 0 ? null : doi};
    case 'creators': return {status: 'ready', patch: {fieldName: 'creators', value: patch.value.map(creator => ({...creator, familyName: creator.familyName.trim(), givenName: creator.givenName.trim(), literalName: creator.literalName.trim()}))}, doi: null};
    case 'tags': return {status: 'ready', patch: {fieldName: 'tags', value: patch.value.map(tag => tag.trim()).filter(tag => tag.length > 0)}, doi: null};
    case 'issuedYear': return {status: 'ready', patch, doi: null};
    default: return {status: 'ready', patch: {fieldName: patch.fieldName, value: patch.value.trim()} as MetadataPatch, doi: null};
  }
}
export function metadataUpdateSources(): {readonly unconfirmed: MetadataProvenance; readonly otherwise: MetadataProvenance} {return {unconfirmed: {sourceKind: 'user_edit', sourceReference: null, confirmedByUser: false}, otherwise: {sourceKind: 'user', sourceReference: null, confirmedByUser: true}};}
export function metadataDerivationPolicy(): {readonly titleRule: 'unicodeLowercase'; readonly doiReason: string; readonly doiConfidence: number; readonly titleReason: string; readonly titleConfidence: number} {return {titleRule: 'unicodeLowercase', doiReason: 'doi', doiConfidence: 1, titleReason: 'normalized_title_year', titleConfidence: 0.72};}
export function confirmMetadataFields(fields: readonly string[]): readonly string[] | MetadataRejection {if (fields.length === 0) return {kind: 'invalidFields', reason: '至少选择一个字段'}; const unique = [...new Set(fields)].sort(); const invalid = unique.find(field => !(METADATA_FIELD_NAMES as readonly string[]).includes(field)); return invalid === undefined ? unique : {kind: 'invalidFields', reason: invalid};}
export function draftValues(draft: CatalogDraft, normalizedDoi: string): readonly (readonly [MetadataFieldName, string])[] {return [['itemType', draft.itemType], ['title', draft.title], ['abstractText', draft.abstractText], ['issuedYear', draft.issuedYear === null ? '' : String(draft.issuedYear)], ['containerTitle', draft.containerTitle], ['conferenceName', draft.conferenceName], ['proceedingsTitle', draft.proceedingsTitle], ['place', draft.place], ['volume', draft.volume], ['issue', draft.issue], ['pages', draft.pages], ['doi', normalizedDoi], ['url', draft.url], ['language', draft.language], ['bibtexKey', draft.bibtexKey], ['creators', JSON.stringify(draft.creators)], ['tags', JSON.stringify(draft.tags)]];}
export function diffMetadata(current: MetadataItem | null, candidate: CatalogDraft, currentNormalizedDoi: string, candidateNormalizedDoi: string): readonly MetadataFieldDiff[] {const currentValues = current === null ? [] : draftValues(current, currentNormalizedDoi); const confirmed = new Set(current?.metadataSources.filter(source => source.confirmedByUser).map(source => source.fieldName) ?? []); return draftValues(candidate, candidateNormalizedDoi).flatMap(([fieldName, candidateValue]) => {const currentValue = currentValues.find(([name]) => name === fieldName)?.[1] ?? ''; return currentValue === candidateValue ? [] : [{fieldName, currentValue, candidateValue, userConfirmed: confirmed.has(fieldName)}];});}
export function patchFromDraft(fieldName: string, draft: CatalogDraft): MetadataPatch | MetadataRejection {if (!(METADATA_FIELD_NAMES as readonly string[]).includes(fieldName)) return {kind: 'invalidFields', reason: fieldName}; return {fieldName, value: draft[fieldName as keyof CatalogDraft] as never} as MetadataPatch;}

export function prepareMetadata(input: any): MetadataPreparation {
  if (input.kind === 'update') {
    const patch = input.input.patch as MetadataPatch;
    return {kind: 'update', plan: {input: input.input, fieldName: metadataFieldName(patch), patch: prepareMetadataPatch(patch, input.input.doi ?? null), sources: metadataUpdateSources(), derivation: metadataDerivationPolicy()}};
  }
  if (input.kind === 'confirm') {
    const fields = confirmMetadataFields(input.input.fieldNames);
    return {kind: 'confirm', outcome: Array.isArray(fields)
      ? {status: 'ready', input: input.input, fields: fields.map(fieldName => ({fieldName, missingProvenance: {kind: 'invalidFields', reason: `字段 ${fieldName} 没有可确认的来源`}}))}
      : {status: 'rejected', input: input.input, error: fields}};
  }
  if (input.kind === 'reject') return {kind: 'reject', plan: {input: input.input, zeroAffected: {kind: 'notFound'}}};
  if (input.kind === 'fullApply') {
    const value = input.input, draft = {...value.draft, id: value.header.itemId, sourceKind: value.header.sourceKind};
    const candidateValues = draftValues(value.candidate, value.candidateNormalizedDoi);
    const fieldSources = draftValues(value.draft, value.doi.normalized).map(([fieldName, fieldValue]) => ({fieldName, provenance: {sourceKind: fieldValue === (candidateValues.find(([name]: readonly [string, string]) => name === fieldName)?.[1] ?? '') ? value.header.sourceKind : 'user', sourceReference: value.header.sourceReference, confirmedByUser: true}}));
    return {kind: 'fullApply', plan: {input: value, save: prepareCatalogSave({draft, doi: value.doi}), fieldSources}};
  }
  const value = input.input, expected = diffMetadata(value.current, value.candidate, value.currentNormalizedDoi, value.candidateDoi.normalized).map(diff => diff.fieldName).sort();
  const reviewed = value.decisions.map((decision: MetadataFieldDecision) => decision.fieldName).sort();
  if (new Set(reviewed).size !== reviewed.length || reviewed.length !== expected.length || reviewed.some((field: string, index: number) => field !== expected[index])) return {kind: 'fieldsApply', outcome: {status: 'rejected', input: value, error: {kind: 'invalidFields', reason: '必须审阅候选中的全部差异字段'}}};
  const decisions = value.decisions.map((decision: MetadataFieldDecision) => decision.choice === 'candidate'
    ? {choice: 'candidate', fieldName: decision.fieldName, patch: prepareMetadataPatch(patchFromDraft(decision.fieldName, value.candidate) as MetadataPatch, value.candidateDoi), provenance: {sourceKind: value.header.sourceKind, sourceReference: value.header.sourceReference, confirmedByUser: value.candidateTrust === 'trusted'}}
    : {choice: 'current', fieldName: decision.fieldName, onMissing: {sourceKind: 'user', sourceReference: null, confirmedByUser: true}});
  return {kind: 'fieldsApply', outcome: {status: 'ready', input: value, decisions, derivation: metadataDerivationPolicy()}};
}
