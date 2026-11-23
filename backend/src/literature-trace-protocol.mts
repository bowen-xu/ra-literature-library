/** TypeScript port of the archived literature-trace finite wire contract.
 * The host owns framing and identity only; snapshots remain caller-owned input. */
import {requireCatalogOperation} from './catalog-protocol.mts';
export const PROTOCOL_VERSION = 2;
export const PLUGIN_ID = 'literature_library';
export const CAPABILITY_ID = 'literature.note-trace-decision';
export const CAPABILITY_VERSION = 1;
export const MAX_FRAME_BYTES = 64 * 1024 * 1024;

export interface SnapshotRef {
  relativeHandle: string;
  byteSize: number;
  sha256: string;
  packageKey: string;
  instanceId: string;
  requestId: string;
}

export interface Request {
  protocolVersion: number;
  pluginId: string;
  packageKey: string;
  instanceId: string;
  requestId: string;
  body: RequestBody;
}

export type RequestBody =
  | {kind: 'initialize'}
  | {kind: 'decideNoteTrace'; snapshot: SnapshotRef}
  | {kind: 'catalog'; operation: string; snapshot: SnapshotRef}
  | {kind: 'shutdown'};

export interface MarkSentCondition {
  expectedRows: number;
  onMismatch: 'already_consumed';
}

export type TraceDecision =
  | {status: 'ready'; markSent: MarkSentCondition}
  | {status: 'rejected'; reason: 'not_found' | 'query_mismatch' | 'already_consumed' | 'expired' | 'context_hash_mismatch'};

export type ResponseBody =
  | {kind: 'initialized'; capability: string; version: number}
  | {kind: 'noteTraceDecision'; decision: TraceDecision}
  | {kind: 'catalogResult'; payload: SnapshotRef}
  | {kind: 'shutdownComplete'};

export interface Response extends Omit<Request, 'body'> {body: ResponseBody}

export function snapshotHandle(requestId: string): string { return `note-trace-${requestId}.json`; }
export function catalogInputHandle(requestId: string): string { return `catalog-input-${requestId}.json`; }
export function catalogResultHandle(requestId: string): string { return `catalog-result-${requestId}.json`; }

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid literature wire object');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('invalid literature wire text'); return value; }
function exact(row: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys); for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error('invalid literature wire field');
}
function digest(value: string): boolean { return /^[0-9a-f]{64}$/u.test(value); }
function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}
function snapshot(value: unknown, handle: string, request: Request): SnapshotRef {
  const row = object(value); exact(row, ['relativeHandle', 'byteSize', 'sha256', 'packageKey', 'instanceId', 'requestId']); const result = {
    relativeHandle: text(row.relativeHandle), byteSize: row.byteSize, sha256: text(row.sha256),
    packageKey: text(row.packageKey), instanceId: text(row.instanceId), requestId: text(row.requestId),
  } as SnapshotRef;
  if (!Number.isSafeInteger(result.byteSize) || result.byteSize <= 0 || !digest(result.sha256)
    || result.relativeHandle !== handle || result.packageKey !== request.packageKey
    || result.instanceId !== request.instanceId || result.requestId !== request.requestId) throw new Error('invalid literature snapshot');
  return result;
}
function envelope(value: Record<string, unknown>): Omit<Request, 'body'> {
  const result = {protocolVersion: value.protocolVersion, pluginId: text(value.pluginId), packageKey: text(value.packageKey),
    instanceId: text(value.instanceId), requestId: text(value.requestId)} as Omit<Request, 'body'>;
  if (result.protocolVersion !== PROTOCOL_VERSION || result.pluginId !== PLUGIN_ID || !digest(result.packageKey)
    || !uuid(result.instanceId) || !uuid(result.requestId)) throw new Error('invalid literature envelope');
  return result;
}

export function decodeRequest(bytes: Uint8Array): Request {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FRAME_BYTES) throw new Error('literature frame budget exceeded');
  const row = object(JSON.parse(new TextDecoder().decode(bytes))); exact(row, ['protocolVersion', 'pluginId', 'packageKey', 'instanceId', 'requestId', 'body']); const base = envelope(row), body = object(row.body);
  const kind = text(body.kind);
  exact(body, kind === 'initialize' || kind === 'shutdown' ? ['kind'] : kind === 'decideNoteTrace' ? ['kind', 'snapshot'] : kind === 'catalog' ? ['kind', 'operation', 'snapshot'] : ['kind']);
  const request: Request = {...base, body: kind === 'initialize' ? {kind}
    : kind === 'shutdown' ? {kind}
    : kind === 'decideNoteTrace' ? {kind, snapshot: snapshot(body.snapshot, snapshotHandle(base.requestId), {...base, body: undefined} as unknown as Request)}
    : kind === 'catalog' ? {kind, operation: requireCatalogOperation(body.operation), snapshot: snapshot(body.snapshot, catalogInputHandle(base.requestId), {...base, body: undefined} as unknown as Request)}
    : (() => { throw new Error('invalid literature request body'); })()};
  return request;
}

export function encodeResponse(response: Response): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(response));
  if (bytes.byteLength > MAX_FRAME_BYTES) throw new Error('literature frame budget exceeded');
  return bytes;
}

export class FrameDecoder {
  #pending = new Uint8Array(0);
  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.#pending.length + chunk.length); merged.set(this.#pending); merged.set(chunk, this.#pending.length); this.#pending = merged;
    const frames: Uint8Array[] = []; let start = 0;
    for (let index = 0; index < merged.length; index++) if (merged[index] === 10) {
      const end = merged[index - 1] === 13 ? index - 1 : index; const frame = merged.slice(start, end);
      if (frame.length === 0 || frame.length > MAX_FRAME_BYTES) throw new Error('literature frame budget exceeded');
      frames.push(frame); start = index + 1;
    }
    this.#pending = merged.slice(start); if (this.#pending.length > MAX_FRAME_BYTES) throw new Error('literature frame budget exceeded');
    return frames;
  }
  get empty(): boolean { return this.#pending.length === 0; }
}
