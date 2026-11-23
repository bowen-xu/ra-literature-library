import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hash} from './retrieval-trace.mts';
import {decidePaperRetrieval} from './paper-retrieval.mts';

const input = () => ({paperId: ' raw-paper ', query: ' question Ω ', row: {paperId: ' raw-paper ', querySha256: hash('question Ω'), status: 'previewed', contextText: '[CN-S1] 原文\n', contextSha256: hash('[CN-S1] 原文\n'), expired: false}});

test('paper retrieval preserves input and uses the original ready decision', () => {
  const value = input(), result = decidePaperRetrieval(value);
  assert.deepEqual(result.input, value);
  assert.deepEqual(result.decision, {status: 'ready', markSent: {expectedRows: 1, onMismatch: 'already_consumed'}});
});

test('paper retrieval preserves query mismatch before later rejection causes', () => {
  const value = input() as any; value.row!.paperId = null; value.row!.status = 'sent'; value.row!.expired = true; value.row!.contextSha256 = 'broken';
  assert.deepEqual(decidePaperRetrieval(value).decision, {status: 'rejected', reason: 'query_mismatch'});
  const expired = input(); expired.row!.expired = true; expired.row!.contextSha256 = 'broken';
  assert.deepEqual(decidePaperRetrieval(expired).decision, {status: 'rejected', reason: 'expired'});
});
