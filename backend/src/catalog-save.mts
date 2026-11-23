/** Manual catalog-save decision preparation migrated from the native plugin. */

export interface CatalogCreator {familyName: string; givenName: string; literalName: string; role: string}
export interface PreparedDoi {readonly display: string; readonly normalized: string}
export interface CatalogDraft {
  id: string | null; itemType: string; title: string; abstractText: string; issuedYear: number | null;
  containerTitle: string; conferenceName: string; proceedingsTitle: string; place: string; volume: string;
  issue: string; pages: string; doi: string; url: string; language: string; bibtexKey: string;
  rawBibtex: string | null; creators: readonly CatalogCreator[]; tags: readonly string[]; sourceKind: string | null;
}
export interface CatalogSaveInput {readonly draft: CatalogDraft; readonly doi: PreparedDoi}
export interface CatalogSaveItem {
  readonly id: string | null; readonly itemType: string; readonly title: string; readonly abstractText: string;
  readonly issuedYear: number | null; readonly containerTitle: string; readonly conferenceName: string;
  readonly proceedingsTitle: string; readonly place: string; readonly volume: string; readonly issue: string;
  readonly pages: string; readonly url: string; readonly language: string; readonly bibtexKey: string;
  readonly rawBibtex: string | null;
}
export interface CatalogSavePlan {
  readonly item: CatalogSaveItem; readonly creators: readonly CatalogCreator[]; readonly doi: PreparedDoi | null;
  readonly tags: readonly string[]; readonly provenance: {readonly fields: readonly string[]; readonly sourceKind: string; readonly confirmedByUser: boolean};
  readonly duplicates: {readonly normalizedTitle: string; readonly doiReason: string; readonly doiConfidence: number; readonly titleReason: string; readonly titleConfidence: number};
}
export type CatalogSaveRejection = {readonly kind: 'unsupportedType'; readonly itemType: string} | {readonly kind: 'emptyTitle'};
export type CatalogSaveOutcome = {readonly kind: 'planned'; readonly plan: CatalogSavePlan} | {readonly kind: 'rejected'; readonly reason: CatalogSaveRejection};

const SUPPORTED_ITEM_TYPES = new Set([
  'journalArticle', 'magazineArticle', 'newspaperArticle', 'conferencePaper', 'book', 'bookSection',
  'preprint', 'manuscript', 'thesis', 'report', 'dataset', 'computerProgram', 'webpage', 'standard', 'patent', 'document',
]);
export const CATALOG_SAVE_FIELD_NAMES = [
  'itemType', 'title', 'abstractText', 'issuedYear', 'containerTitle', 'conferenceName', 'proceedingsTitle',
  'place', 'volume', 'issue', 'pages', 'doi', 'url', 'language', 'bibtexKey', 'creators', 'tags',
] as const;

export function isSupportedItemType(itemType: string): boolean {return SUPPORTED_ITEM_TYPES.has(itemType);}

export function prepareCatalogSave({draft, doi}: CatalogSaveInput): CatalogSaveOutcome {
  if (!isSupportedItemType(draft.itemType)) return {kind: 'rejected', reason: {kind: 'unsupportedType', itemType: draft.itemType}};
  const title = draft.title.trim();
  if (title.length === 0) return {kind: 'rejected', reason: {kind: 'emptyTitle'}};
  const sourceKind = draft.sourceKind ?? 'user';
  return {kind: 'planned', plan: {
    item: {
      id: draft.id, itemType: draft.itemType, title, abstractText: draft.abstractText.trim(), issuedYear: draft.issuedYear,
      containerTitle: draft.containerTitle.trim(), conferenceName: draft.conferenceName.trim(), proceedingsTitle: draft.proceedingsTitle.trim(),
      place: draft.place.trim(), volume: draft.volume.trim(), issue: draft.issue.trim(), pages: draft.pages.trim(), url: draft.url.trim(),
      language: draft.language.trim(), bibtexKey: draft.bibtexKey.trim(), rawBibtex: draft.rawBibtex,
    },
    creators: draft.creators.map(creator => ({...creator, familyName: creator.familyName.trim(), givenName: creator.givenName.trim(), literalName: creator.literalName.trim()})),
    doi: doi.normalized.length === 0 ? null : doi,
    tags: draft.tags.map(tag => tag.trim()).filter(tag => tag.length > 0),
    provenance: {fields: [...CATALOG_SAVE_FIELD_NAMES], sourceKind, confirmedByUser: sourceKind === 'user'},
    duplicates: {normalizedTitle: title.toLocaleLowerCase(), doiReason: 'doi', doiConfidence: 1, titleReason: 'normalized_title_year', titleConfidence: 0.72},
  }};
}
