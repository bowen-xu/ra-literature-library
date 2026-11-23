/**
 * Catalog planning and row projection migrated from native/catalog.rs and
 * native/catalog/bibliography.rs. SQL execution, resource authorization and
 * package transport remain owned by Core.
 */

import type {DataRows, DataValue} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/data.js';
import {prepareCatalogSave, type CatalogSaveInput, type CatalogSaveOutcome} from './catalog-save.mts';

export type CatalogRequest =
  | {readonly kind: 'list'; readonly query: string | null}
  | {readonly kind: 'get'; readonly id: string};

export type CatalogQueryPlan =
  | {readonly kind: 'all'}
  | {readonly kind: 'search'; readonly ftsQuery: string; readonly year: number | null}
  | {readonly kind: 'get'; readonly id: string};

export interface CatalogSelectionRows {readonly primary: DataRows; readonly year: DataRows | null}

export interface CatalogRelatedRows {
  readonly creators: DataRows;
  readonly tags: DataRows;
  readonly attachments: DataRows;
  readonly projectIds: DataRows;
  readonly metadataSources: DataRows;
}

export interface CatalogItemRows {readonly main: DataRows; readonly related: CatalogRelatedRows | null}
export interface CatalogProjectionInput {readonly request: CatalogRequest; readonly items: readonly CatalogItemRows[]}

export interface CatalogCreator {readonly familyName: string; readonly givenName: string; readonly literalName: string; readonly role: string}
export interface CatalogAttachment {readonly id: string; readonly displayName: string; readonly mimeType: string; readonly byteSize: bigint; readonly contentSha256: string}
export interface CatalogMetadataSource {readonly fieldName: string; readonly sourceKind: string; readonly confirmedByUser: boolean}
export interface CatalogItem {
  readonly id: string; readonly itemType: string; readonly title: string; readonly abstractText: string;
  readonly issuedYear: number | null; readonly containerTitle: string; readonly conferenceName: string;
  readonly proceedingsTitle: string; readonly place: string; readonly volume: string; readonly issue: string;
  readonly pages: string; readonly doi: string; readonly url: string; readonly language: string;
  readonly bibtexKey: string; readonly rawBibtex: string | null; readonly readingStatus: string;
  readonly creators: readonly CatalogCreator[]; readonly tags: readonly string[];
  readonly attachments: readonly CatalogAttachment[]; readonly projectIds: readonly string[];
  readonly metadataSources: readonly CatalogMetadataSource[]; readonly trashedAt: string | null;
  readonly createdAt: string; readonly updatedAt: string;
}

export type CatalogProjectionOutcome =
  | {readonly kind: 'success'; readonly items: readonly CatalogItem[]}
  | {readonly kind: 'notFound'};

export class CatalogDecodeError extends Error {
  readonly codeValue = 'literature_catalog_input_invalid';
  readonly reason: string;
  constructor(reason: string) {
    super(`literature_catalog_input_invalid: ${reason}`);
    this.name = 'CatalogDecodeError';
    this.reason = reason;
  }
  code(): string {return this.codeValue;}
}

class Row {
  private readonly values: readonly DataValue[];
  private readonly group: string;
  private readonly index: number;
  constructor(values: readonly DataValue[], group: string, index: number, count: number) {
    this.values = values;
    this.group = group;
    this.index = index;
    if (values.length !== count) throw new CatalogDecodeError(`${group} row ${index} has ${values.length} columns; expected ${count}`);
  }
  private invalid(column: number, expected: string): CatalogDecodeError {return new CatalogDecodeError(`${this.group} row ${this.index} column ${column} requires ${expected}`);}
  text(column: number): string {
    const value = this.values[column];
    if (value?.kind !== 'text') throw this.invalid(column, 'String');
    return value.value;
  }
  optionalText(column: number): string | null {
    const value = this.values[column];
    if (value?.kind === 'null') return null;
    if (value?.kind !== 'text') throw this.invalid(column, 'Option<String>');
    return value.value;
  }
  integer(column: number): bigint {
    const value = this.values[column];
    if (value?.kind !== 'integer') throw this.invalid(column, 'Integer');
    return value.value;
  }
  year(column: number): number | null {
    const value = this.values[column];
    if (value?.kind === 'null') return null;
    const integer = this.integer(column);
    if (integer < -2147483648n || integer > 2147483647n) throw this.invalid(column, 'Option<i32>');
    return Number(integer);
  }
}

function strings(rows: DataRows, group: string): string[] {
  return rows.rows.map((values, index) => new Row(values, group, index, 1).text(0));
}

/** Preserve the original List/Get branch and FTS escaping rules. */
export function planCatalogQuery(request: CatalogRequest): CatalogQueryPlan {
  if (request.kind === 'get') return {kind: 'get', id: request.id};
  const query = request.query ?? '';
  if (query.trim() === '') return {kind: 'all'};
  const trimmed = query.trim();
  const numeric = /^[+-]?\d+$/u.test(trimmed) ? Number(trimmed) : Number.NaN;
  const year = Number.isSafeInteger(numeric) && numeric >= -2147483648 && numeric <= 2147483647 ? numeric : null;
  return {kind: 'search', ftsQuery: `{title creators} : "${trimmed.toLowerCase().replaceAll('"', '""')}"*`, year};
}

/** The primary FTS stream keeps duplicates; only year-stream additions deduplicate. */
export function selectCatalogIds(selection: CatalogSelectionRows): string[] {
  const ids = strings(selection.primary, 'primary');
  for (const id of selection.year === null ? [] : strings(selection.year, 'year')) if (!ids.includes(id)) ids.push(id);
  return ids;
}

function projectItem(captured: CatalogItemRows): CatalogItem | null {
  if (captured.main.rows.length === 0) return null;
  if (captured.main.rows.length !== 1) throw new CatalogDecodeError('main query_row result has multiple rows');
  const row = new Row(captured.main.rows[0]!, 'main', 0, 21);
  const related = captured.related;
  if (related === null) throw new CatalogDecodeError('existing main row has no related read bundle');
  const creators = related.creators.rows.map((values, index) => {
    const creator = new Row(values, 'creators', index, 4);
    return {familyName: creator.text(0), givenName: creator.text(1), literalName: creator.text(2), role: creator.text(3)};
  });
  const attachments = related.attachments.rows.map((values, index) => {
    const attachment = new Row(values, 'attachments', index, 5);
    const byteSize = attachment.integer(3);
    if (byteSize < 0n) throw new CatalogDecodeError(`attachments row ${index} column 3 requires u64`);
    return {id: attachment.text(0), displayName: attachment.text(1), mimeType: attachment.text(2), byteSize, contentSha256: attachment.text(4)};
  });
  const metadataSources = related.metadataSources.rows.map((values, index) => {
    const source = new Row(values, 'metadataSources', index, 3);
    return {fieldName: source.text(0), sourceKind: source.text(1), confirmedByUser: source.integer(2) !== 0n};
  });
  return {
    id: row.text(0), itemType: row.text(1), title: row.text(2), abstractText: row.text(3), issuedYear: row.year(4),
    containerTitle: row.text(5), conferenceName: row.text(6), proceedingsTitle: row.text(7), place: row.text(8),
    volume: row.text(9), issue: row.text(10), pages: row.text(11), doi: row.text(12), url: row.text(13),
    language: row.text(14), bibtexKey: row.text(15), rawBibtex: row.optionalText(16), readingStatus: row.text(17),
    creators, tags: strings(related.tags, 'tags'), attachments, projectIds: strings(related.projectIds, 'projectIds'),
    metadataSources, createdAt: row.text(18), updatedAt: row.text(19), trashedAt: row.optionalText(20),
  };
}

export function projectCatalog(input: CatalogProjectionInput): CatalogProjectionOutcome {
  if (input.request.kind === 'get' && input.items.length !== 1) throw new CatalogDecodeError('Get requires one captured item result');
  const items: CatalogItem[] = [];
  for (const captured of input.items) {
    const item = projectItem(captured);
    if (item === null) return {kind: 'notFound'};
    if (input.request.kind === 'get' && item.id !== input.request.id) throw new CatalogDecodeError('Get result has another item identity');
    items.push(item);
  }
  return {kind: 'success', items};
}

export interface CitationSearchHit {
  readonly literatureItemId: string; readonly title: string; readonly issuedYear: number | null;
  readonly containerTitle: string; readonly importedKey: string; readonly firstAuthor: string;
  readonly hasPdf: boolean; readonly hasEvidence: boolean; readonly citationKey: string | null;
}
export type BibliographySearchInput = {readonly phase: 'prepare'; readonly query: string} | {readonly phase: 'project'; readonly rows: DataRows};
export type BibliographySearchDecision = {readonly kind: 'needle'; readonly needle: string} | {readonly kind: 'hits'; readonly hits: readonly CitationSearchHit[]};

export function searchBibliography(input: BibliographySearchInput): BibliographySearchDecision {
  if (input.phase === 'prepare') return {kind: 'needle', needle: `%${input.query.trim().toLowerCase()}%`};
  return {kind: 'hits', hits: input.rows.rows.map((values, index) => {
    const row = new Row(values, 'citation search', index, 9);
    return {literatureItemId: row.text(0), title: row.text(1), issuedYear: row.year(2), containerTitle: row.text(3), importedKey: row.text(4), firstAuthor: row.text(5), hasPdf: row.integer(6) !== 0n, hasEvidence: row.integer(7) !== 0n, citationKey: row.optionalText(8)};
  })};
}

export interface BibliographyCandidatesInput {readonly doi: string; readonly title: string; readonly primary: readonly string[] | null; readonly fallback: readonly string[] | null}
export type BibliographyCandidatesPlan =
  | {readonly kind: 'query'; readonly query: 'doi' | 'title' | 'titleFallback'; readonly parameter: string}
  | {readonly kind: 'ready'; readonly ids: readonly string[]; readonly exactDoi: boolean};

export function planBibliographyCandidates(input: BibliographyCandidatesInput): BibliographyCandidatesPlan {
  if (input.primary === null) return input.doi.length === 0 ? {kind: 'query', query: 'title', parameter: input.title} : {kind: 'query', query: 'doi', parameter: input.doi};
  const exactDoi = input.doi.length !== 0 && input.primary.length !== 0;
  if (input.primary.length === 0 && input.doi.length !== 0) return input.fallback === null
    ? {kind: 'query', query: 'titleFallback', parameter: input.title} : {kind: 'ready', ids: input.fallback, exactDoi};
  return {kind: 'ready', ids: input.primary, exactDoi};
}

export {prepareCatalogSave};
export type {CatalogSaveInput, CatalogSaveOutcome};
export type {DataRows, DataValue};
