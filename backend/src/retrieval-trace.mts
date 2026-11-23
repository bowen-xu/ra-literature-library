import {createHash} from 'node:crypto';

export type TraceRejection = 'not_found' | 'query_mismatch' | 'already_consumed' | 'expired' | 'context_hash_mismatch';
export interface RetrievalTraceRow {
  paperId: string | null;
  querySha256: string;
  status: string;
  contextText: string;
  contextSha256: string;
  expired: boolean;
}
export const ORIGINAL_MARK_SENT = {expectedRows: 1, onMismatch: 'already_consumed' as const};

export class RetrievalTraceError extends Error {
  readonly rejection: TraceRejection;
  constructor(rejection: TraceRejection, message: string) { super(message); this.rejection = rejection; this.name = 'RetrievalTraceError'; }
}

export function hash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

/** Preserve the original rejection order and exact byte/hash semantics. */
export function validateContext(scopeId: string | null, query: string, stored: RetrievalTraceRow | null): RetrievalTraceRow {
  if (stored === null) throw new RetrievalTraceError('not_found', '找不到概念网络检索预览');
  if (stored.paperId !== scopeId || stored.querySha256 !== hash(query.trim())) {
    throw new RetrievalTraceError('query_mismatch', '概念网络检索预览与当前问题不匹配');
  }
  if (stored.status !== 'previewed') throw new RetrievalTraceError('already_consumed', '概念网络检索预览已经被使用');
  if (stored.expired) throw new RetrievalTraceError('expired', '概念网络检索预览已过期，请重新预览');
  if (hash(stored.contextText) !== stored.contextSha256) throw new RetrievalTraceError('context_hash_mismatch', '概念网络检索上下文校验失败');
  return stored;
}

export function validateMarkSent(changedRows: number): void {
  if (changedRows !== ORIGINAL_MARK_SENT.expectedRows) throw new RetrievalTraceError('already_consumed', '概念网络检索预览已经被使用');
}
