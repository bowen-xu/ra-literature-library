/** Ordered paper-context preview validation migrated from the native plugin. */

import {createHash} from 'node:crypto';

export const PAPER_CONTEXT_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 20_000;
export type PaperContextError = 'invalidInput' | 'unavailable' | 'conflict' | 'corrupt' | 'budget';
export interface PaperContextRequest {readonly paperId: string; readonly snapshotId: string; readonly expectedContextHash: string}
export interface Rect {x: number; y: number; width: number; height: number}
export interface Region {readonly pageIndex: number; readonly rect: Rect}
export interface ContextAttachment {readonly attachmentId: string; readonly contentSha256: string; readonly parseRunId: string; readonly ordinal: number | bigint}
export interface ContextItem {readonly id: string; readonly attachmentId: string; readonly contentSha256: string; readonly parseRunId: string; readonly rawRef: string; readonly kind: string; readonly label: string | null; readonly pageIndex: number | null; readonly regions: readonly Region[]; readonly charspan: readonly [number, number] | null; readonly sourceTextHash: string | null; readonly text: string | null; readonly tableJson?: unknown; readonly imageContentSha256?: string | null}
export interface SnapshotDigestInput {readonly contextSchemaVersion: number | bigint; readonly paperId: string; readonly attachments: readonly ContextAttachment[]; readonly items: readonly ContextItem[]}
export interface PaperContextPreview {readonly schemaVersion: number; readonly paperId: string; readonly snapshotId: string; readonly contextHash: string; readonly attachments: readonly ContextAttachment[]; readonly items: readonly {readonly sourceId: string; readonly item: ContextItem}[]}
export type PaperContextPreviewInput =
  | {readonly kind: 'header'; readonly request: PaperContextRequest; readonly header: readonly [string, string, number | bigint] | null}
  | {readonly kind: 'preflight'; readonly itemCount: number | bigint; readonly itemBytes: number | bigint; readonly invalidPageCount: number | bigint; readonly attachmentCount: number | bigint; readonly attachmentBytes: number | bigint}
  | {readonly kind: 'snapshot'; readonly request: PaperContextRequest; readonly snapshot: SnapshotDigestInput};
export type PaperContextPreviewDecision = {readonly kind: 'validated'} | {readonly kind: 'previewed'; readonly preview: PaperContextPreview} | {readonly kind: 'rejected'; readonly error: PaperContextError};

const utf8 = (value: string): number => new TextEncoder().encode(value).byteLength;
const json = (value: unknown): string => JSON.stringify(value, (_key, current: unknown) => typeof current === 'bigint' ? Number(current) : current);
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
export function isSha256Hash(value: string): boolean {return value.length === 64 && /^[0-9a-f]{64}$/u.test(value);}
export function identity(value: string): boolean {return value.trim().length > 0 && utf8(value) <= 1024 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);}
export function snapshotIdMatchesHash(snapshotId: string, contextHash: string): boolean {const canonical = `paper-context-${contextHash}`; if (snapshotId === canonical) return true; const prefix = `${canonical}-migrated-`; return snapshotId.startsWith(prefix) && /^[0-9a-fA-F]{16}$/u.test(snapshotId.slice(prefix.length));}
export function validatePaperContextRequest(request: PaperContextRequest): void {if (!identity(request.paperId) || !isSha256Hash(request.expectedContextHash) || !snapshotIdMatchesHash(request.snapshotId, request.expectedContextHash)) throw new Error('invalid paper context request');}

export function validateHeader(request: PaperContextRequest, header: readonly [string, string, number | bigint] | null): PaperContextError | null {
  try {validatePaperContextRequest(request);} catch {return 'invalidInput';}
  if (header === null) return 'unavailable';
  if (header[0] !== request.paperId || header[1] !== request.expectedContextHash) return 'conflict';
  return Number(header[2]) === 1 ? null : 'corrupt';
}
export function validatePreflight(itemCount: number | bigint, itemBytes: number | bigint, invalidPageCount: number | bigint, attachmentCount: number | bigint, attachmentBytes: number | bigint): PaperContextError | null {
  if (Number(attachmentCount) > 64 || Number(itemCount) > MAX_ITEMS || Number(itemBytes) + Number(attachmentBytes) > PAPER_CONTEXT_PREVIEW_MAX_BYTES) return 'budget';
  return Number(invalidPageCount) !== 0 || Number(attachmentCount) === 0 ? 'corrupt' : null;
}

function rectValid(rect: Rect): boolean {return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001;}
function canonicalItems(items: readonly ContextItem[]): readonly ContextItem[] {return items.map(item => ({...item, regions: item.regions.map(region => ({...region, rect: Object.fromEntries(Object.entries(region.rect).map(([key, value]) => [key, Math.round(value * 1_000_000_000_000) / 1_000_000_000_000])) as unknown as Rect}))}));}
export function canonicalSnapshotJson(input: SnapshotDigestInput): string {return json({contextSchemaVersion: input.contextSchemaVersion, paperId: input.paperId, attachments: input.attachments, items: canonicalItems(input.items)});}
export function digestSnapshot(input: SnapshotDigestInput): string {return sha(canonicalSnapshotJson(input));}

export function preview(request: PaperContextRequest, snapshot: SnapshotDigestInput): PaperContextPreview | PaperContextError {
  try {if (digestSnapshot(snapshot) !== request.expectedContextHash) return 'corrupt';} catch {return 'corrupt';}
  const attachments = new Map<string, ContextAttachment>();
  for (const [ordinal, attachment] of snapshot.attachments.entries()) {
    if (Number(attachment.ordinal) !== ordinal || !identity(attachment.attachmentId) || !identity(attachment.parseRunId) || !isSha256Hash(attachment.contentSha256) || attachments.has(attachment.attachmentId)) return 'corrupt';
    attachments.set(attachment.attachmentId, attachment);
  }
  const sourceIds = new Set<string>(), items: {sourceId: string; item: ContextItem}[] = [];
  for (const item of snapshot.items) {
    const attachment = attachments.get(item.attachmentId);
    if (attachment === undefined || item.contentSha256 !== attachment.contentSha256 || item.parseRunId !== attachment.parseRunId || !identity(item.id) || utf8(item.id) > 80 || item.regions.length > MAX_ITEMS || !['text', 'table', 'picture', 'group', 'key_value', 'form', 'field', 'field_region'].includes(item.kind) || !identity(item.rawRef) || item.charspan !== null && item.charspan[0] > item.charspan[1] || item.imageContentSha256 !== undefined && item.imageContentSha256 !== null && !isSha256Hash(item.imageContentSha256) || item.sourceTextHash !== null && !isSha256Hash(item.sourceTextHash)) return 'corrupt';
    if (item.regions.some(region => !rectValid(region.rect))) return 'corrupt';
    const sourceId = `paper-source:${sha(json([request.paperId, item.attachmentId, item.contentSha256, item.parseRunId, item.kind, item.rawRef]))}`;
    if (sourceIds.has(sourceId)) return 'corrupt'; sourceIds.add(sourceId); items.push({sourceId, item});
  }
  const result: PaperContextPreview = {schemaVersion: 1, paperId: request.paperId, snapshotId: request.snapshotId, contextHash: request.expectedContextHash, attachments: snapshot.attachments, items};
  return utf8(json(result)) > PAPER_CONTEXT_PREVIEW_MAX_BYTES ? 'budget' : result;
}

export function evaluate(input: PaperContextPreviewInput): PaperContextPreviewDecision {
  if (input.kind === 'header') {const error = validateHeader(input.request, input.header); return error === null ? {kind: 'validated'} : {kind: 'rejected', error};}
  if (input.kind === 'preflight') {const error = validatePreflight(input.itemCount, input.itemBytes, input.invalidPageCount, input.attachmentCount, input.attachmentBytes); return error === null ? {kind: 'validated'} : {kind: 'rejected', error};}
  const result = preview(input.request, input.snapshot); return typeof result === 'string' ? {kind: 'rejected', error: result} : {kind: 'previewed', preview: result};
}
