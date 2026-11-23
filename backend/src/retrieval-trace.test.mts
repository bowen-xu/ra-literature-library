import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RetrievalTraceError, hash, validateContext, validateMarkSent} from './retrieval-trace.mts';

const query = '  原始问题  ', contextText = ' 	[CN-S1] 原文\n';
const row = (overrides: Partial<{paperId: string | null; querySha256: string; status: string; contextText: string; contextSha256: string; expired: boolean}> = {}) => ({
  paperId: null, querySha256: hash(query.trim()), status: 'previewed', contextText, contextSha256: hash(contextText), expired: false, ...overrides,
});

test('retrieval trace validation preserves original success and rejection order', () => {
  assert.equal(validateContext(null, query, row()).contextText, contextText);
  for (const [stored, rejection] of [[null, 'not_found'], [row({querySha256: hash('changed')}), 'query_mismatch'],
    [row({status: 'sent'}), 'already_consumed'], [row({expired: true}), 'expired'], [row({contextSha256: hash('tampered')}), 'context_hash_mismatch']] as const) {
    assert.throws(() => validateContext(null, query, stored), (error: unknown) => error instanceof RetrievalTraceError && error.rejection === rejection);
  }
});

test('retrieval trace keeps exact scope bytes and mark-sent row count', () => {
  assert.throws(() => validateContext('paper', query, row()), /预览/u);
  validateMarkSent(1);
  assert.throws(() => validateMarkSent(0), /已经被使用/u);
  assert.throws(() => validateMarkSent(2), /已经被使用/u);
});
