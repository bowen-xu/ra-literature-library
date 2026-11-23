import assert from 'node:assert/strict';
import test from 'node:test';
import {decideSemanticIndex, retainedEmbeddingJob} from './semantic-index.mts';

test('semantic-index status and retry decisions preserve reconciliation and job reuse rules', () => {
  assert.equal(decideSemanticIndex({stage: 'status', spaces: [{failedCount: 0n, staleCount: 2n}]}).kind, 'flag');
  assert.deepEqual(decideSemanticIndex({stage: 'retry', record_status: 'ready', latest: {status: 'queued', jobId: 'job'}}), {kind: 'reuseJob', summary: {status: 'queued', jobId: 'job'}, should_start: true});
  assert.deepEqual(decideSemanticIndex({stage: 'retry', record_status: 'pending', latest: {status: 'succeeded'}}), {kind: 'queueJob'});
  assert.equal(retainedEmbeddingJob('ready', {status: 'succeeded'}), false);
});

test('semantic-index lifecycle and reconciliation preserve original rejection and repair boundaries', () => {
  assert.deepEqual(decideSemanticIndex({stage: 'running', changed: 2n}), {kind: 'rejected', message: 'embedding job 不可运行'});
  assert.deepEqual(decideSemanticIndex({stage: 'activate', status: 'building', pending: 0n}), {kind: 'flag', value: true});
  assert.deepEqual(decideSemanticIndex({stage: 'space', exists: false}), {kind: 'rejected', message: '找不到 embedding space'});
  assert.deepEqual(decideSemanticIndex({stage: 'reconcileRecord', record: {inputSha256: 'a', status: 'ready'}, stored: null}), {kind: 'reconcile', action: {kind: 'missing', count_repaired: true}});
  assert.deepEqual(decideSemanticIndex({stage: 'reconcileRecord', record: {inputSha256: 'a', status: 'running'}, stored: {inputSha256: 'a', dataset_version: 3n, vector_norm_bits: 7}}), {kind: 'reconcile', action: {kind: 'complete', dataset_version: 3n, vector_norm_bits: 7}});
});
