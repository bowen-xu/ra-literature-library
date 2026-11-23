/** Browser connector preparation migrated from the native literature plugin. */

import {createHash} from 'node:crypto';
import {prepareCatalogSave, type CatalogDraft, type CatalogSaveOutcome, type PreparedDoi} from './catalog-save.mts';

export const MAX_METADATA_BYTES = 1024 * 1024;
export const MAX_PDF_BYTES = 64 * 1024 * 1024;
export type JsonValue = unknown;
export interface PdfObservation {readonly byteSize: number | bigint; readonly startsWithPdf: boolean; readonly sha256: string}
export type BrowserCaptureInput =
  | {readonly kind: 'items'; readonly scope: string; readonly payload: JsonValue; readonly doi: readonly PreparedDoi[]}
  | {readonly kind: 'snapshot'; readonly scope: string; readonly payload: JsonValue}
  | {readonly kind: 'attachment'; readonly scope: string; readonly sessionId: string; readonly metadata: JsonValue; readonly pdf: PdfObservation}
  | {readonly kind: 'standalone'; readonly scope: string; readonly sessionId: string; readonly metadata: JsonValue; readonly pdf: PdfObservation}
  | {readonly kind: 'sessionStatus'; readonly scope: string; readonly sessionId: string}
  | {readonly kind: 'updateSession'; readonly scope: string; readonly payload: JsonValue}
  | {readonly kind: 'recognizedItem'; readonly scope: string; readonly payload: JsonValue}
  | {readonly kind: 'selectedLibrary'} | {readonly kind: 'clientHostnames'} | {readonly kind: 'delaySync'}
  | {readonly kind: 'attachmentResolvers'} | {readonly kind: 'unsupported'};
export type CaptureRejection = 'invalidInput' | 'unsupported';
export interface CaptureIdentifier {readonly kind: string; readonly normalized: string; readonly display: string}
export interface CaptureReceipt {readonly id: JsonValue; readonly itemType: string; readonly title: string; readonly warnings: readonly JsonValue[]}
export interface PreparedCaptureItem {readonly externalId: string; readonly raw: JsonValue; readonly save: CatalogSaveOutcome; readonly identifiers: readonly (CaptureIdentifier | CaptureRejection)[]; readonly sourceReference: JsonValue; readonly receipt: CaptureReceipt}
export interface PreparedCapture {readonly sessionId: string; readonly operation: string; readonly payloadJson: string; readonly requestSha256: string; readonly items: readonly PreparedCaptureItem[]}
export interface PreparedCaptureAttachment {readonly originalId: JsonValue; readonly sessionId: string; readonly externalId: string; readonly parentExternalId: string; readonly metadataJson: string; readonly requestSha256: string; readonly displayName: string; readonly sourceUrl: string}
export interface PreparedStandaloneCapture {readonly attachment: PreparedCaptureAttachment; readonly save: CatalogSaveOutcome; readonly raw: JsonValue; readonly sourceReference: JsonValue}
export type SessionProjection = 'full' | 'sessionId' | 'null';
export type BrowserCapturePreparation =
  | {readonly kind: 'capture'; readonly plan: PreparedCapture}
  | {readonly kind: 'attachment'; readonly plan: PreparedCaptureAttachment}
  | {readonly kind: 'standalone'; readonly plan: PreparedStandaloneCapture}
  | {readonly kind: 'session'; readonly sessionId: string; readonly projection: SessionProjection}
  | {readonly kind: 'value'; readonly value: JsonValue}
  | {readonly kind: 'rejected'; readonly reason: CaptureRejection};

const invalid = (): never => {throw new Error('INVALID_BROWSER_CAPTURE');};
const object = (value: JsonValue): Record<string, any> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
const text = (value: JsonValue, field: string): string => {const row = object(value); const current = row?.[field]; return current === undefined || current === null ? '' : typeof current === 'string' ? current : invalid();};
const bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
const serialize = (value: JsonValue): string => {const result = JSON.stringify(value, (_key, current: unknown) => typeof current === 'bigint' ? Number(current) : current); return result ?? invalid();};

export function digest(value: string | Uint8Array): string {return createHash('sha256').update(value).digest('hex');}
export function validateScope(scope: string): void {if (scope.length === 0 || bytes(scope) > 128 || /[^\x00-\x7f]/u.test(scope)) invalid();}
export function identifier(value: JsonValue): string {
  const result = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : invalid();
  if (result.length === 0 || bytes(result) > 200 || [...result].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) invalid();
  return result;
}
function credentialKey(key: string): string {return key.toLowerCase().replaceAll('_', '').replaceAll('-', '');}
function hasCredentials(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(hasCredentials);
  const row = object(value); if (row === null) return false;
  return Object.entries(row).some(([key, child]) => ['cookie', 'cookies', 'cookiestring', 'cookiesandbox', 'cookiejar', 'headers', 'requestheaders', 'responseheaders', 'httpheaders', 'authorization', 'proxyauthorization', 'accesstoken', 'refreshtoken', 'password'].includes(credentialKey(key)) || hasCredentials(child));
}
export function validateMetadata(value: JsonValue): string {if (object(value) === null || hasCredentials(value)) invalid(); const serialized = serialize(value); if (bytes(serialized) > MAX_METADATA_BYTES) invalid(); return serialized;}

export function decodedTitle(metadata: JsonValue): string {
  const title = text(metadata, 'title'); const lower = title.toLowerCase(); let result = title;
  if (lower.startsWith('=?utf-8?q?') && title.endsWith('?=')) {
    const encoded = title.slice(10, -2), bytes_: number[] = [];
    for (let index = 0; index < encoded.length;) {const char = encoded[index]!; if (char === '=') {const hex = encoded.slice(index + 1, index + 3); if (!/^[0-9a-f]{2}$/iu.test(hex)) invalid(); bytes_.push(Number.parseInt(hex, 16)); index += 3;} else {bytes_.push(char === '_' ? 32 : encoded.charCodeAt(index)); index++;}}
    result = new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes_));
  } else if (lower.startsWith('=?utf-8?b?') && title.endsWith('?=')) {
    try {result = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.from(title.slice(10, -2), 'base64'));} catch {invalid();}
  }
  if ([...result].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) invalid();
  return result.trim().length === 0 ? 'document.pdf' : result;
}

function creator(value: JsonValue): {familyName: string; givenName: string; literalName: string; role: string} {
  const row = object(value); if (row === null) invalid(); const safe = row!;
  const name = text(safe, 'name'), lastName = text(safe, 'lastName'), role = text(safe, 'creatorType');
  const literal = safe.fieldMode === 1 || name.length > 0;
  return {familyName: literal ? '' : lastName, givenName: literal ? '' : text(safe, 'firstName'), literalName: name.length > 0 ? name : literal ? lastName : '', role: role.length === 0 ? 'author' : role};
}
function itemType(value: string): string {return value === '' || !['journalArticle', 'magazineArticle', 'newspaperArticle', 'conferencePaper', 'book', 'bookSection', 'preprint', 'manuscript', 'thesis', 'report', 'dataset', 'computerProgram', 'webpage', 'standard', 'patent', 'document'].includes(value) ? 'document' : value;}
function draftFromCapture(item: JsonValue): CatalogDraft {
  const row = object(item); if (row === null) invalid(); const safe = row!;
  const originalType = text(safe, 'itemType'), title = text(safe, 'title'); if (originalType.length === 0 || title.trim().length === 0) invalid();
  const storedType = itemType(originalType), creatorsValue = safe.creators, tagsValue = safe.tags;
  const creators = creatorsValue === undefined || creatorsValue === null ? [] : Array.isArray(creatorsValue) ? creatorsValue.map(creator) : invalid();
  const rawTags = tagsValue === undefined || tagsValue === null ? [] : Array.isArray(tagsValue) ? tagsValue.map(tag => typeof tag === 'string' ? tag : text(tag, 'tag')) : invalid();
  const tags: string[] = [], seen = new Set<string>(); for (const tag of rawTags) {const key = tag.trim().toLowerCase(); if (!seen.has(key)) {seen.add(key); tags.push(tag);}}
  const date = text(safe, 'date'); const year = date.split(/[^0-9]/u).find(part => part.length === 4); const issuedYear = year === undefined ? null : Number(year) > 0 ? Number(year) : null;
  const publicationTitle = text(safe, 'publicationTitle'), bookTitle = text(safe, 'bookTitle');
  return {id: null, itemType: storedType, title, abstractText: text(safe, 'abstractNote'), issuedYear, containerTitle: publicationTitle.length === 0 ? bookTitle : publicationTitle,
    conferenceName: text(safe, 'conferenceName'), proceedingsTitle: storedType === 'conferencePaper' ? publicationTitle : text(safe, 'proceedingsTitle'), place: text(safe, 'place'), volume: text(safe, 'volume'), issue: text(safe, 'issue'), pages: text(safe, 'pages'), doi: text(safe, 'DOI'), url: text(safe, 'url'), language: text(safe, 'language'), bibtexKey: text(safe, 'citationKey'), rawBibtex: null, creators, tags, sourceKind: 'browser_connector'};
}
function identifiers(raw: JsonValue): readonly (CaptureIdentifier | CaptureRejection)[] {
  const result: (CaptureIdentifier | CaptureRejection)[] = [];
  for (const [field, kind] of [['ISBN', 'isbn'], ['ISSN', 'issn'], ['PMID', 'pmid'], ['arXiv', 'arxiv']] as const) {
    try {const value = text(raw, field); if (value.trim().length === 0) continue; result.push({kind, normalized: value.replace(/[\s-]/gu, '').toLowerCase(), display: value});}
    catch {result.push('invalidInput');}
  }
  return result;
}

function capture(scope: string, payload: JsonValue, operation: string, items: readonly JsonValue[], doi: readonly PreparedDoi[]): PreparedCapture {
  validateScope(scope); const payloadJson = validateMetadata(payload), sessionId = identifier(object(payload)?.sessionID);
  let uri = text(payload, 'uri'); if (uri.length === 0) uri = text(payload, 'url'); const translatorId = text(payload, 'translatorID'), translatorVersion = text(payload, 'translatorVersion');
  if (bytes(uri) > 8192 || bytes(translatorId) > 256 || bytes(translatorVersion) > 256 || items.length === 0 || items.length > 128 || doi.length !== items.length) invalid();
  const externalIds = new Set<string>(), prepared: PreparedCaptureItem[] = [];
  items.forEach((raw, index) => {const externalId = identifier(object(raw)?.id); if (externalIds.has(externalId)) invalid(); externalIds.add(externalId); const draft = draftFromCapture(raw), save = prepareCatalogSave({draft, doi: doi[index]!}), storedType = draft.itemType, originalType = text(raw, 'itemType'); prepared.push({externalId, raw, save, identifiers: identifiers(raw), sourceReference: {captureSessionID: sessionId, externalItemID: externalId, uri, translatorID: translatorId, translatorVersion}, receipt: {id: object(raw)?.id, itemType: storedType, title: draft.title.trim(), warnings: originalType === storedType ? [] : [{code: 'unsupported_item_type', originalItemType: originalType, storedItemType: storedType}]}});});
  return {sessionId, operation, payloadJson, requestSha256: digest(`${operation}:${payloadJson}`), items: prepared};
}
function validatePdf(scope: string, sessionId: string, metadata: JsonValue, pdf: PdfObservation): string {validateScope(scope); identifier(sessionId); const metadataJson = validateMetadata(metadata); if (BigInt(pdf.byteSize) > BigInt(MAX_PDF_BYTES) || !pdf.startsWithPdf || text(metadata, 'contentType').split(';')[0]?.trim() !== 'application/pdf') invalid(); decodedTitle(metadata); if (bytes(text(metadata, 'url')) > 8192) invalid(); return metadataJson;}
function attachment(scope: string, sessionId: string, metadata: JsonValue, pdf: PdfObservation): PreparedCaptureAttachment {const metadataJson = validatePdf(scope, sessionId, metadata, pdf); return {originalId: object(metadata)?.id, sessionId, externalId: identifier(object(metadata)?.id), parentExternalId: identifier(object(metadata)?.parentItemID), requestSha256: digest(`${metadataJson}:${pdf.sha256}`), metadataJson, displayName: decodedTitle(metadata), sourceUrl: text(metadata, 'url')};}
function standalone(scope: string, sessionId: string, metadata: JsonValue, pdf: PdfObservation): PreparedStandaloneCapture {const metadataJson = validatePdf(scope, sessionId, metadata, pdf), requestSha256 = digest(`standalone:${digest(`${metadataJson}:${pdf.sha256}`)}`), title = decodedTitle(metadata), raw = {id: 'standalone', itemType: 'document', title, url: object(metadata)?.url, metadataPending: true}, save = prepareCatalogSave({draft: draftFromCapture(raw), doi: {display: '', normalized: ''}}); return {attachment: {originalId: object(metadata)?.id, sessionId, externalId: 'standalone', parentExternalId: '', metadataJson, requestSha256, displayName: title, sourceUrl: text(metadata, 'url')}, save, raw, sourceReference: {captureSessionID: sessionId, uri: object(metadata)?.url, source: 'standalone_pdf'}};}

export function library(): JsonValue {return {id: 'L1', name: 'Research Assistant 文献库', libraryID: 1, libraryEditable: true, filesEditable: true, targets: [{id: 'L1', name: 'Research Assistant 文献库', level: 0, libraryID: 1, libraryEditable: true, filesEditable: true}], tags: {}};}
export function prepareBrowserCapture(input: BrowserCaptureInput): BrowserCapturePreparation {
  try {switch (input.kind) {
    case 'items': {const row = object(input.payload), items = row?.items; if (!Array.isArray(items)) invalid(); return {kind: 'capture', plan: capture(input.scope, input.payload, 'items', items, input.doi)};}
    case 'snapshot': {if (object(input.payload)?.pdf === true) return {kind: 'rejected', reason: 'unsupported'}; const row = object(input.payload); const item = {id: 'webpage', itemType: 'webpage', title: row?.title, url: row?.url, creators: [], tags: []}; return {kind: 'capture', plan: capture(input.scope, input.payload, 'webpage', [item], [{display: '', normalized: ''}])};}
    case 'attachment': return {kind: 'attachment', plan: attachment(input.scope, input.sessionId, input.metadata, input.pdf)};
    case 'standalone': return {kind: 'standalone', plan: standalone(input.scope, input.sessionId, input.metadata, input.pdf)};
    case 'sessionStatus': validateScope(input.scope); return {kind: 'session', sessionId: identifier(input.sessionId), projection: 'full'};
    case 'updateSession': {validateMetadata(input.payload); const row = object(input.payload), sessionId = identifier(row?.sessionID); if ((row?.target !== undefined && row.target !== null && row.target !== '' && row.target !== 'L1') || (row?.tags !== undefined && row.tags !== '' && row.tags !== null && JSON.stringify(row.tags) !== '[]') || (row?.note !== undefined && row.note !== '' && row.note !== null) || Object.keys(row ?? {}).some(key => !['sessionID', 'target', 'tags', 'note'].includes(key))) return {kind: 'rejected', reason: 'unsupported'}; validateScope(input.scope); return {kind: 'session', sessionId, projection: 'sessionId'};}
    case 'recognizedItem': validateMetadata(input.payload); validateScope(input.scope); return {kind: 'session', sessionId: identifier(object(input.payload)?.sessionID), projection: 'null'};
    case 'selectedLibrary': return {kind: 'value', value: library()};
    case 'clientHostnames': return {kind: 'value', value: []};
    case 'delaySync': return {kind: 'value', value: {sync: false}};
    case 'attachmentResolvers': return {kind: 'value', value: false};
    case 'unsupported': return {kind: 'rejected', reason: 'unsupported'};
  }} catch {return {kind: 'rejected', reason: 'invalidInput'};}
}

export const BROWSER_CAPTURE_RESOURCE_FILES = [
  'browser-capture-session-receipt.v1.sql', 'browser-capture-session-insert.v1.sql', 'browser-capture-session-finish.v1.sql',
  'browser-capture-status-receipt.v1.sql', 'browser-capture-status-attachments.v1.sql', 'browser-capture-item-insert.v1.sql',
  'browser-capture-provenance-source.v1.sql', 'browser-capture-identifier-insert.v1.sql', 'browser-capture-active-parent.v1.sql',
  'browser-capture-attachment-receipt.v1.sql', 'browser-capture-attachment-label.v1.sql', 'browser-capture-attachment-insert.v1.sql',
] as const;
