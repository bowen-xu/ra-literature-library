import assert from 'node:assert/strict';
import test from 'node:test';
import {decodePayload, encodePayload} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/paper-context-wire/codec.js';
import {IndexDecisionV1Serde, IndexInputV1Serde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/semantic-index/rules.js';
import {decideSemanticIndex, decideSemanticIndexWire, retainedEmbeddingJob} from './semantic-index.mts';

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

test('semantic-index wire rule decodes the CBOR request and returns a matching decision', () => {
  const input = {stage: 'status' as const, spaces: [{embeddingSpaceId: 'space', providerId: 'provider', modelId: 'model', modelRevision: 'r1', dimension: 3n, generation: 1n, generationStatus: 'active', namespace: 'accepted_concepts', readyCount: 0n, pendingCount: 0n, failedCount: 0n, staleCount: 1n}]};
  const cborBase64 = encodePayload(input, IndexInputV1Serde);
  const output = decideSemanticIndexWire({cborBase64});
  assert.equal(output.input.cborBase64, cborBase64);
  assert.deepEqual(decodePayload(output.decisionCborBase64, IndexDecisionV1Serde), {kind: 'flag', value: true});
});
